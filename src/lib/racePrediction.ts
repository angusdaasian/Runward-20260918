import { calculateRunningScore, predictTime } from "./vdot";

export interface PB {
  distance: string;
  hours: number;
  minutes: number;
  seconds: number;
  race_date?: string | null;
}

export interface ScoringActivity {
  start_date: string;
  distance: number;
  moving_time: number;
  sport_type?: string;
}

const DISTANCE_TO_METERS: Record<string, number> = {
  "1500m": 1500,
  "1 Mile": 1609.34,
  "3000m": 3000,
  "3K": 3000,
  "5K": 5000,
  "10K": 10000,
  "Half Marathon": 21097.5,
  "Marathon": 42195,
};

/** Age-decay a PB VDOT. Half-life ~ 12 months. */
function pbAgeDecay(raceDate: string | null | undefined): number {
  if (!raceDate) return 0.85; // unknown age → mild penalty
  const t = new Date(raceDate).getTime();
  if (!isFinite(t)) return 0.85;
  const days = Math.max(0, (Date.now() - t) / 86400000);
  // Half-life 365d, but never below 0.5.
  const decay = Math.pow(0.5, days / 365);
  return Math.max(0.5, decay);
}

export interface AnchorPB {
  meters: number;
  timeSec: number;
  rawScore: number;
  decayedScore: number;
  ageDays: number | null;
}

/**
 * Returns the best anchor PB after age-decay is applied. This is what we use
 * both to build the fitness score AND as the Riegel anchor.
 */
export function bestAnchorPb(pbs: PB[]): AnchorPB | null {
  let best: AnchorPB | null = null;
  for (const pb of pbs) {
    const meters = DISTANCE_TO_METERS[pb.distance];
    if (!meters) continue;
    const totalSec = pb.hours * 3600 + pb.minutes * 60 + pb.seconds;
    if (totalSec <= 0) continue;
    const raw = calculateRunningScore(meters, totalSec);
    if (!isFinite(raw) || raw <= 0) continue;
    const decay = pbAgeDecay(pb.race_date);
    const decayed = raw * decay;
    const ageDays = pb.race_date
      ? Math.max(0, (Date.now() - new Date(pb.race_date).getTime()) / 86400000)
      : null;
    if (!best || decayed > best.decayedScore) {
      best = { meters, timeSec: totalSec, rawScore: raw, decayedScore: decayed, ageDays };
    }
  }
  return best;
}

/** Back-compat: age-decayed best PB VDOT (used by callers that just want a number). */
export function bestPbScore(pbs: PB[]): number | null {
  return bestAnchorPb(pbs)?.decayedScore ?? null;
}

/** p-th percentile of a numeric array (0..1). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

/**
 * Effort-weighted recent VDOT from the last `days` days.
 *
 * Uses p90 of quality efforts as the intensity ceiling (was max, which let a
 * single interval workout inflate the entire fitness score).
 */
export function recentVdot(activities: ScoringActivity[], days = 30): number | null {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const runs: Array<{ score: number; km: number }> = [];
  for (const a of activities) {
    const t = new Date(a.start_date).getTime();
    if (!isFinite(t) || t < cutoff) continue;
    if (a.sport_type && !/run/i.test(a.sport_type)) continue;
    if (!a.distance || a.distance < 1500) continue;
    if (!a.moving_time || a.moving_time < 300) continue;
    const score = calculateRunningScore(a.distance, a.moving_time);
    if (!isFinite(score) || score < 5 || score > 100) continue;
    runs.push({ score, km: a.distance / 1000 });
  }
  if (runs.length === 0) return null;

  const scores = runs.map((r) => r.score).sort((a, b) => a - b);
  const ceiling = percentile(scores, 0.9);
  if (ceiling <= 0) return null;

  let weighted = 0;
  let totalWeight = 0;
  for (const r of runs) {
    const intensity = r.score / ceiling;
    const base = Math.max(0, (Math.min(1.05, intensity) - 0.85) / 0.15);
    const distFactor = Math.min(1, r.km / 5);
    const weight = base * base * distFactor;
    if (weight <= 0) continue;
    weighted += weight * r.score;
    totalWeight += weight;
  }
  if (totalWeight < 0.3) return null;
  const raw = weighted / totalWeight;
  // Cap recent VDOT at the p90 ceiling — training efforts should never
  // extrapolate above the runner's own best observed effort.
  return Math.min(raw, ceiling);
}

/**
 * Fitness Score for race prediction.
 *   fitness = 0.55 × decayedPbVdot + 0.45 × recentTrainingVdot
 * Falls back to whichever side is available.
 */
export function effectiveVdot(
  recentScore: number | null,
  pbScore: number | null,
): number | null {
  const r = recentScore && recentScore > 0 ? recentScore : null;
  const pb = pbScore && pbScore > 0 ? pbScore : null;
  if (r && pb) return pb * 0.55 + r * 0.45;
  return pb ?? r ?? null;
}

// ---------- Volume & long-run derived Riegel exponent ----------

export interface VolumeStats {
  weeklyKm4wk: number;
  longestRunKm90d: number;
  sessions4wk: number;
}

export function volumeStats(activities: ScoringActivity[]): VolumeStats {
  const now = Date.now();
  const c4w = now - 28 * 86400000;
  const c90 = now - 90 * 86400000;
  let dist4w = 0;
  let sessions = 0;
  let longest = 0;
  for (const a of activities) {
    if (a.sport_type && !/run/i.test(a.sport_type)) continue;
    if (!a.distance) continue;
    const t = new Date(a.start_date).getTime();
    if (!isFinite(t)) continue;
    if (t >= c4w) {
      dist4w += a.distance;
      sessions += 1;
    }
    if (t >= c90) {
      longest = Math.max(longest, a.distance);
    }
  }
  return {
    weeklyKm4wk: dist4w / 1000 / 4,
    longestRunKm90d: longest / 1000,
    sessions4wk: sessions,
  };
}

/**
 * Riegel fatigue exponent, adjusted for the runner's actual endurance base.
 * Baseline 1.06 (well-trained). Adds penalty for low weekly volume and for
 * a longest recent run that's short relative to the target distance.
 * Clamped to [1.05, 1.18].
 */
export function riegelExponent(targetMeters: number, vol: VolumeStats): number {
  let k = 1.06;

  // Weekly km penalty (matters more for HM/M).
  const distFactor = Math.min(1, targetMeters / 42195); // 0..1 across 5K→M
  const km = vol.weeklyKm4wk;
  let volPenalty = 0;
  if (km < 20) volPenalty = 0.06;
  else if (km < 30) volPenalty = 0.04;
  else if (km < 45) volPenalty = 0.02;
  else if (km < 60) volPenalty = 0.01;
  k += volPenalty * distFactor;

  // Long-run penalty: how close is longest recent run to target?
  if (targetMeters >= 10000) {
    const ratio = vol.longestRunKm90d / (targetMeters / 1000);
    if (ratio < 0.3) k += 0.04;
    else if (ratio < 0.5) k += 0.02;
    else if (ratio < 0.7) k += 0.01;
  }

  return Math.max(1.05, Math.min(1.18, k));
}

// ---------- Weather (WBGT-based, distance-scaled) ----------

/**
 * Approximate WBGT (Wet Bulb Globe Temperature, outdoor sun) from ambient
 * temperature and relative humidity. Uses the Australian Bureau of Meteorology
 * simplified formula, which is good enough for race-day slowdown.
 *   WBGT ≈ 0.567·T + 0.393·e + 3.94
 *   e = rh/100 · 6.105 · exp(17.27·T / (237.7 + T))
 */
export function estimateWBGT(tempC: number, humidity: number | null): number {
  const rh = humidity ?? 50;
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  return 0.567 * tempC + 0.393 * e + 3.94;
}

/**
 * Distance-scaled slowdown. Based on Ely et al. 2007 (MSSE) and Tan et al.
 * 2022: performance decays roughly linearly with WBGT above ~10 °C, and the
 * effect grows with race duration.
 *   slowdown = 1 + k(distance) · max(0, WBGT − 10)
 *     k = 0.003 (5K), 0.004 (10K), 0.006 (HM), 0.008 (Marathon)
 */
export function weatherSlowdown(
  tempC: number | null,
  humidity: number | null,
  meters: number = 21097.5,
): number {
  if (tempC === null || tempC === undefined) return 1;
  const wbgt = estimateWBGT(tempC, humidity);
  // Threshold nudged up to 12 °C — most trained runners are unaffected below this.
  const excess = Math.max(0, wbgt - 12);

  // Ely et al. 2007 / Tan et al. 2022 field data: ~2 % slowdown at WBGT ~20 for
  // HM, ~5–6 % at WBGT 25. Previous coefficients (0.006 HM / 0.008 M) roughly
  // doubled published values — recalibrated below.
  let k: number;
  if (meters <= 5500) k = 0.0015;
  else if (meters <= 12000) k = 0.0022;
  else if (meters <= 25000) k = 0.0035;
  else k = 0.005;

  // Cap slowdown at +8 % (races in extreme heat still don't blow up by 15 %).
  return Math.min(1.08, 1 + k * excess);
}

// ---------- Freshness ----------

/**
 * TSB (Training Stress Balance) adjustment.
 *   ATL >> CTL → tired → run slower
 *   ATL << CTL → fresh → small bonus (peaked/tapered)
 * Adjustment kept modest: ±3%.
 */
export function freshnessAdj(tsb: number | null | undefined): number {
  if (tsb === null || tsb === undefined || !isFinite(tsb)) return 1;
  // TSB in TRIMP units. Negative TSB after a hard race is a transient state
  // that shouldn't be modelled as race-day form — cap the fatigue penalty at
  // +1 %, and give up to +2 % for well-tapered runners.
  const raw = 1 - tsb / 1200;
  return Math.max(0.98, Math.min(1.01, raw));
}

/**
 * Best recent race-quality effort at (or near) the target distance. Used as
 * a direct anchor so a recent time trial / race dominates the prediction for
 * that specific distance.
 *
 * Distance band: 85 % – 130 % of target. Look-back: 90 days.
 */
export function bestRecentEffortAt(
  activities: ScoringActivity[],
  targetMeters: number,
  days = 90,
): AnchorPB | null {
  const cutoff = Date.now() - days * 86400000;
  let best: AnchorPB | null = null;
  for (const a of activities) {
    if (a.sport_type && !/run|treadmill/i.test(a.sport_type)) continue;
    if (!a.distance || !a.moving_time) continue;
    const t = new Date(a.start_date).getTime();
    if (!isFinite(t) || t < cutoff) continue;
    if (a.distance < targetMeters * 0.85 || a.distance > targetMeters * 1.3) continue;
    const score = calculateRunningScore(a.distance, a.moving_time);
    if (!isFinite(score) || score < 20 || score > 90) continue;
    const ageDays = (Date.now() - t) / 86400000;
    if (!best || score > best.rawScore) {
      best = {
        meters: a.distance,
        timeSec: a.moving_time,
        rawScore: score,
        decayedScore: score,
        ageDays,
      };
    }
  }
  return best;
}

// ---------- Prediction ----------

export interface RacePrediction {
  meters: number;
  baseTime: number;      // formula prediction before weather/freshness
  adjustedTime: number;  // final prediction
  delta: number;         // adjustedTime − baseTime (positive = slower)
  method: "blended" | "vdot" | "riegel";
  exponent?: number;
}

export interface PredictInputs {
  vdot: number;
  meters: number;
  anchor?: AnchorPB | null;
  /**
   * Best recent effort at (or very near) this specific target distance.
   * When present, dominates the prediction — a recent 1:50 HM should predict
   * a ~1:50 HM, not a VDOT-blended estimate driven by short-distance PBs.
   */
  directEffort?: AnchorPB | null;
  vol?: VolumeStats;
  slowdown?: number;
  freshness?: number;
}

/**
 * Prediction preference order:
 *   1. Recent effort at the same distance (directEffort) — trumps everything
 *      but is Riegel-scaled to the exact target and lightly blended (75/25)
 *      with the VDOT estimate to guard against a single fluke.
 *   2. Otherwise: blended Daniels VDOT + Riegel-from-PB with volume-adjusted
 *      exponent. Endurance races (≥10K) take the SLOWER of the two.
 */
export function predictRace(input: PredictInputs | number, ...rest: any[]): RacePrediction {
  // Back-compat: old signature predictRace(vdot, meters, slowdown)
  let vdot: number;
  let meters: number;
  let anchor: AnchorPB | null = null;
  let directEffort: AnchorPB | null = null;
  let vol: VolumeStats | undefined;
  let slowdown = 1;
  let freshness = 1;

  if (typeof input === "number") {
    vdot = input;
    meters = rest[0];
    slowdown = rest[1] ?? 1;
  } else {
    vdot = input.vdot;
    meters = input.meters;
    anchor = input.anchor ?? null;
    directEffort = input.directEffort ?? null;
    vol = input.vol;
    slowdown = input.slowdown ?? 1;
    freshness = input.freshness ?? 1;
  }

  const vdotTime = predictTime(vdot, meters);
  let baseTime = vdotTime;
  let method: RacePrediction["method"] = "vdot";
  let exponent: number | undefined;

  if (directEffort) {
    // Scale the recent effort to the exact target distance with a mild
    // Riegel exponent. If the effort *is* the target distance this is
    // essentially just that time.
    const exp = vol ? riegelExponent(meters, vol) : 1.06;
    const scaled =
      directEffort.timeSec * Math.pow(meters / directEffort.meters, exp);
    // 75 % recent effort / 25 % VDOT estimate as a sanity blend.
    baseTime = 0.75 * scaled + 0.25 * vdotTime;
    method = "blended";
    exponent = exp;
  } else if (anchor && vol) {
    exponent = riegelExponent(meters, vol);
    const riegelTime = anchor.timeSec * Math.pow(meters / anchor.meters, exponent);

    if (meters >= 10000) {
      // Endurance races: use the more conservative of the two.
      baseTime = Math.max(vdotTime, riegelTime);
      method = "blended";
    } else {
      // Short races: 50/50 blend.
      baseTime = (vdotTime + riegelTime) / 2;
      method = "blended";
    }
  }



  const adjustedTime = baseTime * slowdown * freshness;
  return {
    meters,
    baseTime,
    adjustedTime,
    delta: adjustedTime - baseTime,
    method,
    exponent,
  };
}

// ---------- Confidence signal ----------

export type Confidence = "high" | "medium" | "low";

export interface ConfidenceInputs {
  hasPb: boolean;
  pbAgeDays: number | null;
  hasRecent: boolean;
  sessions4wk: number;
  weeklyKm4wk: number;
  targetMeters: number;
  longestRunKm90d: number;
}

export function predictionConfidence(i: ConfidenceInputs): Confidence {
  let score = 0;
  if (i.hasPb) score += 2;
  if (i.pbAgeDays !== null && i.pbAgeDays < 180) score += 1;
  if (i.hasRecent) score += 1;
  if (i.sessions4wk >= 12) score += 1;
  if (i.weeklyKm4wk >= 30) score += 1;
  if (i.targetMeters >= 21000 && i.longestRunKm90d >= i.targetMeters / 1000 * 0.6) score += 1;
  if (i.targetMeters < 21000) score += 1; // shorter races are inherently easier to predict
  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

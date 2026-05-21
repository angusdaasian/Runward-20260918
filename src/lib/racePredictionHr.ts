// Deterministic race-time prediction from recent training (no AI).
//
// Method:
// 1. Classify each recent run as Recovery / Easy / Tempo / Threshold / Interval
//    based on the runner's HR zone (using average_heartrate vs HRR-derived
//    zone lower bounds). Falls back to pace-only classification if HR missing.
// 2. For each classified run, compute its velocity and back-solve a VDOT
//    estimate by dividing the run's VO2 demand by the %VO2max typical for
//    that effort type (Daniels).
// 3. Average per-type VDOTs (one per run-type, mean of runs in that bucket
//    within the window), then average across types weighted by reliability
//    (harder efforts weighted more — they're closer to true VDOT).
// 4. Predict race time from the resulting VDOT.

import { calculateRunningScore, predictTime } from "./vdot";

export type RunType = "recovery" | "easy" | "tempo" | "threshold" | "interval";

export interface PredictorActivity {
  start_date: string;
  sport_type?: string | null;
  distance?: number | null;       // meters
  moving_time?: number | null;     // seconds
  elapsed_time?: number | null;    // seconds
  average_heartrate?: number | null;
  workout_type?: string | null;    // optional hint (e.g. "interval")
}

export interface HrZoneBounds {
  z1: number; z2: number; z3: number; z4: number; z5: number;
}

const TYPE_VO2_FACTOR: Record<RunType, number> = {
  recovery: 0.65,
  easy: 0.72,
  tempo: 0.80,
  threshold: 0.86,
  interval: 0.975,
};

const TYPE_LABEL: Record<RunType, { en: string; zh: string }> = {
  recovery:  { en: "Recovery",  zh: "恢復跑" },
  easy:      { en: "Easy",      zh: "輕鬆跑" },
  tempo:     { en: "Tempo",     zh: "節奏跑" },
  threshold: { en: "Threshold", zh: "乳酸閾值" },
  interval:  { en: "Interval",  zh: "間歇" },
};

export function typeLabel(t: RunType, lang: "en" | "zh"): string {
  return TYPE_LABEL[t][lang];
}

function classifyByHr(avgHr: number, b: HrZoneBounds): RunType {
  if (avgHr >= b.z5) return "interval";
  if (avgHr >= b.z4) return "threshold";
  if (avgHr >= b.z3) return "tempo";
  if (avgHr >= b.z2) return "easy";
  return "recovery";
}

/** Heuristic interval detection: short avg distance with very fast pace. */
function looksLikeInterval(a: PredictorActivity, paceSecPerKm: number): boolean {
  const km = (a.distance ?? 0) / 1000;
  const hint = (a.workout_type || "").toLowerCase();
  if (hint.includes("interval") || hint.includes("repetition")) return true;
  // Short workout (<8km) with very fast avg pace → likely intervals
  if (km > 0 && km < 8 && paceSecPerKm > 0 && paceSecPerKm < 240) return true;
  return false;
}

function classifyByPace(paceSecPerKm: number): RunType {
  // Coarse fallback bands (sec/km)
  if (paceSecPerKm >= 390) return "recovery";   // > 6:30
  if (paceSecPerKm >= 330) return "easy";       // 5:30–6:30
  if (paceSecPerKm >= 285) return "tempo";      // 4:45–5:30
  if (paceSecPerKm >= 255) return "threshold";  // 4:15–4:45
  return "interval";
}

export interface ClassifiedRun {
  date: string;
  type: RunType;
  km: number;
  durationSec: number;
  paceSecPerKm: number;
  vdotEstimate: number;
}

export function classifyAndScore(
  activities: PredictorActivity[],
  hrBounds: HrZoneBounds | null,
  windowDays = 30,
): ClassifiedRun[] {
  const cutoff = Date.now() - windowDays * 86400 * 1000;
  const out: ClassifiedRun[] = [];
  for (const a of activities) {
    const sport = (a.sport_type || "").toLowerCase();
    if (sport && !sport.includes("run") && sport !== "treadmill") continue;
    const t = a.start_date ? new Date(a.start_date).getTime() : NaN;
    if (!isFinite(t) || t < cutoff) continue;
    const dist = a.distance || 0;
    const dur = a.moving_time || a.elapsed_time || 0;
    if (dist < 1500 || dur < 300) continue;
    const km = dist / 1000;
    const paceSecPerKm = dur / km;

    let type: RunType;
    if (hrBounds && a.average_heartrate && a.average_heartrate > 60) {
      type = classifyByHr(a.average_heartrate, hrBounds);
      // Override to interval if it really walks like one
      if (type !== "interval" && looksLikeInterval(a, paceSecPerKm)) type = "interval";
    } else {
      type = looksLikeInterval(a, paceSecPerKm) ? "interval" : classifyByPace(paceSecPerKm);
    }

    // Back-solve VDOT: VO2_at_velocity / %VO2max_for_type
    const minutes = dur / 60;
    const velocity = dist / minutes; // m/min
    const vo2 = -4.60 + 0.182258 * velocity + 0.000104 * velocity * velocity;
    const factor = TYPE_VO2_FACTOR[type];
    const vdotEstimate = vo2 / factor;
    if (!isFinite(vdotEstimate) || vdotEstimate < 20 || vdotEstimate > 90) continue;

    out.push({
      date: a.start_date,
      type,
      km,
      durationSec: dur,
      paceSecPerKm,
      vdotEstimate,
    });
  }
  return out;
}

// Reliability weight per run-type bucket. Harder efforts → closer to true VDOT.
const TYPE_RELIABILITY: Record<RunType, number> = {
  recovery: 0.4,
  easy: 0.8,
  tempo: 1.2,
  threshold: 1.5,
  interval: 1.6,
};

export interface AggregatedVdot {
  vdot: number;
  byType: Partial<Record<RunType, { count: number; avgVdot: number; avgPaceSecPerKm: number }>>;
  totalRuns: number;
}

export function aggregateVdot(runs: ClassifiedRun[]): AggregatedVdot | null {
  if (runs.length === 0) return null;
  const buckets = new Map<RunType, ClassifiedRun[]>();
  for (const r of runs) {
    const list = buckets.get(r.type) || [];
    list.push(r);
    buckets.set(r.type, list);
  }
  const byType: AggregatedVdot["byType"] = {};
  let weighted = 0;
  let totalWeight = 0;
  for (const [type, list] of buckets) {
    const avgVdot = list.reduce((s, r) => s + r.vdotEstimate, 0) / list.length;
    const avgPace = list.reduce((s, r) => s + r.paceSecPerKm, 0) / list.length;
    byType[type] = { count: list.length, avgVdot, avgPaceSecPerKm: avgPace };
    const w = TYPE_RELIABILITY[type] * Math.min(3, list.length);
    weighted += w * avgVdot;
    totalWeight += w;
  }
  if (totalWeight <= 0) return null;
  return { vdot: weighted / totalWeight, byType, totalRuns: runs.length };
}

export const DISTANCE_METERS: Record<string, number> = {
  "5K": 5000,
  "10K": 10000,
  "HM": 21097.5,
  "FM": 42195,
};

export interface PredictionResult {
  vdot: number;
  predictedSec: number;
  totalRuns: number;
  byType: AggregatedVdot["byType"];
}

export function predictRaceFromActivities(
  activities: PredictorActivity[],
  hrBounds: HrZoneBounds | null,
  distanceKey: string,
  windowDays = 30,
): PredictionResult | null {
  const meters = DISTANCE_METERS[distanceKey];
  if (!meters) return null;
  const runs = classifyAndScore(activities, hrBounds, windowDays);
  const agg = aggregateVdot(runs);
  if (!agg) return null;
  const predictedSec = predictTime(agg.vdot, meters);
  return {
    vdot: agg.vdot,
    predictedSec,
    totalRuns: agg.totalRuns,
    byType: agg.byType,
  };
}

// Re-export for convenience
export { calculateRunningScore };

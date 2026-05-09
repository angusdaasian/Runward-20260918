import { calculateRunningScore, predictTime } from "./vdot";

export interface PB {
  distance: string;
  hours: number;
  minutes: number;
  seconds: number;
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

export function bestPbScore(pbs: PB[]): number | null {
  let best: number | null = null;
  for (const pb of pbs) {
    const meters = DISTANCE_TO_METERS[pb.distance];
    if (!meters) continue;
    const totalSec = pb.hours * 3600 + pb.minutes * 60 + pb.seconds;
    if (totalSec <= 0) continue;
    const score = calculateRunningScore(meters, totalSec);
    if (!isFinite(score) || score <= 0) continue;
    if (best === null || score > best) best = score;
  }
  return best;
}

/**
 * Effort-weighted recent VDOT from the last `days` days.
 *
 * Easy runs naturally produce a low raw VDOT and would crater the average.
 * We weight each run by how close its raw VDOT is to the runner's own ceiling
 * within the window — only quality efforts contribute meaningfully.
 *
 *   intensity = rawVdot / maxRawVdotInWindow
 *   weight    = max(0, (intensity − 0.85) / 0.15)^2  × min(1, distance_km / 5)
 *
 * Returns null if no quality efforts are present (Σweight < 0.3).
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

  const ceiling = runs.reduce((m, r) => Math.max(m, r.score), 0);
  if (ceiling <= 0) return null;

  let weighted = 0;
  let totalWeight = 0;
  for (const r of runs) {
    const intensity = r.score / ceiling;
    const base = Math.max(0, (intensity - 0.85) / 0.15);
    const distFactor = Math.min(1, r.km / 5);
    const weight = base * base * distFactor;
    if (weight <= 0) continue;
    weighted += weight * r.score;
    totalWeight += weight;
  }
  if (totalWeight < 0.3) return null;
  return weighted / totalWeight;
}

/**
 * Fitness Score for race prediction.
 *   fitness = 0.7 × pbVdot + 0.3 × recentTrainingVdot
 * Falls back to whichever side is available.
 */
export function effectiveVdot(
  recentScore: number | null,
  pbScore: number | null
): number | null {
  const r = recentScore && recentScore > 0 ? recentScore : null;
  const pb = pbScore && pbScore > 0 ? pbScore : null;
  if (r && pb) return pb * 0.7 + r * 0.3;
  return pb ?? r ?? null;
}

/**
 * Heat index ≈ temperature with humidity bump.
 * Returns slowdown multiplier applied to predicted time.
 */
export function weatherSlowdown(tempC: number | null, humidity: number | null): number {
  if (tempC === null || tempC === undefined) return 1;
  const h = humidity ?? 50;
  const humidityBump = tempC >= 20 ? Math.max(0, (h - 40) / 60) * 4 : 0;
  const apparent = tempC + humidityBump;

  if (apparent < 13) return 1.0;
  if (apparent < 18) return 1.0;
  if (apparent < 22) return 1.01;
  if (apparent < 26) return 1.02;
  if (apparent < 30) return 1.04;
  if (apparent < 34) return 1.07;
  return 1.1;
}

export interface RacePrediction {
  meters: number;
  baseTime: number;
  adjustedTime: number;
  delta: number;
}

export function predictRace(vdot: number, meters: number, slowdown: number): RacePrediction {
  const baseTime = predictTime(vdot, meters);
  const adjustedTime = baseTime * slowdown;
  return { meters, baseTime, adjustedTime, delta: adjustedTime - baseTime };
}

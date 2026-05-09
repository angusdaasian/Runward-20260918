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
 * Recent fitness VDOT — best running score from activities in the last `days` days.
 * Activity must be a run of at least 1.5 km and 5 minutes for the score to be meaningful.
 */
export function recentVdot(activities: ScoringActivity[], days = 90): number | null {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  let best: number | null = null;
  for (const a of activities) {
    const t = new Date(a.start_date).getTime();
    if (!isFinite(t) || t < cutoff) continue;
    if (a.sport_type && !/run/i.test(a.sport_type)) continue;
    if (!a.distance || a.distance < 1500) continue;
    if (!a.moving_time || a.moving_time < 300) continue;
    const score = calculateRunningScore(a.distance, a.moving_time);
    if (!isFinite(score) || score < 5 || score > 100) continue;
    if (best === null || score > best) best = score;
  }
  return best;
}

/**
 * Effective VDOT for race prediction.
 * Prefer recent fitness; fall back to stored training_score; PBs only adjust when current.
 *
 * Weights:
 *  - recent VDOT (last 90d) carries 70%
 *  - PB carries 30% (likely older, less reliable for current fitness)
 *  - if no recent runs, fall back to stored training_score, then PB
 */
export function effectiveVdot(
  recentScore: number | null,
  trainingScore: number | null,
  pbScore: number | null
): number | null {
  const r = recentScore && recentScore > 0 ? recentScore : null;
  const ts = trainingScore && trainingScore > 0 ? trainingScore : null;
  const pb = pbScore && pbScore > 0 ? pbScore : null;

  const current = r ?? ts;
  if (current && pb) return current * 0.5 + pb * 0.5;
  return current ?? pb ?? null;
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

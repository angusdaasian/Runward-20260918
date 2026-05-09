import { calculateRunningScore, predictTime } from "./vdot";

export interface PB {
  distance: string;
  hours: number;
  minutes: number;
  seconds: number;
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
 * Effective VDOT used for prediction.
 * Blends current training score (recent fitness) with best PB-derived VDOT.
 */
export function effectiveVdot(trainingScore: number | null, pbScore: number | null): number | null {
  const ts = trainingScore && trainingScore > 0 ? trainingScore : null;
  const pb = pbScore && pbScore > 0 ? pbScore : null;
  if (ts && pb) return ts * 0.6 + pb * 0.4;
  return ts ?? pb ?? null;
}

/**
 * Heat index ≈ temperature with humidity bump.
 * Returns slowdown multiplier applied to predicted time.
 */
export function weatherSlowdown(tempC: number | null, humidity: number | null): number {
  if (tempC === null || tempC === undefined) return 1;
  // Apparent temperature: add up to +4°C when humidity is high and temp ≥ 20.
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

// ============================================================================
// Unified race-time forecast engine.
//
// One engine, used everywhere (Analytics race predictor, AI program estimated
// race time, on-track check) so all screens always agree.
//
// Method — evidence ensemble. Every usable data point is converted into a
// predicted time for the SAME target distance, then combined by weight:
//
//   1. Race performances (personal bests) — Riegel scaling with a
//      volume-adjusted fatigue exponent, blended with the Daniels VDOT
//      equivalent time (the two models bracket reality: Riegel over-predicts
//      long extrapolations, VDOT is optimistic for under-trained runners).
//   2. Recent race-quality efforts from synced activities (time trials, hard
//      long runs, parkruns) — same conversion, faster recency decay.
//   3. Current training — HR/pace classified runs back-solved to a training
//      VDOT (Daniels %VO2max per effort type).
//
//   Weights: proximity to the target distance × recency decay × source
//   quality. A recent race at the target distance therefore dominates, while
//   an old 5K PB only nudges a marathon estimate.
//
//   4. Endurance guard — for HM/marathon, recreational race time depends
//      strongly on weekly volume and long-run length (Vickers & Vertosick
//      2016; Tanda 2011). When no performance near the target distance
//      exists, a volume shortfall penalty is applied.
//   5. Race-day context — WBGT heat slowdown and training-stress freshness.
// ============================================================================

import { predictTime, calculateRunningScore } from "./vdot";
import {
  bestAnchorPb,
  riegelExponent,
  volumeStats,
  type PB,
  type ScoringActivity,
  type VolumeStats,
} from "./racePrediction";
import {
  aggregateVdot,
  classifyAndScore,
  type AggregatedVdot,
  type HrZoneBounds,
  type PredictorActivity,
} from "./racePredictionHr";

export type EvidenceKind = "pb" | "effort" | "training";

export interface ForecastEvidence {
  kind: EvidenceKind;
  meters: number;
  timeSec: number | null;
  score: number;         // VDOT-equivalent of this evidence
  predictedSec: number;  // its own prediction for the target distance
  weight: number;
  ageDays: number | null;
  date?: string | null;
}

export interface RaceForecast {
  meters: number;
  /** Blended fitness (VDOT-equivalent) score. */
  vdot: number;
  /** Prediction before weather / freshness. */
  baseSec: number;
  /** Final prediction. */
  predictedSec: number;
  /** predictedSec − baseSec (positive = slower because of heat/fatigue). */
  delta: number;
  exponent: number;
  evidence: ForecastEvidence[];
  volume: VolumeStats;
  endurancePenalty: number;
  confidence: "high" | "medium" | "low";
  /** Training-run breakdown (for the AI program card). */
  trainingRuns: number;
  byType: AggregatedVdot["byType"];
}

const PB_DISTANCE_METERS: Record<string, number> = {
  "1500m": 1500,
  "1 Mile": 1609.34,
  "3000m": 3000,
  "3K": 3000,
  "5K": 5000,
  "10K": 10000,
  "Half Marathon": 21097.5,
  "Marathon": 42195,
};

const DAY = 86400000;

/** Recency weight with a per-source half-life, floored so old data still counts. */
function recency(ageDays: number | null, halfLifeDays: number, floor = 0.25): number {
  if (ageDays === null) return 0.6;
  return Math.max(floor, Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays));
}

/**
 * How relevant a performance at `meters` is for predicting `target`.
 * 1.0 at the same distance, decaying with the log-distance gap. Extrapolating
 * UP (5K → marathon) is penalised harder than down.
 */
function proximity(meters: number, target: number): number {
  const ratio = Math.log(target / meters);
  const k = ratio > 0 ? 1.35 : 1.0;
  return Math.exp(-Math.abs(ratio) * k);
}

/** Convert one performance into a predicted time for the target distance. */
function performanceToPrediction(
  meters: number,
  timeSec: number,
  target: number,
  exponent: number,
): { predictedSec: number; score: number } {
  const score = calculateRunningScore(meters, timeSec);
  const riegel = timeSec * Math.pow(target / meters, exponent);
  const vdotTime = predictTime(score, target);
  const sameDistance = Math.abs(Math.log(target / meters)) < 0.05;
  // Same distance → trust the actual time. Extrapolating up → take the more
  // conservative model. Otherwise blend.
  let predictedSec: number;
  if (sameDistance) predictedSec = 0.85 * timeSec * (target / meters) + 0.15 * vdotTime;
  else if (target > meters) predictedSec = Math.max(riegel, vdotTime) * 0.6 + Math.min(riegel, vdotTime) * 0.4;
  else predictedSec = (riegel + vdotTime) / 2;
  return { predictedSec, score };
}

/**
 * Best race-quality efforts found in synced activities, one per distance
 * bucket, within `days`. These stand in for un-logged races / time trials.
 */
function bestEffortsByBucket(
  activities: ScoringActivity[],
  days: number,
): Array<{ meters: number; timeSec: number; ageDays: number; date: string; score: number }> {
  const cutoff = Date.now() - days * DAY;
  const buckets = new Map<number, { meters: number; timeSec: number; ageDays: number; date: string; score: number }>();
  for (const a of activities) {
    if (a.sport_type && !/run|treadmill/i.test(a.sport_type)) continue;
    if (!a.distance || !a.moving_time) continue;
    if (a.distance < 3000 || a.moving_time < 600) continue;
    const t = new Date(a.start_date).getTime();
    if (!isFinite(t) || t < cutoff) continue;
    const score = calculateRunningScore(a.distance, a.moving_time);
    if (!isFinite(score) || score < 15 || score > 90) continue;
    // Bucket by log distance (~ half-octave bands) so a 21.4 km and a 21.1 km
    // effort compete with each other, not with a 10 km.
    const bucket = Math.round(Math.log(a.distance / 1000) / 0.35);
    const prev = buckets.get(bucket);
    if (!prev || score > prev.score) {
      buckets.set(bucket, {
        meters: a.distance,
        timeSec: a.moving_time,
        ageDays: (Date.now() - t) / DAY,
        date: a.start_date,
        score,
      });
    }
  }
  return [...buckets.values()];
}

/**
 * Endurance guard. Recreational HM/marathon times track weekly volume and
 * long-run length closely; without a performance near the target distance a
 * short-race-derived estimate is optimistic.
 */
function endurancePenalty(target: number, vol: VolumeStats, hasNearPerformance: boolean): number {
  if (target < 15000 || hasNearPerformance) return 1;
  const needWeekly = target >= 30000 ? 55 : 35;
  const needLong = target >= 30000 ? 28 : 16;
  const weeklyShort = Math.max(0, (needWeekly - vol.weeklyKm4wk) / needWeekly);
  const longShort = Math.max(0, (needLong - vol.longestRunKm90d) / needLong);
  const penalty = 1 + weeklyShort * 0.07 + longShort * 0.05;
  return Math.min(1.12, penalty);
}

export interface ForecastInput {
  activities: (ScoringActivity & PredictorActivity)[];
  targetMeters: number;
  pbs?: PB[];
  hrBounds?: HrZoneBounds | null;
  /** Weather slowdown multiplier (1 = none). */
  slowdown?: number;
  /** Freshness / TSB multiplier (1 = neutral). */
  freshness?: number;
  /** Look-back for training-derived fitness. */
  trainingWindowDays?: number;
}

export function buildRaceForecast(input: ForecastInput): RaceForecast | null {
  const {
    activities = [],
    targetMeters,
    pbs = [],
    hrBounds = null,
    slowdown = 1,
    freshness = 1,
    trainingWindowDays = 42,
  } = input;
  if (!targetMeters || targetMeters <= 0) return null;

  const vol = volumeStats(activities as ScoringActivity[]);
  const exponent = riegelExponent(targetMeters, vol);
  const evidence: ForecastEvidence[] = [];

  // 1. Logged personal bests (races).
  for (const pb of pbs) {
    const meters = PB_DISTANCE_METERS[pb.distance];
    if (!meters) continue;
    const timeSec = pb.hours * 3600 + pb.minutes * 60 + pb.seconds;
    if (timeSec <= 0) continue;
    const ageDays = pb.race_date ? Math.max(0, (Date.now() - new Date(pb.race_date).getTime()) / DAY) : null;
    const { predictedSec, score } = performanceToPrediction(meters, timeSec, targetMeters, exponent);
    if (!isFinite(predictedSec) || predictedSec <= 0) continue;
    evidence.push({
      kind: "pb",
      meters,
      timeSec,
      score,
      predictedSec,
      ageDays,
      date: pb.race_date ?? null,
      weight: proximity(meters, targetMeters) * recency(ageDays, 365) * 1,
    });
  }

  // 2. Best recent efforts from synced activities.
  for (const e of bestEffortsByBucket(activities as ScoringActivity[], 180)) {
    const { predictedSec, score } = performanceToPrediction(e.meters, e.timeSec, targetMeters, exponent);
    if (!isFinite(predictedSec) || predictedSec <= 0) continue;
    evidence.push({
      kind: "effort",
      meters: e.meters,
      timeSec: e.timeSec,
      score,
      predictedSec,
      ageDays: e.ageDays,
      date: e.date,
      weight: proximity(e.meters, targetMeters) * recency(e.ageDays, 120) * 0.85,
    });
  }

  // 3. Current training (HR / pace classified).
  const runs = classifyAndScore(activities as PredictorActivity[], hrBounds, trainingWindowDays);
  const agg = aggregateVdot(runs);
  if (agg) {
    const predictedSec = predictTime(agg.vdot, targetMeters);
    if (isFinite(predictedSec) && predictedSec > 0) {
      evidence.push({
        kind: "training",
        meters: targetMeters,
        timeSec: null,
        score: agg.vdot,
        predictedSec,
        ageDays: 0,
        weight: 0.9 * Math.min(1, agg.totalRuns / 8),
      });
    }
  }

  const usable = evidence.filter((e) => e.weight > 0.02);
  if (usable.length === 0) return null;

  const totalWeight = usable.reduce((s, e) => s + e.weight, 0);
  const blendedSec = usable.reduce((s, e) => s + e.weight * e.predictedSec, 0) / totalWeight;
  const blendedScore = usable.reduce((s, e) => s + e.weight * e.score, 0) / totalWeight;

  const hasNearPerformance = usable.some(
    (e) => e.kind !== "training" && e.meters >= targetMeters * 0.7 && (e.ageDays ?? 999) <= 365,
  );
  const penalty = endurancePenalty(targetMeters, vol, hasNearPerformance);
  const baseSec = blendedSec * penalty;
  const predictedSec = baseSec * slowdown * freshness;

  // Confidence.
  let cScore = 0;
  if (usable.some((e) => e.kind !== "training")) cScore += 2;
  if (hasNearPerformance) cScore += 2;
  if (usable.some((e) => e.kind !== "training" && (e.ageDays ?? 999) < 180)) cScore += 1;
  if (agg && agg.totalRuns >= 8) cScore += 1;
  if (vol.weeklyKm4wk >= 30) cScore += 1;
  if (targetMeters < 21000) cScore += 1;
  const confidence: RaceForecast["confidence"] = cScore >= 5 ? "high" : cScore >= 3 ? "medium" : "low";

  return {
    meters: targetMeters,
    vdot: blendedScore,
    baseSec,
    predictedSec,
    delta: predictedSec - baseSec,
    exponent,
    evidence: usable.sort((a, b) => b.weight - a.weight),
    volume: vol,
    endurancePenalty: penalty,
    confidence,
    trainingRuns: agg?.totalRuns ?? 0,
    byType: agg?.byType ?? {},
  };
}

/** Convenience: fitness score only (falls back to age-decayed PB). */
export function forecastFitnessScore(input: ForecastInput): number | null {
  const f = buildRaceForecast(input);
  if (f) return f.vdot;
  return bestAnchorPb(input.pbs ?? [])?.decayedScore ?? null;
}

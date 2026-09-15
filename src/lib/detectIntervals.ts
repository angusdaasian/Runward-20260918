/**
 * Smart interval detection.
 *
 * Segments a run into work reps + recoveries directly from per-second
 * distance samples, so irregular sessions (e.g. 5k-4k-3k-2k-1k) are detected
 * even when the watch only recorded fixed 400 m / 1 km auto-laps.
 *
 * Pure functions — no UI, no data-layer dependencies.
 */

export interface DistSample { t: number; d: number }
export interface HrSample { t: number; bpm: number }

export type RepKind = "rep" | "rest" | "warmup" | "cooldown";

export interface DetectedSegment {
  kind: RepKind;
  distance: number;          // meters
  elapsed_time: number;      // seconds
  moving_time: number;
  average_speed: number;     // m/s
  average_heartrate?: number;
  elevation_difference: number;
  split: number;
  isRest?: boolean;
  /** Rounded rep label in meters (e.g. 5000) when the rep is near a round target. */
  roundedDistance?: number;
  repIndex?: number;
}

const SMOOTH_WINDOW_S = 15;
const MIN_REP_M = 200;
const MIN_REP_S = 45;
const MIN_REST_S = 20;
const WARMCOOL_MIN_M = 600;
const MIN_SPREAD = 1.18;
const MIN_REPS = 2;

const ROUND_TARGETS = (() => {
  const t = [200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 1609];
  for (let m = 2000; m <= 20000; m += 500) t.push(m);
  return t.sort((a, b) => a - b);
})();

/** Snap a measured rep distance to a round target when within 4%. */
export function roundRepDistance(meters: number): number | undefined {
  for (const target of ROUND_TARGETS) {
    if (Math.abs(meters - target) / target <= 0.04) return target;
  }
  return undefined;
}

/** Human label for a rep distance, e.g. "5 km", "800 m". */
export function formatRepDistance(meters: number): string {
  if (meters === 1609) return "1 mile";
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function cleanSamples(raw: DistSample[]): DistSample[] {
  const ordered = raw
    .filter((s) => typeof s?.t === "number" && typeof s?.d === "number" && isFinite(s.t) && isFinite(s.d))
    .sort((a, b) => a.t - b.t);
  const out: DistSample[] = [];
  let lastD = -Infinity;
  let lastT = -Infinity;
  for (const s of ordered) {
    if (s.t === lastT) continue;
    const d = Math.max(s.d, lastD === -Infinity ? s.d : lastD);
    out.push({ t: s.t, d });
    lastD = d;
    lastT = s.t;
  }
  return out;
}

/** Smoothed speed (m/s) at each sample index using a centered time window. */
function speedSeries(samples: DistSample[]): number[] {
  const n = samples.length;
  const speeds = new Array<number>(n).fill(0);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const tMin = samples[i].t - SMOOTH_WINDOW_S / 2;
    const tMax = samples[i].t + SMOOTH_WINDOW_S / 2;
    while (lo < i && samples[lo].t < tMin) lo++;
    if (hi < i) hi = i;
    while (hi < n - 1 && samples[hi + 1].t <= tMax) hi++;
    const dt = samples[hi].t - samples[lo].t;
    const dd = samples[hi].d - samples[lo].d;
    speeds[i] = dt > 0 ? Math.max(0, dd / dt) : 0;
  }
  return speeds;
}

/** 1-D Otsu threshold over a value series. */
function otsuThreshold(values: number[]): number {
  const valid = values.filter((v) => v > 0 && isFinite(v));
  if (valid.length < 10) return 0;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max - min < 1e-6) return 0;
  const BINS = 64;
  const hist = new Array<number>(BINS).fill(0);
  for (const v of valid) {
    const idx = Math.min(BINS - 1, Math.floor(((v - min) / (max - min)) * BINS));
    hist[idx]++;
  }
  const total = valid.length;
  let sumAll = 0;
  for (let i = 0; i < BINS; i++) sumAll += i * hist[i];
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let bestBin = 0;
  for (let i = 0; i < BINS; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestBin = i;
    }
  }
  return min + ((bestBin + 1) / BINS) * (max - min);
}

interface Block { fast: boolean; start: number; end: number } // sample indices, inclusive

function buildBlocks(flags: boolean[]): Block[] {
  const blocks: Block[] = [];
  let start = 0;
  for (let i = 1; i <= flags.length; i++) {
    if (i === flags.length || flags[i] !== flags[start]) {
      blocks.push({ fast: flags[start], start, end: i - 1 });
      start = i;
    }
  }
  return blocks;
}

function mergeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.fast === b.fast) last.end = b.end;
    else out.push({ ...b });
  }
  return out;
}

export interface DetectIntervalsResult {
  segments: DetectedSegment[];
  repCount: number;
}

export function detectIntervals(
  distanceSamples: unknown,
  hrSamples: unknown,
): DetectIntervalsResult | null {
  if (!Array.isArray(distanceSamples)) return null;
  const samples = cleanSamples(distanceSamples as DistSample[]);
  if (samples.length < 120) return null;
  const totalD = samples[samples.length - 1].d - samples[0].d;
  if (totalD < 1000) return null;

  const speeds = speedSeries(samples);
  const threshold = otsuThreshold(speeds);
  if (threshold <= 0) return null;

  let flags = speeds.map((v) => v >= threshold);

  // Absorb blocks that are too short to be a real rep / recovery.
  for (let pass = 0; pass < 6; pass++) {
    const blocks = mergeBlocks(buildBlocks(flags));
    let changed = false;
    for (const b of blocks) {
      const dur = samples[b.end].t - samples[b.start].t;
      const dist = samples[b.end].d - samples[b.start].d;
      const tooShort = b.fast ? (dur < MIN_REP_S || dist < MIN_REP_M) : dur < MIN_REST_S;
      if (!tooShort) continue;
      for (let i = b.start; i <= b.end; i++) flags[i] = !b.fast;
      changed = true;
    }
    if (!changed) break;
  }

  const blocks = mergeBlocks(buildBlocks(flags));
  const fastBlocks = blocks.filter((b) => b.fast);
  if (fastBlocks.length < MIN_REPS) return null;

  // Require a genuine pace spread between work and recovery.
  const meanSpeed = (bs: Block[]) => {
    let dd = 0;
    let dt = 0;
    for (const b of bs) {
      dd += samples[b.end].d - samples[b.start].d;
      dt += samples[b.end].t - samples[b.start].t;
    }
    return dt > 0 ? dd / dt : 0;
  };
  const fastMean = meanSpeed(fastBlocks);
  const slowMean = meanSpeed(blocks.filter((b) => !b.fast));
  if (!(fastMean > 0 && slowMean > 0 && fastMean / slowMean >= MIN_SPREAD)) return null;

  const hr = Array.isArray(hrSamples) ? (hrSamples as HrSample[]) : [];
  const avgHrBetween = (t0: number, t1: number): number | undefined => {
    if (!hr.length || t1 <= t0) return undefined;
    let sum = 0;
    let n = 0;
    for (const s of hr) {
      if (typeof s?.t !== "number" || typeof s?.bpm !== "number") continue;
      if (s.t >= t0 && s.t <= t1) { sum += s.bpm; n++; }
    }
    return n > 0 ? sum / n : undefined;
  };

  const lastSlowIdx = (() => {
    for (let i = blocks.length - 1; i >= 0; i--) if (!blocks[i].fast) return i;
    return -1;
  })();

  const segments: DetectedSegment[] = [];
  let repIndex = 0;
  blocks.forEach((b, i) => {
    const t0 = samples[b.start].t;
    const t1 = samples[b.end].t;
    const dist = samples[b.end].d - samples[b.start].d;
    const time = t1 - t0;
    if (time <= 0 || dist <= 0) return;

    let kind: RepKind;
    if (b.fast) {
      kind = "rep";
    } else if (i === 0 && dist >= WARMCOOL_MIN_M) {
      kind = "warmup";
    } else if (i === lastSlowIdx && i === blocks.length - 1 && dist >= WARMCOOL_MIN_M) {
      kind = "cooldown";
    } else {
      kind = "rest";
    }

    if (kind === "rep") repIndex++;

    segments.push({
      kind,
      distance: Math.round(dist),
      elapsed_time: Math.round(time),
      moving_time: Math.round(time),
      average_speed: dist / time,
      average_heartrate: avgHrBetween(t0, t1),
      elevation_difference: 0,
      split: segments.length + 1,
      isRest: kind !== "rep",
      roundedDistance: kind === "rep" ? roundRepDistance(dist) : undefined,
      repIndex: kind === "rep" ? repIndex : undefined,
    });
  });

  const repCount = segments.filter((s) => s.kind === "rep").length;
  if (repCount < MIN_REPS) return null;
  return { segments, repCount };
}

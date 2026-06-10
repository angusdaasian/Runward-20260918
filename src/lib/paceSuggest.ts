// Auto-suggest pace and HR targets for a planned workout type.
//
// Resolution order:
//   1. Past 30 days of running -> best VDOT across distances
//   2. Plan target race time (distance + seconds) -> VDOT via Daniels
//   3. null (no suggestion)
//
// HR (BPM) targets are always derived from profile age + max/resting HR
// using the existing Karvonen %HRR zones in src/lib/hrZones.ts.

import { calculateRunningScore, formatPace } from "@/lib/vdot";
import { estimateMaxHr, estimateRestingHr, zoneBoundaries } from "@/lib/hrZones";

export interface SuggestProfile {
  age?: number | null;
  max_hr?: number | null;
  resting_hr?: number | null;
  custom_zones?: number[] | null;
}

export interface SuggestActivity {
  distance: number;            // meters
  moving_time?: number | null; // seconds
  elapsed_time?: number | null;
  sport_type?: string | null;
  start_date?: string | null;  // ISO
  average_heartrate?: number | null;
}

export interface SuggestInput {
  type: string;                // Easy Run, Tempo Run, Intervals, ...
  profile?: SuggestProfile | null;
  recentActivities?: SuggestActivity[] | null;
  targetTime?: { distance_m: number; seconds: number } | null;
}

export interface PaceHrSuggestion {
  pace?: string | null;          // mm:ss/km, midpoint or single value
  pace_low?: string | null;
  pace_high?: string | null;
  bpm_low?: number | null;
  bpm_high?: number | null;
  zone?: 1 | 2 | 3 | 4 | 5 | null;
  source: "recent" | "target" | "profile" | "none";
}

const RUN_RE = /run/i;

/** Compute a VDOT from the best Daniels Running Score across recent runs (last 30 days). */
export function estimateVdotFromRecent(activities: SuggestActivity[] | null | undefined): number | null {
  if (!activities || activities.length === 0) return null;
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  let best = 0;
  for (const a of activities) {
    if (a.sport_type && !RUN_RE.test(a.sport_type)) continue;
    const t = a.moving_time || a.elapsed_time || 0;
    if (!t || !a.distance || a.distance < 1500) continue;
    if (a.start_date) {
      const ts = Date.parse(a.start_date);
      if (Number.isFinite(ts) && ts < cutoff) continue;
    }
    try {
      const score = calculateRunningScore(a.distance, t);
      if (Number.isFinite(score) && score > best) best = score;
    } catch { /* ignore */ }
  }
  return best > 0 ? best : null;
}

export function vdotFromTargetTime(distance_m: number, seconds: number): number | null {
  if (!distance_m || !seconds) return null;
  try {
    const s = calculateRunningScore(distance_m, seconds);
    return Number.isFinite(s) && s > 0 ? s : null;
  } catch { return null; }
}

// %VO2max bands for each workout type (matches src/lib/vdot.ts conventions).
const TYPE_VO2_BANDS: Record<string, { low: number; high: number; zone: 1 | 2 | 3 | 4 | 5 }> = {
  "Recovery Run":   { low: 0.55, high: 0.65, zone: 1 },
  "Warmup":         { low: 0.55, high: 0.65, zone: 1 },
  "Cooldown":       { low: 0.55, high: 0.65, zone: 1 },
  "Easy Run":       { low: 0.65, high: 0.74, zone: 2 },
  "Long Run":       { low: 0.65, high: 0.78, zone: 2 },
  "Marathon":       { low: 0.75, high: 0.84, zone: 3 },
  "Race Pace":      { low: 0.80, high: 0.88, zone: 3 },
  "Tempo Run":      { low: 0.83, high: 0.88, zone: 4 },
  "Threshold":      { low: 0.83, high: 0.88, zone: 4 },
  "Progression Run":{ low: 0.70, high: 0.86, zone: 3 },
  "Interval":       { low: 0.95, high: 1.00, zone: 5 },
  "Intervals":      { low: 0.95, high: 1.00, zone: 5 },
};

function vo2ToVelocity(vo2: number): number {
  const a = 0.000104, b = 0.182258, c = -4.60 - vo2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 0;
  return (-b + Math.sqrt(disc)) / (2 * a);
}

/** Pace seconds per km for a given fraction of VO2max. */
function paceSecFromVdot(vdot: number, pct: number): number {
  const v = vo2ToVelocity(vdot * pct);
  if (v <= 0) return 0;
  return Math.round(1000 / v * 60);
}

function formatPaceLabel(sec: number): string {
  if (!sec) return "";
  return `${formatPace(sec)}/km`;
}

/** Compute HR range for a zone using the user's profile. */
function hrRangeForZone(zone: 1 | 2 | 3 | 4 | 5, profile: SuggestProfile | null | undefined): { low: number; high: number } | null {
  const maxHr = estimateMaxHr(profile?.age ?? null, profile?.max_hr ?? null);
  const rest = estimateRestingHr(profile?.resting_hr ?? null);
  const b = zoneBoundaries(maxHr, rest, profile?.custom_zones ?? null);
  const lows: Record<1 | 2 | 3 | 4 | 5, number> = { 1: b.z1, 2: b.z2, 3: b.z3, 4: b.z4, 5: b.z5 };
  const highs: Record<1 | 2 | 3 | 4 | 5, number> = { 1: b.z2 - 1, 2: b.z3 - 1, 3: b.z4 - 1, 4: b.z5 - 1, 5: maxHr };
  const low = lows[zone]; const high = highs[zone];
  if (!low || !high || high < low) return null;
  return { low, high };
}

export function suggestPaceAndHr(input: SuggestInput): PaceHrSuggestion {
  const band = TYPE_VO2_BANDS[input.type];
  const profile = input.profile ?? null;

  // 1. recent
  let vdot = estimateVdotFromRecent(input.recentActivities ?? null);
  let source: PaceHrSuggestion["source"] = "recent";

  // 2. target time
  if (!vdot && input.targetTime) {
    vdot = vdotFromTargetTime(input.targetTime.distance_m, input.targetTime.seconds);
    if (vdot) source = "target";
  }

  // Always compute HR range (from profile) when we know the zone.
  const zone = band?.zone ?? null;
  const hr = zone ? hrRangeForZone(zone, profile) : null;

  if (!vdot || !band) {
    return {
      pace: null, pace_low: null, pace_high: null,
      bpm_low: hr?.low ?? null, bpm_high: hr?.high ?? null,
      zone,
      source: vdot ? source : (hr ? "profile" : "none"),
    };
  }

  const fast = paceSecFromVdot(vdot, band.high);
  const slow = paceSecFromVdot(vdot, band.low);
  const mid = Math.round((fast + slow) / 2);

  return {
    pace: formatPaceLabel(mid),
    pace_low: formatPaceLabel(slow),
    pace_high: formatPaceLabel(fast),
    bpm_low: hr?.low ?? null,
    bpm_high: hr?.high ?? null,
    zone,
    source,
  };
}

/** Parse target time string (e.g. "3:45:00") into total seconds. */
export function parseTargetTime(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]); const se = m[3] ? Number(m[3]) : 0;
  if (m[3]) return h * 3600 + mi * 60 + se;
  return h * 60 + mi; // mm:ss for short distances
}

/** Map distance label string to meters. */
const DIST_MAP: Record<string, number> = {
  "marathon": 42195, "full marathon": 42195, "42k": 42195, "42.2k": 42195,
  "half marathon": 21097.5, "half": 21097.5, "21k": 21097.5, "21.1k": 21097.5,
  "15k": 15000, "10k": 10000, "8k": 8000, "5k": 5000, "3k": 3000,
  "1500m": 1500, "1mile": 1609.34, "1 mile": 1609.34, "mile": 1609.34,
};
export function targetTimeFromPlan(distance: string | null | undefined, time: string | null | undefined): { distance_m: number; seconds: number } | null {
  if (!distance || !time) return null;
  const m = DIST_MAP[distance.trim().toLowerCase()];
  const s = parseTargetTime(time);
  if (!m || !s) return null;
  return { distance_m: m, seconds: s };
}

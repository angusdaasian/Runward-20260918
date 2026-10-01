// Pace zones derived from the user's own last-90-day runs: the typical pace
// they hold in each heart rate zone (Z1..Z5). Zone boundaries are the
// midpoints between neighbouring zone paces.
import { estimateMaxHr, estimateRestingHr, isValidCustomZones, ZonePct } from "@/lib/hrZones";

export type ZoneKey = keyof ZonePct;
export const ZONE_KEYS: ZoneKey[] = ["z1", "z2", "z3", "z4", "z5"];

export interface PaceZones {
  /** Typical pace (sec/km) per HR zone. */
  pace: Record<ZoneKey, number>;
  /** Faster bound (sec/km) of each zone; Z1 has no slow bound, Z5 no fast bound. */
  fastBound: Record<ZoneKey, number | null>;
  /** Number of runs that contributed per zone (0 = estimated). */
  samples: Record<ZoneKey, number>;
  runCount: number;
}

interface ProfileLike { age?: number | null; max_heartrate?: number | null; resting_heartrate?: number | null; custom_hr_zones?: number[] | null }

export function hrToZone(bpm: number, profile: ProfileLike | null | undefined): ZoneKey | null {
  if (!isFinite(bpm) || bpm <= 30) return null;
  const custom = profile?.custom_hr_zones;
  if (custom && isValidCustomZones(custom)) {
    if (bpm >= custom[4]) return "z5";
    if (bpm >= custom[3]) return "z4";
    if (bpm >= custom[2]) return "z3";
    if (bpm >= custom[1]) return "z2";
    return "z1";
  }
  const maxHr = estimateMaxHr(profile?.age ?? null, profile?.max_heartrate ?? null);
  const rest = estimateRestingHr(profile?.resting_heartrate ?? null);
  const p = (bpm - rest) / Math.max(1, maxHr - rest);
  if (p < 0.6) return "z1";
  if (p < 0.7) return "z2";
  if (p < 0.8) return "z3";
  if (p < 0.9) return "z4";
  return "z5";
}

const isRun = (t?: string | null) => /run/i.test(t || "");

const median = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Build pace zones from activities in the last 90 days. Uses laps when present. */
export function computePaceZones(activities: any[], profile: ProfileLike | null | undefined): PaceZones | null {
  const cutoff = Date.now() - 90 * 86400_000;
  const buckets: Record<ZoneKey, number[]> = { z1: [], z2: [], z3: [], z4: [], z5: [] };
  let runCount = 0;
  for (const a of activities) {
    if (!isRun(a.sport_type)) continue;
    if (new Date(a.start_date).getTime() < cutoff) continue;
    let used = false;
    const laps = Array.isArray(a.laps) ? a.laps : [];
    for (const lap of laps) {
      const bpm = Number(lap.avg_hr ?? lap.average_hr ?? lap.average_heartrate ?? lap.averageHR) || 0;
      const dist = Number(lap.distance ?? lap.distance_meters) || 0;
      const secs = Number(lap.moving_time ?? lap.elapsed_time ?? lap.duration_seconds) || 0;
      if (bpm <= 30 || dist < 200 || secs <= 0) continue;
      const pace = secs / (dist / 1000);
      if (pace < 150 || pace > 900) continue;
      const z = hrToZone(bpm, profile);
      if (!z) continue;
      // weight by distance in 200m units
      for (let i = 0; i < Math.max(1, Math.round(dist / 200)); i++) buckets[z].push(pace);
      used = true;
    }
    if (!used) {
      const bpm = Number(a.average_heartrate) || 0;
      const speed = Number(a.average_speed) || 0;
      if (bpm > 30 && speed > 0) {
        const pace = 1000 / speed;
        const z = hrToZone(bpm, profile);
        if (z && pace >= 150 && pace <= 900) { buckets[z].push(pace); used = true; }
      }
    }
    if (used) runCount++;
  }

  const known: Partial<Record<ZoneKey, number>> = {};
  ZONE_KEYS.forEach((k) => { if (buckets[k].length) known[k] = median(buckets[k]); });
  const knownIdx = ZONE_KEYS.map((k, i) => (known[k] != null ? i : -1)).filter((i) => i >= 0);
  if (knownIdx.length < 2) return null;

  // Fill gaps: interpolate between known zones, extrapolate ends with avg step.
  const vals: number[] = ZONE_KEYS.map((k) => known[k] ?? NaN);
  const first = knownIdx[0], last = knownIdx[knownIdx.length - 1];
  const step = (vals[last] - vals[first]) / (last - first) || -20;
  for (let i = 0; i < 5; i++) {
    if (!isNaN(vals[i])) continue;
    if (i < first) vals[i] = vals[first] - step * (first - i);
    else if (i > last) vals[i] = vals[last] + step * (i - last);
    else {
      const lo = Math.max(...knownIdx.filter((j) => j < i));
      const hi = Math.min(...knownIdx.filter((j) => j > i));
      vals[i] = vals[lo] + ((vals[hi] - vals[lo]) * (i - lo)) / (hi - lo);
    }
  }
  // Enforce monotonic: each higher zone must be faster (smaller sec/km).
  for (let i = 1; i < 5; i++) if (vals[i] >= vals[i - 1] - 5) vals[i] = vals[i - 1] - 5;

  const pace = {} as Record<ZoneKey, number>;
  const fastBound = {} as Record<ZoneKey, number | null>;
  const samples = {} as Record<ZoneKey, number>;
  ZONE_KEYS.forEach((k, i) => {
    pace[k] = vals[i];
    fastBound[k] = i < 4 ? (vals[i] + vals[i + 1]) / 2 : null;
    samples[k] = buckets[k].length;
  });
  return { pace, fastBound, samples, runCount };
}

/** Bucket a pace (sec/km) into a pace zone. */
export function paceToZone(secPerKm: number, pz: PaceZones): ZoneKey {
  for (let i = 0; i < 4; i++) {
    const fb = pz.fastBound[ZONE_KEYS[i]]!;
    if (secPerKm > fb) return ZONE_KEYS[i];
  }
  return "z5";
}

/** Time-in-zone (seconds) from (pace, seconds) entries. */
export function timeInPaceZones(entries: Array<{ pace: number; seconds: number }>, pz: PaceZones): Record<ZoneKey, number> | null {
  const out: Record<ZoneKey, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let total = 0;
  for (const e of entries) {
    if (!(e.pace > 0) || !(e.seconds > 0)) continue;
    out[paceToZone(e.pace, pz)] += e.seconds;
    total += e.seconds;
  }
  return total > 0 ? out : null;
}

export const fmtPace = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

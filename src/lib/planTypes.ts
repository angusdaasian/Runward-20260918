// Shared types for plan day workouts. Backward-compatible extension of the legacy
// "one workout per day" shape used in training_plans.plan_data.
//
// Consumers that only read day.type/distance_km/pace keep working. New UI and the
// Terra push path use day.sessions when present.

export type WorkoutStepKind = "warmup" | "main" | "cooldown" | "recovery" | "interval";

export interface HrTarget {
  zone?: 1 | 2 | 3 | 4 | 5;
  bpm_low?: number | null;
  bpm_high?: number | null;
}

export interface WorkoutStep {
  kind: WorkoutStepKind;
  distance_km?: number | null;
  duration_s?: number | null;
  pace?: string | null;
  hr_target?: HrTarget | null;
  reps?: number | null;
  note?: string | null;
}

export interface WorkoutSession {
  id: string;
  time_of_day?: string | null; // "AM" | "PM" | free label
  type: string;                // Easy Run, Tempo Run, Intervals, Warmup, Cooldown, Long Run, ...
  title?: string | null;
  distance_km?: number | null;
  pace?: string | null;
  description?: string | null;
  color?: string | null;
  elevation_m?: number | null;
  eph?: number | null;
  hr_target?: HrTarget | null;
  steps?: WorkoutStep[];
}

export interface PlanDayLegacy {
  date?: string | null;
  type?: string | null;
  title?: string | null;
  distance_km?: number | null;
  pace?: string | null;
  description?: string | null;
  color?: string | null;
  elevation_m?: number | null;
  eph?: number | null;
}

export interface PlanDay extends PlanDayLegacy {
  sessions?: WorkoutSession[];
}

export function genSessionId(): string {
  try {
    // crypto.randomUUID may be unavailable in some sandboxes.
    return (globalThis.crypto && "randomUUID" in globalThis.crypto)
      ? globalThis.crypto.randomUUID()
      : `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  } catch {
    return `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  }
}

/** Return effective sessions for a day. When day.sessions is missing, synthesize a single
 *  session from the legacy fields so downstream code can treat both shapes uniformly. */
export function effectiveSessions(day: PlanDay | null | undefined): WorkoutSession[] {
  if (!day) return [];
  if (Array.isArray(day.sessions) && day.sessions.length > 0) return day.sessions;
  if (!day.type && !day.distance_km) return [];
  return [{
    id: "legacy",
    type: day.type || "Run",
    title: day.title || day.type || null,
    distance_km: day.distance_km ?? null,
    pace: day.pace ?? null,
    description: day.description ?? null,
    color: day.color ?? null,
    elevation_m: day.elevation_m ?? null,
    eph: day.eph ?? null,
  }];
}

/** Recompute day-level summary from sessions so legacy readers stay correct. */
export function summarizeDay(sessions: WorkoutSession[]): Pick<PlanDayLegacy, "type" | "distance_km" | "pace" | "description" | "color" | "elevation_m" | "eph" | "title"> {
  if (sessions.length === 0) {
    return { type: null, distance_km: null, pace: null, description: null, color: null, elevation_m: null, eph: null, title: null };
  }
  if (sessions.length === 1) {
    const s = sessions[0];
    return {
      type: s.type, title: s.title ?? s.type,
      distance_km: s.distance_km ?? null,
      pace: s.pace ?? null,
      description: s.description ?? null,
      color: s.color ?? null,
      elevation_m: s.elevation_m ?? null,
      eph: s.eph ?? null,
    };
  }
  const totalKm = sessions.reduce((acc, s) => acc + (Number(s.distance_km) || 0), 0);
  // Pick the "primary" (longest, non warmup/cooldown) session for the summary type.
  const primary = [...sessions]
    .filter((s) => s.type !== "Warmup" && s.type !== "Cooldown")
    .sort((a, b) => (Number(b.distance_km) || 0) - (Number(a.distance_km) || 0))[0] ?? sessions[0];
  const desc = sessions.map((s) => `${s.time_of_day ? `[${s.time_of_day}] ` : ""}${s.type}${s.distance_km ? ` ${s.distance_km}km` : ""}`).join(" + ");
  return {
    type: primary.type,
    title: primary.title ?? primary.type,
    distance_km: totalKm > 0 ? Number(totalKm.toFixed(2)) : null,
    pace: primary.pace ?? null,
    description: desc,
    color: primary.color ?? null,
    elevation_m: primary.elevation_m ?? null,
    eph: primary.eph ?? null,
  };
}

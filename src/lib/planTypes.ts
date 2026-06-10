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
  /** For interval reps: distance per rep in meters (e.g. 800). */
  distance_m?: number | null;
  /** Number of repetitions for interval steps. */
  reps?: number | null;
  /** Recovery between reps, free text e.g. "90s" or "2:00". */
  rest?: string | null;
  duration_s?: number | null;
  pace?: string | null;
  hr_target?: HrTarget | null;
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

export function stepDistanceKm(step: WorkoutStep | null | undefined): number {
  if (!step) return 0;
  if (step.kind === "interval" && step.reps && step.distance_m) {
    return (Number(step.reps) * Number(step.distance_m)) / 1000;
  }
  if (step.distance_km != null) return Number(step.distance_km) || 0;
  if (step.distance_m != null) return (Number(step.distance_m) || 0) / 1000;
  return 0;
}

export function sessionDistanceKm(session: WorkoutSession | null | undefined): number {
  if (!session) return 0;
  const stepTotal = (session.steps ?? []).reduce((acc, step) => acc + stepDistanceKm(step), 0);
  if (stepTotal > 0) return Number(stepTotal.toFixed(2));
  return Number(session.distance_km) || 0;
}

export function sessionPace(session: WorkoutSession | null | undefined): string | null {
  if (!session) return null;
  const steps = session.steps ?? [];
  const intervalPace = steps.find((step) => step.kind === "interval" && step.pace)?.pace;
  const mainPace = steps.find((step) => step.kind === "main" && step.pace)?.pace;
  const firstStepPace = steps.find((step) => step.pace)?.pace;
  return intervalPace ?? mainPace ?? session.pace ?? firstStepPace ?? null;
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
    const totalKm = sessionDistanceKm(s);
    return {
      type: s.type, title: s.title ?? s.type,
      distance_km: totalKm > 0 ? totalKm : (s.distance_km ?? null),
      pace: sessionPace(s),
      description: s.description ?? null,
      color: s.color ?? null,
      elevation_m: s.elevation_m ?? null,
      eph: s.eph ?? null,
    };
  }
  const totalKm = sessions.reduce((acc, s) => acc + sessionDistanceKm(s), 0);
  // Pick the "primary" (longest, non warmup/cooldown) session for the summary type.
  const primary = [...sessions]
    .filter((s) => s.type !== "Warmup" && s.type !== "Cooldown")
    .sort((a, b) => sessionDistanceKm(b) - sessionDistanceKm(a))[0] ?? sessions[0];
  const desc = sessions.map((s) => `${s.time_of_day ? `[${s.time_of_day}] ` : ""}${s.type}${sessionDistanceKm(s) ? ` ${sessionDistanceKm(s)}km` : ""}`).join(" + ");
  return {
    type: primary.type,
    title: primary.title ?? primary.type,
    distance_km: totalKm > 0 ? Number(totalKm.toFixed(2)) : null,
    pace: sessionPace(primary),
    description: desc,
    color: primary.color ?? null,
    elevation_m: primary.elevation_m ?? null,
    eph: primary.eph ?? null,
  };
}

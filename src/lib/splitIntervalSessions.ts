// Structure an Interval workout day as one workout session whose sequence contains
// Warmup + Interval + Cooldown steps.
// Backward-compatible: legacy day-level fields are preserved so older readers keep working,
// while new UI / Terra push consumes day.sessions when present.

export type StepKind = "warmup" | "main" | "cooldown" | "recovery" | "interval";

export interface StepLike {
  kind: StepKind;
  distance_km?: number | null;
  distance_m?: number | null;
  reps?: number | null;
  rest?: string | null;
  pace?: string | null;
  note?: string | null;
}

export interface SessionLike {
  id: string;
  type: string;
  title?: string | null;
  time_of_day?: string | null;
  distance_km?: number | null;
  pace?: string | null;
  description?: string | null;
  color?: string | null;
  elevation_m?: number | null;
  eph?: number | null;
  steps?: StepLike[];
}

export interface DayLike {
  type?: string | null;
  title?: string | null;
  description?: string | null;
  distance_km?: number | null;
  pace?: string | null;
  color?: string | null;
  sessions?: SessionLike[];
  [k: string]: any;
}

const INTERVAL_TYPES = new Set(["Interval", "Intervals"]);

function genId(): string {
  try {
    return globalThis.crypto && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  } catch {
    return `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  }
}

function paceSecPerKm(pace?: string | null): number | null {
  if (!pace) return null;
  const m = /^(\d+)\s*[:']\s*(\d{1,2})/.exec(String(pace).trim());
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return s > 0 ? s : null;
}

function adjustPace(pace: string | null | undefined, mult: number): string | null {
  const sec = paceSecPerKm(pace);
  if (sec == null) return null;
  const adjusted = Math.round(sec * mult);
  const mm = Math.floor(adjusted / 60);
  const ss = String(adjusted % 60).padStart(2, "0");
  return `${mm}:${ss}/km`;
}

function parseIntervals(desc?: string | null): { reps: number; distM: number; rest: string | null } | null {
  if (!desc) return null;
  const repsFirst = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|km)\b/i.exec(desc);
  const distFirst = /(\d+(?:\.\d+)?)\s*(m|km)\s*[x×]\s*(\d+)\b/i.exec(desc);
  if (!repsFirst && !distFirst) return null;
  const reps = repsFirst ? parseInt(repsFirst[1], 10) : parseInt(distFirst![3], 10);
  const val = parseFloat(repsFirst ? repsFirst[2] : distFirst![1]);
  const unit = (repsFirst ? repsFirst[3] : distFirst![2]).toLowerCase();
  const distM = unit === "km" ? val * 1000 : val;
  if (reps < 2 || reps > 30 || distM < 100 || distM > 10000) return null;
  const restM = /(?:rest|recovery|jog|休息|恢復)\s*(?:of\s*)?([\d:]+\s*(?:s|sec|min|m)?|\d+\s*['′"″]?)/i.exec(desc);
  const rest = restM ? restM[1].trim() : null;
  return { reps, distM, rest };
}

/**
 * Strip leading/trailing warmup/cooldown phrases from an interval description so the
 * Intervals session description contains only the work-set notation.
 */
function cleanIntervalDescription(desc?: string | null): string | null {
  if (!desc) return null;
  let s = String(desc).trim();
  // Remove explicit warmup/cooldown sentences (English + Traditional Chinese).
  s = s.replace(/(?:^|\.\s*)(?:warm[\s-]?up|cool[\s-]?down|wu|cd)[^.。]*[.。]?/gi, " ");
  s = s.replace(/(?:^|[。.\s])(熱身|緩和|收操)[^。.]*[。.]?/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || desc;
}

export function isIntervalDay(day: DayLike | null | undefined): boolean {
  return !!day && INTERVAL_TYPES.has(String(day.type || ""));
}

function normalizeType(t?: string | null): string {
  const v = String(t || "").toLowerCase();
  if (v.includes("warm")) return "Warmup";
  if (v.includes("cool")) return "Cooldown";
  if (v.includes("interval")) return "Interval";
  return String(t || "");
}

function stepDistanceKm(step?: StepLike | null): number {
  if (!step) return 0;
  if (step.kind === "interval" && step.reps && step.distance_m) return Number(step.reps) * Number(step.distance_m) / 1000;
  if (step.distance_km != null) return Number(step.distance_km) || 0;
  if (step.distance_m != null) return (Number(step.distance_m) || 0) / 1000;
  return 0;
}

function sessionDistanceKm(session?: SessionLike | null): number {
  if (!session) return 0;
  const fromSteps = (session.steps ?? []).reduce((sum, st) => sum + stepDistanceKm(st), 0);
  return fromSteps > 0 ? fromSteps : (Number(session.distance_km) || 0);
}

function sessionPace(session?: SessionLike | null): string | null {
  if (!session) return null;
  const steps = session.steps ?? [];
  return steps.find((st) => st.kind === "interval" && st.pace)?.pace
    ?? steps.find((st) => st.kind === "main" && st.pace)?.pace
    ?? session.pace
    ?? steps.find((st) => st.pace)?.pace
    ?? null;
}

/** Returns a new day with one Interval session containing warmup/interval/cooldown steps. */
export function splitIntervalDay(day: DayLike, opts: { lang?: "en" | "zh" } = {}): DayLike {
  if (!isIntervalDay(day)) return day;

  const lang = opts.lang ?? "en";
  const existingSessions = Array.isArray(day.sessions) ? day.sessions : [];
  const warmSource = existingSessions.find((s) => normalizeType(s.type) === "Warmup");
  const coolSource = existingSessions.find((s) => normalizeType(s.type) === "Cooldown");
  const intervalSource = existingSessions.find((s) => normalizeType(s.type) === "Interval") ?? existingSessions[0];
  if (existingSessions.length === 1 && intervalSource?.steps?.length) {
    const steps = intervalSource.steps.map((st) => ({ ...st }));
    const totalKm = Number(sessionDistanceKm({ ...intervalSource, steps }).toFixed(2));
    const session: SessionLike = {
      ...intervalSource,
      id: intervalSource.id || genId(),
      type: "Interval",
      title: intervalSource.title ?? day.title ?? (lang === "zh" ? "間歇跑" : "Interval Run"),
      distance_km: totalKm > 0 ? totalKm : (intervalSource.distance_km ?? day.distance_km ?? null),
      pace: sessionPace({ ...intervalSource, steps }) ?? day.pace ?? null,
      description: intervalSource.description ?? day.description ?? (lang === "zh" ? "熱身 + 間歇 + 緩和" : "Warm up + intervals + cool down"),
      color: intervalSource.color ?? day.color ?? "#F44336",
      steps,
    };
    return { ...day, type: "Interval", title: session.title, distance_km: session.distance_km, pace: session.pace, description: session.description, color: session.color, elevation_m: null, eph: null, sessions: [session] };
  }
  const parsed = parseIntervals(intervalSource?.description ?? day.description);
  const existingIntervalStep = intervalSource?.steps?.find((st) => st.kind === "interval");
  const intervalStep: StepLike = existingIntervalStep
    ? { ...existingIntervalStep, kind: "interval" }
    : parsed
      ? { kind: "interval", reps: parsed.reps, distance_m: parsed.distM, pace: intervalSource?.pace ?? day.pace ?? null, rest: parsed.rest }
      : { kind: "interval", distance_km: Math.max(1, Number(intervalSource?.distance_km ?? day.distance_km) || 1), pace: intervalSource?.pace ?? day.pace ?? null };
  const intervalKm = stepDistanceKm(intervalStep);
  const declaredTotalKm = Number(day.distance_km) || 0;
  const remainingKm = declaredTotalKm > intervalKm ? declaredTotalKm - intervalKm : 0;
  const fallbackWcKm = remainingKm >= 3 ? 1.5 : remainingKm >= 2 ? 1 : (declaredTotalKm >= 6 || intervalKm >= 4 ? 1.5 : 1);
  const warmKm = sessionDistanceKm(warmSource) || fallbackWcKm;
  const coolKm = sessionDistanceKm(coolSource) || fallbackWcKm;
  const wcPace = warmSource?.pace ?? coolSource?.pace ?? adjustPace(day.pace, 1.4) ?? day.pace ?? null;

  const labels = lang === "zh"
    ? { warm: "熱身", cool: "緩和", intervals: "間歇跑", desc: "熱身 + 間歇 + 緩和" }
    : { warm: "Warm Up", cool: "Cool Down", intervals: "Interval Run", desc: "Warm up + intervals + cool down" };

  const steps: StepLike[] = [
    { kind: "warmup", distance_km: warmKm, pace: wcPace, note: labels.warm },
    intervalStep,
    { kind: "cooldown", distance_km: coolKm, pace: coolSource?.pace ?? wcPace, note: labels.cool },
  ];
  const totalKm = Number((warmKm + intervalKm + coolKm).toFixed(2));
  const session: SessionLike = {
    id: intervalSource?.id || genId(),
    type: "Interval",
    title: day.title ?? intervalSource?.title ?? labels.intervals,
    time_of_day: intervalSource?.time_of_day ?? null,
    distance_km: totalKm,
    pace: intervalSource?.pace ?? day.pace ?? null,
    description: cleanIntervalDescription(intervalSource?.description ?? day.description) ?? labels.desc,
    color: day.color ?? intervalSource?.color ?? "#F44336",
    elevation_m: null,
    eph: null,
    steps,
  };

  return { ...day, type: "Interval", title: session.title, distance_km: totalKm, pace: session.pace, description: session.description, color: session.color, elevation_m: null, eph: null, sessions: [session] };
}

/** Walk a full plan_data array of weeks and split every interval day in place. */
export function splitIntervalsInPlan(planData: any, opts: { lang?: "en" | "zh" } = {}): { plan: any; changed: number } {
  let changed = 0;
  if (!Array.isArray(planData)) return { plan: planData, changed };
  const out = planData.map((week: any) => {
    if (!week || !Array.isArray(week.days)) return week;
    const days = week.days.map((d: any) => {
      if (!isIntervalDay(d)) return d;
      const next = splitIntervalDay(d, opts);
      if (JSON.stringify(next) !== JSON.stringify(d)) changed++;
      return next;
    });
    return { ...week, days };
  });
  return { plan: out, changed };
}

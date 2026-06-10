// Split an Interval workout day into three sessions: Warmup + Intervals + Cooldown.
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

function parseIntervals(desc?: string | null): { reps: number; distM: number } | null {
  if (!desc) return null;
  const repsFirst = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|km)\b/i.exec(desc);
  const distFirst = /(\d+(?:\.\d+)?)\s*(m|km)\s*[x×]\s*(\d+)\b/i.exec(desc);
  if (!repsFirst && !distFirst) return null;
  const reps = repsFirst ? parseInt(repsFirst[1], 10) : parseInt(distFirst![3], 10);
  const val = parseFloat(repsFirst ? repsFirst[2] : distFirst![1]);
  const unit = (repsFirst ? repsFirst[3] : distFirst![2]).toLowerCase();
  const distM = unit === "km" ? val * 1000 : val;
  if (reps < 2 || reps > 30 || distM < 100 || distM > 10000) return null;
  return { reps, distM };
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

/** Returns a new day with sessions = [Warmup, Intervals, Cooldown]. Idempotent. */
export function splitIntervalDay(day: DayLike, opts: { lang?: "en" | "zh" } = {}): DayLike {
  if (!isIntervalDay(day)) return day;
  if (Array.isArray(day.sessions) && day.sessions.length > 0) return day; // already split or customized
  const totalKm = Number(day.distance_km) || 0;
  if (totalKm <= 0) return day;

  const lang = opts.lang ?? "en";
  const parsed = parseIntervals(day.description);
  const wcKm = totalKm >= 6 ? 1.5 : 1;
  let intervalKm = parsed ? (parsed.reps * parsed.distM) / 1000 : Math.max(1, totalKm - 2 * wcKm);
  intervalKm = Math.round(intervalKm * 10) / 10;
  const wcPace = adjustPace(day.pace, 1.4) ?? day.pace ?? null;

  const labels = lang === "zh"
    ? { warm: "熱身", cool: "緩和", warmDesc: `${wcKm}km 輕鬆熱身慢跑`, coolDesc: `${wcKm}km 輕鬆緩和慢跑`, intervals: "間歇跑" }
    : { warm: "Warm Up", cool: "Cool Down", warmDesc: `Easy ${wcKm}km warm-up jog`, coolDesc: `Easy ${wcKm}km cool-down jog`, intervals: "Intervals" };

  const sessions: SessionLike[] = [
    {
      id: genId(),
      type: "Warmup",
      title: labels.warm,
      time_of_day: null,
      distance_km: wcKm,
      pace: wcPace,
      description: labels.warmDesc,
      color: "#FFB74D",
      elevation_m: null,
      eph: null,
    },
    {
      id: genId(),
      type: "Interval",
      title: day.title ?? labels.intervals,
      time_of_day: null,
      distance_km: intervalKm,
      pace: day.pace ?? null,
      description: cleanIntervalDescription(day.description),
      color: day.color ?? "#F44336",
      elevation_m: null,
      eph: null,
    },
    {
      id: genId(),
      type: "Cooldown",
      title: labels.cool,
      time_of_day: null,
      distance_km: wcKm,
      pace: wcPace,
      description: labels.coolDesc,
      color: "#90CAF9",
      elevation_m: null,
      eph: null,
    },
  ];

  return { ...day, sessions };
}

/** Walk a full plan_data array of weeks and split every interval day in place. */
export function splitIntervalsInPlan(planData: any, opts: { lang?: "en" | "zh" } = {}): { plan: any; changed: number } {
  let changed = 0;
  if (!Array.isArray(planData)) return { plan: planData, changed };
  const out = planData.map((week: any) => {
    if (!week || !Array.isArray(week.days)) return week;
    const days = week.days.map((d: any) => {
      if (!isIntervalDay(d)) return d;
      if (Array.isArray(d?.sessions) && d.sessions.length > 0) return d;
      const next = splitIntervalDay(d, opts);
      if (next !== d) changed++;
      return next;
    });
    return { ...week, days };
  });
  return { plan: out, changed };
}

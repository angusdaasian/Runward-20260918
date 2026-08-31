// Day-of-week rescheduling helpers for plan auto-adjust.
//
// Runners routinely shift a session by a day or two (tempo on Friday instead of Thursday).
// That is not a missed session — it is a scheduling preference. These helpers:
//   1. detect in-week session shifts in past weeks and rewrite the calendar so the plan
//      reflects the day the work actually happened on, and
//   2. build a weekday habit profile so the model can place future key sessions and rest
//      days on the weekdays the runner really uses.

import type { DayDeviation, WeekPlan } from "./planAdherence.ts";

export interface DaySwap {
  week_index: number;
  /** Date the session was originally assigned to. */
  from_date: string;
  /** Date the session was actually performed on. */
  to_date: string;
  session_type: string | null;
  assigned_km: number | null;
  actual_km: number;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dowOf(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00Z");
  return DOW[d.getUTCDay()];
}

/**
 * Find sessions that were moved to another day inside the same week.
 * Only past days are considered, and each donor/receiver day is used at most once.
 */
export function detectWeekSwaps(weekIndex: number, days: DayDeviation[], todayISO: string): DaySwap[] {
  const past = days.filter((d) => d.date < todayISO);
  const moved = past.filter(
    (d) => d.is_key_session && d.actual_km < 0.5 && (d.assigned_km ?? 0) > 0,
  );
  if (moved.length === 0) return [];

  const used = new Set<string>();
  const swaps: DaySwap[] = [];

  for (const src of moved) {
    const assigned = src.assigned_km ?? 0;
    const candidates = past
      .filter((d) => d.date !== src.date && !used.has(d.date) && d.actual_km >= 0.5)
      // The day that absorbed the work must have run clearly more than it was asked to,
      // or have been a rest/easy day carrying a substantial run.
      .filter((d) => {
        const planned = d.assigned_km ?? 0;
        return d.actual_km >= Math.max(planned * 1.15, assigned * 0.6, 4);
      })
      .sort((a, b) => Math.abs(a.actual_km - assigned) - Math.abs(b.actual_km - assigned));

    const best = candidates[0];
    if (!best) continue;
    used.add(best.date);
    used.add(src.date);
    swaps.push({
      week_index: weekIndex,
      from_date: src.date,
      to_date: best.date,
      session_type: src.assigned_type,
      assigned_km: src.assigned_km,
      actual_km: best.actual_km,
    });
  }
  return swaps;
}

/** Swap the planned content of the two dates so the calendar matches what really happened. */
export function applyDaySwaps(plan: WeekPlan[], swaps: DaySwap[]): WeekPlan[] {
  if (swaps.length === 0) return plan;
  const out: WeekPlan[] = JSON.parse(JSON.stringify(plan));
  const index = new Map<string, { day: any }>();
  for (const w of out) {
    for (const day of (Array.isArray(w.days) ? (w.days as any[]) : [])) {
      if (day?.date) index.set(day.date, { day });
    }
  }

  const CONTENT = ["type", "title", "description", "distance_km", "pace", "color", "elevation_m", "eph", "sessions"];

  for (const s of swaps) {
    const a = index.get(s.from_date)?.day;
    const b = index.get(s.to_date)?.day;
    if (!a || !b) continue;
    if (a.type === "Race" || a.type === "Trail Race" || b.type === "Race" || b.type === "Trail Race") continue;
    const snapA: Record<string, unknown> = {};
    const snapB: Record<string, unknown> = {};
    for (const k of CONTENT) {
      snapA[k] = a[k];
      snapB[k] = b[k];
    }
    for (const k of CONTENT) {
      a[k] = snapB[k];
      b[k] = snapA[k];
    }
    a.day_swapped = true;
    a.swapped_with = s.to_date;
    b.day_swapped = true;
    b.swapped_with = s.from_date;
  }
  return out;
}

export interface WeekdayHabit {
  dow: string;
  runs: number;
  rest_days: number;
  total_km: number;
  longest_km: number;
  hard_runs: number;
}

/**
 * Build a weekday habit profile from past plan days (which already carry actual km/pace).
 * "hard" = notably faster than the runner's own median pace, or a long effort.
 */
export function weekdayHabits(allPastDays: DayDeviation[]): WeekdayHabit[] {
  const paces = allPastDays
    .map((d) => d.actual_pace_sec)
    .filter((v): v is number => typeof v === "number" && v > 0)
    .sort((a, b) => a - b);
  const median = paces.length ? paces[Math.floor(paces.length / 2)] : null;
  const longThreshold = Math.max(
    12,
    allPastDays.reduce((m, d) => Math.max(m, d.actual_km), 0) * 0.75,
  );

  const map = new Map<string, WeekdayHabit>();
  for (const dow of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    map.set(dow, { dow, runs: 0, rest_days: 0, total_km: 0, longest_km: 0, hard_runs: 0 });
  }
  for (const d of allPastDays) {
    const h = map.get(dowOf(d.date));
    if (!h) continue;
    if (d.actual_km < 0.5) {
      h.rest_days += 1;
      continue;
    }
    h.runs += 1;
    h.total_km = Math.round((h.total_km + d.actual_km) * 10) / 10;
    h.longest_km = Math.max(h.longest_km, Math.round(d.actual_km * 10) / 10);
    const fast = median != null && d.actual_pace_sec != null && d.actual_pace_sec <= median * 0.95;
    if (fast || d.actual_km >= longThreshold) h.hard_runs += 1;
  }
  return Array.from(map.values());
}

export function habitLines(habits: WeekdayHabit[]): string {
  return habits
    .map(
      (h) =>
        `- ${h.dow}: ran ${h.runs}x (rest ${h.rest_days}x), ${h.total_km}km total, longest ${h.longest_km}km, harder/long efforts ${h.hard_runs}x`,
    )
    .join("\n");
}

export function swapLines(swaps: DaySwap[]): string {
  if (swaps.length === 0) return "- none detected";
  return swaps
    .map(
      (s) =>
        `- ${s.session_type ?? "session"}${s.assigned_km ? ` ${s.assigned_km}km` : ""} assigned ${s.from_date} (${dowOf(s.from_date)}) was actually run ${s.to_date} (${dowOf(s.to_date)}, ${s.actual_km}km)`,
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Past-week reconciliation: rewrite already-elapsed days so the calendar shows
// what the runner really did, instead of an assignment that never happened.
// The original assignment is kept in planned_* fields so the UI can still show
// a planned-vs-actual comparison.
// ---------------------------------------------------------------------------

const REST_RE = /rest|off|休息/i;
const RACE_TYPES = new Set(["Race", "Trail Race"]);

function paceStr(secPerKm: number | null | undefined): string | null {
  if (!secPerKm || secPerKm <= 0) return null;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

const TYPE_COLORS: Record<string, string> = {
  "Easy Run": "#4CAF50",
  "Tempo Run": "#FF9800",
  "Interval": "#F44336",
  "Long Run": "#2196F3",
  "Recovery": "#9C27B0",
  "Rest": "#607D8B",
};

/** Infer the type of a completed run from its distance and pace vs the runner's own norms. */
function inferActualType(dev: DayDeviation, medianPaceSec: number | null, longKm: number): string {
  const planned = String(dev.assigned_type ?? "");
  if (RACE_TYPES.has(planned)) return planned;
  // If the planned session was essentially executed, keep its label.
  if (dev.adherence === "ON_TRACK" || dev.adherence === "OVERSHOT") {
    if (planned && !REST_RE.test(planned)) return planned;
  }
  if (dev.actual_km >= longKm) return "Long Run";
  if (medianPaceSec && dev.actual_pace_sec && dev.actual_pace_sec <= medianPaceSec * 0.93) return "Tempo Run";
  if (dev.actual_km <= 6 && medianPaceSec && dev.actual_pace_sec && dev.actual_pace_sec >= medianPaceSec * 1.07) return "Recovery";
  return "Easy Run";
}

/**
 * Rewrite every past day of the plan to reflect the actual training.
 * - nothing recorded  → Rest (so a skipped key session is not left standing as a duplicate)
 * - something recorded → actual distance / pace, with a sensible type label
 */
export function alignPastDaysToActual(
  plan: WeekPlan[],
  pastDays: DayDeviation[],
  todayISO: string,
  lang: "en" | "zh" = "en",
): { plan: WeekPlan[]; rewritten: number } {
  const byDate = new Map(pastDays.map((d) => [d.date, d]));
  const paces = pastDays
    .map((d) => d.actual_pace_sec)
    .filter((v): v is number => typeof v === "number" && v > 0)
    .sort((a, b) => a - b);
  const medianPaceSec = paces.length ? paces[Math.floor(paces.length / 2)] : null;
  const longKm = Math.max(12, pastDays.reduce((m, d) => Math.max(m, d.actual_km), 0) * 0.8);

  const out: WeekPlan[] = JSON.parse(JSON.stringify(plan));
  let rewritten = 0;

  for (const w of out) {
    if (!Array.isArray(w.days)) continue;
    for (const day of w.days as any[]) {
      if (!day?.date || day.date >= todayISO) continue;
      if (RACE_TYPES.has(String(day.type ?? ""))) continue;
      const dev = byDate.get(day.date);
      if (!dev) continue;

      // Snapshot the original assignment once.
      if (day.planned_type === undefined) {
        day.planned_type = day.type ?? null;
        day.planned_km = day.distance_km ?? null;
        day.planned_pace = day.pace ?? null;
        day.planned_title = day.title ?? null;
        day.planned_description = day.description ?? null;
      }

      if (dev.actual_km < 0.5) {
        if (REST_RE.test(String(day.type ?? "")) && !day.distance_km) continue;
        day.type = "Rest";
        day.title = lang === "zh" ? "休息" : "Rest";
        day.description = lang === "zh" ? "當日沒有訓練紀錄，已改為休息。" : "No training recorded — recorded as a rest day.";
        day.distance_km = null;
        day.pace = null;
        day.color = TYPE_COLORS["Rest"];
        day.elevation_m = null;
        day.eph = null;
        delete day.sessions;
        day.aligned_to_actual = true;
        rewritten++;
        continue;
      }

      const type = inferActualType(dev, medianPaceSec, longKm);
      const km = Math.round(dev.actual_km * 10) / 10;
      const pace = paceStr(dev.actual_pace_sec);
      const sameAsPlanned =
        day.type === type &&
        Math.abs((Number(day.distance_km) || 0) - km) < 0.15 &&
        (day.pace ?? null) === pace;
      day.type = type;
      day.title = day.planned_title && day.planned_type === type ? day.planned_title : type;
      day.distance_km = km;
      day.pace = pace ?? day.pace ?? null;
      day.color = TYPE_COLORS[type] ?? day.color ?? "#4CAF50";
      if (day.planned_type !== type) {
        day.description = lang === "zh"
          ? `實際完成 ${km} 公里${pace ? `，平均配速 ${pace}` : ""}。`
          : `Actually completed ${km} km${pace ? ` at ${pace}` : ""}.`;
        delete day.sessions;
      }
      day.aligned_to_actual = true;
      if (!sameAsPlanned) rewritten++;
    }
  }
  return { plan: out, rewritten };
}

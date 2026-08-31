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

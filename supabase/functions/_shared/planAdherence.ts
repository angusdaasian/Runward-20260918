// Shared planned-vs-actual adherence engine.
//
// Used by:
//  - weekly-plan-review    (reporting only)
//  - plan-auto-adjust      (nightly deviation nudge + full recalibration)
//
// Keeping the matching logic here means all consumers score adherence identically.

export interface PlannedDay {
  date: string;
  type: string;
  distance_km: number | null;
  pace?: string | null;
  [k: string]: unknown;
}

export interface WeekPlan {
  week: number;
  startDate?: string;
  days: PlannedDay[];
  [k: string]: unknown;
}

export interface NormActivity {
  date: string;          // yyyy-mm-dd
  distance_m: number;
  seconds: number;
  avg_hr: number | null;
  max_hr: number | null;
  type: string;
}

// ---------------- pace helpers ----------------

export function paceSecPerKm(distMeters: number, secs: number): number | null {
  if (!distMeters || !secs) return null;
  const km = distMeters / 1000;
  if (km < 0.05) return null;
  return secs / km;
}

export function parsePaceStr(p: string | null | undefined): number | null {
  if (!p) return null;
  const m = String(p).match(/(\d+):(\d+)/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

export function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

// ---------------- data gathering ----------------

export async function fetchActivities(
  admin: any,
  userId: string,
  startISO: string,
  endISO: string,
): Promise<NormActivity[]> {
  const [strava, garmin, terra, apple, polar, suunto, intervals] = await Promise.all([
    admin.from("strava_activities").select("start_date,distance,moving_time,average_heartrate,max_heartrate,sport_type")
      .eq("user_id", userId).gte("start_date", startISO).lt("start_date", endISO),
    admin.from("garmin_activities").select("start_time,distance_meters,duration_seconds,average_hr,max_hr,activity_type")
      .eq("user_id", userId).gte("start_time", startISO).lt("start_time", endISO),
    admin.from("terra_activities").select("start_time,distance_meters,duration_seconds,average_hr,max_hr,activity_type")
      .eq("user_id", userId).gte("start_time", startISO).lt("start_time", endISO),
    admin.from("apple_health_activities").select("start_date,distance,moving_time,average_heartrate,max_heartrate,sport_type")
      .eq("user_id", userId).gte("start_date", startISO).lt("start_date", endISO),
    admin.from("polar_activities").select("start_time,distance_meters,duration_seconds,average_hr,max_hr,activity_type")
      .eq("user_id", userId).gte("start_time", startISO).lt("start_time", endISO),
    admin.from("suunto_activities").select("start_time,distance_meters,duration_seconds,average_hr,max_hr,activity_type")
      .eq("user_id", userId).gte("start_time", startISO).lt("start_time", endISO),
    admin.from("intervals_activities").select("start_date,distance,moving_time,average_heartrate,max_heartrate,sport_type")
      .eq("user_id", userId).gte("start_date", startISO).lt("start_date", endISO),
  ]);

  const norm: NormActivity[] = [];
  const pushStrava = (rows: any[]) => {
    for (const r of rows ?? []) {
      norm.push({
        date: r.start_date,
        distance_m: Number(r.distance) || 0,
        seconds: Number(r.moving_time) || 0,
        avg_hr: r.average_heartrate ?? null,
        max_hr: r.max_heartrate ?? null,
        type: r.sport_type || "Run",
      });
    }
  };
  const pushGarminLike = (rows: any[]) => {
    for (const r of rows ?? []) {
      norm.push({
        date: r.start_time,
        distance_m: Number(r.distance_meters) || 0,
        seconds: Number(r.duration_seconds) || 0,
        avg_hr: r.average_hr ?? null,
        max_hr: r.max_hr ?? null,
        type: r.activity_type || "Run",
      });
    }
  };

  pushStrava(strava.data);
  pushStrava(apple.data);
  pushStrava(intervals.data);
  pushGarminLike(garmin.data);
  pushGarminLike(terra.data);
  pushGarminLike(polar.data);
  pushGarminLike(suunto.data);

  // Dedup: same day + similar distance + similar duration = same run from 2 providers
  const seen = new Set<string>();
  const dedup: NormActivity[] = [];
  for (const a of norm) {
    if (!a.date) continue;
    const day = new Date(a.date).toISOString().slice(0, 10);
    const k = `${day}|${Math.round(a.distance_m / 100)}|${Math.round(a.seconds / 30)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push({ ...a, date: day });
  }
  return dedup.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchHealth(admin: any, userId: string, startISO: string, endISO: string) {
  const [g, t] = await Promise.all([
    admin.from("garmin_daily_health").select("date,resting_hr,sleep_score,vo2max")
      .eq("user_id", userId).gte("date", startISO.slice(0, 10)).lt("date", endISO.slice(0, 10)),
    admin.from("terra_daily_health").select("date,resting_hr,sleep_score,vo2max")
      .eq("user_id", userId).gte("date", startISO.slice(0, 10)).lt("date", endISO.slice(0, 10)),
  ]);
  const all = [...(g.data ?? []), ...(t.data ?? [])];
  const rhrs = all.map((r: any) => r.resting_hr).filter((v: any): v is number => typeof v === "number" && v > 0);
  const sleeps = all.map((r: any) => r.sleep_score).filter((v: any): v is number => typeof v === "number" && v > 0);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  return { avg_resting_hr: avg(rhrs), avg_sleep_score: avg(sleeps), days_with_data: all.length };
}

// ---------------- week scoring (used by weekly-plan-review) ----------------

export function scoreWeek(
  planned: PlannedDay[],
  actual: NormActivity[],
  health: { avg_resting_hr: number | null; avg_sleep_score: number | null; days_with_data: number },
) {
  const plannedRuns = planned.filter((d) => d.type !== "Rest" && (d.distance_km ?? 0) > 0);
  const plannedKm = plannedRuns.reduce((s, d) => s + (d.distance_km ?? 0), 0);
  const actualKm = actual.reduce((s, a) => s + a.distance_m / 1000, 0);

  let distance_score = 0;
  if (plannedKm > 0) {
    const ratio = actualKm / plannedKm;
    distance_score = Math.round(clamp(100 - Math.abs(1 - ratio) * 100));
  } else if (actualKm > 0) {
    distance_score = 80;
  }

  const ranDays = new Set(actual.filter((a) => a.distance_m > 500).map((a) => a.date));
  const completion_pct = plannedRuns.length > 0
    ? Math.round(clamp((ranDays.size / plannedRuns.length) * 100))
    : (actual.length > 0 ? 100 : 0);

  const hrs = actual.map((a) => a.avg_hr).filter((v): v is number => typeof v === "number" && v > 0);
  let hr_score = 0;
  if (hrs.length) {
    const avgHr = hrs.reduce((s, v) => s + v, 0) / hrs.length;
    hr_score = Math.round(clamp(100 - Math.abs(avgHr - 145) * 1.5));
  }

  const plannedPaces = planned.map((d) => parsePaceStr(d.pace ?? null)).filter((v): v is number => v != null);
  const actualPaces = actual.map((a) => paceSecPerKm(a.distance_m, a.seconds)).filter((v): v is number => v != null);
  let pace_score = 0;
  if (actualPaces.length) {
    if (plannedPaces.length) {
      const aP = actualPaces.reduce((s, v) => s + v, 0) / actualPaces.length;
      const pP = plannedPaces.reduce((s, v) => s + v, 0) / plannedPaces.length;
      pace_score = Math.round(clamp(100 - (Math.abs(aP - pP) / pP) * 200));
    } else {
      pace_score = 70;
    }
  }

  let recovery_score = 0;
  if (health.days_with_data > 0) {
    let s = 50;
    if (health.avg_sleep_score != null) s = (s + health.avg_sleep_score) / 2 + 10;
    if (health.avg_resting_hr != null) {
      s = (s + clamp(100 - Math.abs(health.avg_resting_hr - 55) * 1.5)) / 2;
    }
    recovery_score = Math.round(clamp(s));
  }

  const overall_score = Math.round(
    completion_pct * 0.35 + distance_score * 0.25 + pace_score * 0.15 + hr_score * 0.10 + recovery_score * 0.15,
  );

  return {
    completion_pct,
    distance_score,
    hr_score,
    pace_score,
    recovery_score,
    overall_score,
    stats: {
      planned_km: Math.round(plannedKm * 10) / 10,
      actual_km: Math.round(actualKm * 10) / 10,
      planned_runs: plannedRuns.length,
      completed_runs: ranDays.size,
      avg_hr: hrs.length ? Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length) : null,
      avg_pace_sec_per_km: actualPaces.length
        ? Math.round(actualPaces.reduce((s, v) => s + v, 0) / actualPaces.length)
        : null,
      avg_resting_hr: health.avg_resting_hr ? Math.round(health.avg_resting_hr) : null,
      avg_sleep_score: health.avg_sleep_score ? Math.round(health.avg_sleep_score) : null,
    },
  };
}

// ---------------- deviation classification ----------------

export type Adherence =
  | "ON_TRACK"
  | "PARTIAL"
  | "UNDERSHOT_HARD"
  | "OVERSHOT"
  | "MISSED"
  | "UNPLANNED_LOAD"
  | "SUBSTITUTED"
  | "REST_OK";

export interface DayDeviation {
  date: string;
  assigned_type: string | null;
  assigned_km: number | null;
  assigned_pace: string | null;
  actual_km: number;
  actual_type: string | null;
  actual_pace_sec: number | null;
  actual_avg_hr: number | null;
  ratio: number | null;
  adherence: Adherence;
  is_key_session: boolean;
}

const KEY_RE = /tempo|interval|long|threshold|repeat|fartlek|race|節奏|間歇|長課|長距離/i;

export function isKeySession(type: string | null | undefined, distanceKm?: number | null): boolean {
  if (type && KEY_RE.test(type)) return true;
  // A very long assignment is a key session even if generically labelled.
  return (distanceKm ?? 0) >= 18;
}

function isRest(type: string | null | undefined, km: number | null | undefined): boolean {
  if (km && km > 0) return false;
  if (!type) return true;
  return /rest|off|休息/i.test(type);
}

/** Classify a single plan day against the activities recorded on that date. */
export function classifyDeviation(day: PlannedDay, dayActivities: NormActivity[], isPast: boolean): DayDeviation {
  const assignedKm = day.distance_km ?? null;
  const assignedType = day.type ?? null;
  const actualKm = dayActivities.reduce((s, a) => s + a.distance_m / 1000, 0);
  const totalSecs = dayActivities.reduce((s, a) => s + a.seconds, 0);
  const totalMeters = dayActivities.reduce((s, a) => s + a.distance_m, 0);
  const hrs = dayActivities.map((a) => a.avg_hr).filter((v): v is number => typeof v === "number" && v > 0);
  const actualType = dayActivities.length ? (dayActivities[0].type || null) : null;
  const key = isKeySession(assignedType, assignedKm);
  const restDay = isRest(assignedType, assignedKm);

  const base: Omit<DayDeviation, "adherence"> = {
    date: day.date,
    assigned_type: assignedType,
    assigned_km: assignedKm,
    assigned_pace: (day.pace as string | null) ?? null,
    actual_km: Math.round(actualKm * 100) / 100,
    actual_type: actualType,
    actual_pace_sec: paceSecPerKm(totalMeters, totalSecs),
    actual_avg_hr: hrs.length ? Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length) : null,
    ratio: assignedKm && assignedKm > 0 ? Math.round((actualKm / assignedKm) * 100) / 100 : null,
    is_key_session: key,
  };

  // Rest day handling
  if (restDay) {
    if (actualKm >= 3) return { ...base, adherence: "UNPLANNED_LOAD" };
    return { ...base, adherence: "REST_OK" };
  }

  // Nothing recorded
  if (actualKm < 0.5) {
    // A future/today day that hasn't happened yet is not a miss.
    return { ...base, adherence: isPast ? "MISSED" : "ON_TRACK" };
  }

  const ratio = assignedKm && assignedKm > 0 ? actualKm / assignedKm : null;
  if (ratio == null) {
    return { ...base, adherence: "ON_TRACK" };
  }

  if (ratio < 0.6) return { ...base, adherence: "UNDERSHOT_HARD" };
  if (ratio < 0.85) return { ...base, adherence: "PARTIAL" };
  if (ratio > 1.4) return { ...base, adherence: "OVERSHOT" };

  // Right distance but the session type was swapped (e.g. tempo done as easy)
  if (key && actualType && !KEY_RE.test(actualType)) {
    const assignedPaceSec = parsePaceStr(base.assigned_pace);
    const actualPaceSec = base.actual_pace_sec;
    if (assignedPaceSec && actualPaceSec && actualPaceSec > assignedPaceSec * 1.12) {
      return { ...base, adherence: "SUBSTITUTED" };
    }
  }

  return { ...base, adherence: "ON_TRACK" };
}

// ---------------- trigger rule ----------------

export interface AdjustDecision {
  should_adjust: boolean;
  reason: string;
  reason_code: string;
  deviations: DayDeviation[];
}

const ACTIONABLE: Adherence[] = ["UNDERSHOT_HARD", "MISSED", "OVERSHOT", "SUBSTITUTED", "UNPLANNED_LOAD"];

/**
 * Decide whether the current week's deviations warrant regenerating the plan.
 * `weekDeviations` should cover the current week up to (and including) today.
 */
export function shouldAdjust(weekDeviations: DayDeviation[], opts?: { isTaper?: boolean }): AdjustDecision {
  const actionable = weekDeviations.filter((d) => ACTIONABLE.includes(d.adherence));
  const keyMiss = actionable.filter(
    (d) => d.is_key_session && (d.adherence === "UNDERSHOT_HARD" || d.adherence === "MISSED" || d.adherence === "SUBSTITUTED"),
  );

  const plannedKm = weekDeviations.reduce((s, d) => s + (d.assigned_km ?? 0), 0);
  const actualKm = weekDeviations.reduce((s, d) => s + d.actual_km, 0);
  const volRatio = plannedKm > 0 ? actualKm / plannedKm : null;

  // During taper only a severe miss justifies a rewrite.
  if (opts?.isTaper) {
    if (keyMiss.length >= 2) {
      return {
        should_adjust: true,
        reason: `Taper disrupted: ${keyMiss.length} key sessions missed or downgraded.`,
        reason_code: "TAPER_SEVERE",
        deviations: actionable,
      };
    }
    return { should_adjust: false, reason: "In taper — holding the plan steady.", reason_code: "TAPER_HOLD", deviations: actionable };
  }

  if (keyMiss.length >= 1) {
    const d = keyMiss[0];
    return {
      should_adjust: true,
      reason: `Key session on ${d.date} (${d.assigned_type ?? "run"}${d.assigned_km ? ` ${d.assigned_km}km` : ""}) came in as ${d.actual_km}km — ${d.adherence}.`,
      reason_code: "KEY_SESSION_MISS",
      deviations: actionable,
    };
  }

  if (actionable.length >= 2) {
    return {
      should_adjust: true,
      reason: `${actionable.length} sessions deviated from plan this week.`,
      reason_code: "MULTI_DEVIATION",
      deviations: actionable,
    };
  }

  if (volRatio != null && plannedKm >= 15 && (volRatio < 0.7 || volRatio > 1.35)) {
    return {
      should_adjust: true,
      reason: `Weekly volume ${Math.round(actualKm)}km vs ${Math.round(plannedKm)}km planned (${Math.round(volRatio * 100)}%).`,
      reason_code: "VOLUME_DRIFT",
      deviations: actionable,
    };
  }

  return { should_adjust: false, reason: "Training is on track.", reason_code: "ON_TRACK", deviations: actionable };
}

// ---------------- full-plan audit (recalibration) ----------------

export interface WeekAudit {
  week: number;
  week_index: number;
  start_date: string | null;
  end_date: string | null;
  planned_km: number;
  actual_km: number;
  planned_runs: number;
  completed_runs: number;
  missed_key_sessions: number;
  completion_pct: number;
  avg_pace_sec_per_km: number | null;
  avg_hr: number | null;
  longest_run_km: number;
  days: DayDeviation[];
}

export interface PlanAudit {
  weeks: WeekAudit[];
  totals: {
    planned_km: number;
    actual_km: number;
    adherence_pct: number;
    missed_key_sessions: number;
    longest_run_km: number;
    weeks_audited: number;
    avg_weekly_km: number;
    recent_4w_km: number;
  };
  current_week_index: number;
}

function groupByDate(activities: NormActivity[]): Map<string, NormActivity[]> {
  const m = new Map<string, NormActivity[]>();
  for (const a of activities) {
    const arr = m.get(a.date) ?? [];
    arr.push(a);
    m.set(a.date, arr);
  }
  return m;
}

/**
 * Walk every week of plan_data, matching each day to real activities.
 * Returns per-day adherence labels plus per-week and overall rollups.
 * `todayISO` is the yyyy-mm-dd boundary between past and future.
 */
export function auditPlanHistory(
  planData: WeekPlan[],
  activities: NormActivity[],
  todayISO: string,
): PlanAudit {
  const byDate = groupByDate(activities);
  const weeks: WeekAudit[] = [];
  let currentWeekIndex = 0;

  planData.forEach((w, idx) => {
    const days = Array.isArray(w.days) ? w.days : [];
    const dated = days.filter((d) => !!d.date);
    const start = dated[0]?.date ?? null;
    const end = dated[dated.length - 1]?.date ?? null;

    if (start && end && start <= todayISO && todayISO <= end) currentWeekIndex = idx;
    else if (end && end < todayISO) currentWeekIndex = Math.max(currentWeekIndex, idx + 1);

    const dayDevs: DayDeviation[] = dated.map((d) =>
      classifyDeviation(d, byDate.get(d.date) ?? [], d.date < todayISO),
    );

    const plannedRuns = dayDevs.filter((d) => (d.assigned_km ?? 0) > 0);
    const plannedKm = dayDevs.reduce((s, d) => s + (d.assigned_km ?? 0), 0);
    const actualKm = dayDevs.reduce((s, d) => s + d.actual_km, 0);
    const completed = dayDevs.filter((d) => d.actual_km >= 0.5).length;
    const missedKey = dayDevs.filter(
      (d) => d.is_key_session && ["MISSED", "UNDERSHOT_HARD", "SUBSTITUTED"].includes(d.adherence),
    ).length;

    const weekActs = dated.flatMap((d) => byDate.get(d.date) ?? []);
    const paces = weekActs.map((a) => paceSecPerKm(a.distance_m, a.seconds)).filter((v): v is number => v != null);
    const hrs = weekActs.map((a) => a.avg_hr).filter((v): v is number => typeof v === "number" && v > 0);
    const longest = weekActs.reduce((m, a) => Math.max(m, a.distance_m / 1000), 0);

    weeks.push({
      week: Number(w.week) || idx + 1,
      week_index: idx,
      start_date: start,
      end_date: end,
      planned_km: Math.round(plannedKm * 10) / 10,
      actual_km: Math.round(actualKm * 10) / 10,
      planned_runs: plannedRuns.length,
      completed_runs: completed,
      missed_key_sessions: missedKey,
      completion_pct: plannedRuns.length ? Math.round(clamp((completed / plannedRuns.length) * 100)) : 0,
      avg_pace_sec_per_km: paces.length ? Math.round(paces.reduce((s, v) => s + v, 0) / paces.length) : null,
      avg_hr: hrs.length ? Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length) : null,
      longest_run_km: Math.round(longest * 10) / 10,
      days: dayDevs,
    });
  });

  if (currentWeekIndex > planData.length - 1) currentWeekIndex = Math.max(0, planData.length - 1);

  const pastWeeks = weeks.filter((w) => w.week_index < currentWeekIndex || w.week_index === currentWeekIndex);
  const plannedTotal = pastWeeks.reduce((s, w) => s + w.planned_km, 0);
  const actualTotal = pastWeeks.reduce((s, w) => s + w.actual_km, 0);
  const recent4 = pastWeeks.slice(-4).reduce((s, w) => s + w.actual_km, 0);

  return {
    weeks,
    current_week_index: currentWeekIndex,
    totals: {
      planned_km: Math.round(plannedTotal * 10) / 10,
      actual_km: Math.round(actualTotal * 10) / 10,
      adherence_pct: plannedTotal > 0 ? Math.round(clamp((actualTotal / plannedTotal) * 100, 0, 200)) : 0,
      missed_key_sessions: pastWeeks.reduce((s, w) => s + w.missed_key_sessions, 0),
      longest_run_km: pastWeeks.reduce((m, w) => Math.max(m, w.longest_run_km), 0),
      weeks_audited: pastWeeks.length,
      avg_weekly_km: pastWeeks.length ? Math.round((actualTotal / pastWeeks.length) * 10) / 10 : 0,
      recent_4w_km: Math.round(recent4 * 10) / 10,
    },
  };
}

// ---------------- VDOT / realistic target ----------------

const VDOT_TABLE: Array<{ v: number; t5k: number }> = [
  { v: 30, t5k: 1809 }, { v: 35, t5k: 1602 }, { v: 40, t5k: 1440 }, { v: 45, t5k: 1310 },
  { v: 50, t5k: 1201 }, { v: 55, t5k: 1110 }, { v: 60, t5k: 1032 }, { v: 65, t5k: 964 },
  { v: 70, t5k: 905 }, { v: 75, t5k: 853 }, { v: 80, t5k: 807 },
];

/** Rough VDOT from a representative effort (meters + seconds). */
export function vdotFromEffort(distanceMeters: number, seconds: number): number | null {
  if (distanceMeters < 1500 || seconds < 240) return null;
  // Normalize to a 5k-equivalent time with Riegel (exp 1.06), then interpolate the table.
  const t5k = seconds * Math.pow(5000 / distanceMeters, 1.06);
  if (t5k <= 0) return null;
  for (let i = 0; i < VDOT_TABLE.length - 1; i++) {
    const a = VDOT_TABLE[i], b = VDOT_TABLE[i + 1];
    if (t5k <= a.t5k && t5k >= b.t5k) {
      const f = (a.t5k - t5k) / (a.t5k - b.t5k);
      return Math.round((a.v + f * (b.v - a.v)) * 10) / 10;
    }
  }
  if (t5k > VDOT_TABLE[0].t5k) return VDOT_TABLE[0].v;
  return VDOT_TABLE[VDOT_TABLE.length - 1].v;
}

export function predictTimeFromVdot(vdot: number, distanceMeters: number): number | null {
  let t5k: number | null = null;
  for (let i = 0; i < VDOT_TABLE.length - 1; i++) {
    const a = VDOT_TABLE[i], b = VDOT_TABLE[i + 1];
    if (vdot >= a.v && vdot <= b.v) {
      const f = (vdot - a.v) / (b.v - a.v);
      t5k = a.t5k + f * (b.t5k - a.t5k);
      break;
    }
  }
  if (t5k == null) {
    if (vdot < VDOT_TABLE[0].v) t5k = VDOT_TABLE[0].t5k;
    else t5k = VDOT_TABLE[VDOT_TABLE.length - 1].t5k;
  }
  return Math.round(t5k * Math.pow(distanceMeters / 5000, 1.06));
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function parseDurationStr(v: string | null | undefined): number | null {
  if (!v) return null;
  const parts = String(v).trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export const RACE_METERS: Record<string, number> = {
  "5k": 5000,
  "10k": 10000,
  "half": 21097,
  "half marathon": 21097,
  "hm": 21097,
  "21k": 21097,
  "marathon": 42195,
  "full": 42195,
  "fm": 42195,
  "42k": 42195,
};

export function raceDistanceMeters(distance: string | null | undefined): number | null {
  if (!distance) return null;
  const k = String(distance).trim().toLowerCase();
  if (RACE_METERS[k]) return RACE_METERS[k];
  const m = k.match(/(\d+(?:\.\d+)?)\s*k/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  return null;
}

/** Best VDOT seen in the recent window — the fitness the plan should build from. */
export function recentVdotFromActivities(activities: NormActivity[], days = 42, todayISO?: string): number | null {
  const today = todayISO ? new Date(todayISO + "T00:00:00Z") : new Date();
  const cutoff = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
  let best: number | null = null;
  for (const a of activities) {
    if (a.date < cutoff) continue;
    if (!/run|jog|trail|跑/i.test(a.type || "Run")) continue;
    const v = vdotFromEffort(a.distance_m, a.seconds);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}

// ---------------- JSON repair (shared with generate-program) ----------------

export function repairTruncatedJsonArray(raw: string): any[] {
  const s = String(raw ?? "").trim();
  const start = s.indexOf("[");
  if (start < 0) return [];
  let depth = 0, inStr = false, esc = false, lastGood = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 1 && c === "}") lastGood = i;
    }
  }
  if (lastGood < 0) return [];
  try {
    const arr = JSON.parse(s.slice(start, lastGood + 1) + "]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function parseJsonLoose(raw: string): any {
  const s = String(raw ?? "").trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const obj = s.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch { /* fall through */ } }
  const arr = repairTruncatedJsonArray(s);
  return arr.length ? arr : null;
}

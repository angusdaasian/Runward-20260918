// Load + recovery context for plan recalibration.
//
// The recalibration prompt used to see only "average weekly km so far", which pulled a peak
// block down to base-phase volume. This module adds the missing physiology and plan intent:
//
//  - real weekly volume trend (last completed week, best of last 3, block peak)
//  - the ORIGINAL planned volume for the remaining weeks (incl. planned peak week)
//  - estimated training stress (TSS-like) with acute:chronic ratio
//  - HRV / resting-HR trend so "ran more than planned" is read as capacity, not as a problem
//  - a volume ceiling AND floor the model must respect
//
// Used by plan-auto-adjust.

import { paceSecPerKm, type NormActivity, type PlanAudit, type WeekPlan } from "./planAdherence.ts";

export interface HrvContext {
  latest_hrv: number | null;
  hrv_7d: number | null;
  hrv_baseline: number | null;
  hrv_delta_pct: number | null;
  rhr_7d: number | null;
  rhr_baseline: number | null;
  /** suppressed = recovery impaired, elevated = supercompensated, normal = in line with baseline */
  status: "suppressed" | "normal" | "elevated" | "unknown";
}

export interface LoadContext {
  weekly_actual_km: number[];
  last_week_km: number;
  best_recent_week_km: number;
  peak_actual_week_km: number;
  planned_peak_km: number;
  planned_remaining_km: { week: number; planned_km: number }[];
  /** Highest weekly volume the remaining plan still asks for. */
  planned_remaining_peak_km: number;
  weeks_to_race: number;
  /** Highest weekly volume the rebuild may prescribe next week. */
  volume_ceiling_km: number;
  /** Volume the rebuild must NOT go below for a runner already holding this load. */
  volume_floor_km: number;
  tss: {
    weekly: number[];
    acute_7d: number;
    chronic_28d_avg: number;
    acwr: number | null;
    trend: "ramping" | "steady" | "detraining" | "unknown";
  };
  hrv: HrvContext;
  /** Runner is training MORE than the plan asked — self-directed, not a failure. */
  self_directed_overload: boolean;
  /** High load + suppressed recovery: genuine overreaching, ease off. */
  overreaching: boolean;
}

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Estimated per-activity training stress. HR-based when available, pace-based otherwise. */
function activityTss(a: NormActivity, thresholdPaceSec: number | null, maxHr: number | null): number {
  const hours = a.seconds / 3600;
  if (hours <= 0) return 0;
  if (a.avg_hr && maxHr && maxHr > 100) {
    const frac = a.avg_hr / maxHr;
    const intensity = Math.max(0.4, Math.min(1.15, frac / 0.85));
    return hours * 100 * intensity * intensity;
  }
  const pace = paceSecPerKm(a.distance_m, a.seconds);
  if (pace && thresholdPaceSec) {
    const intensity = Math.max(0.4, Math.min(1.15, thresholdPaceSec / pace));
    return hours * 100 * intensity * intensity;
  }
  // last resort: ~7 stress points per km of running
  return (a.distance_m / 1000) * 7;
}

export async function fetchHrvContext(admin: any, userId: string, todayISO: string): Promise<HrvContext> {
  const from = new Date(new Date(todayISO + "T00:00:00Z").getTime() - 60 * 86400000).toISOString().slice(0, 10);
  const [terra, garmin] = await Promise.all([
    admin.from("terra_daily_health").select("date,hrv,resting_hr").eq("user_id", userId).gte("date", from).order("date"),
    admin.from("garmin_daily_health").select("date,resting_hr").eq("user_id", userId).gte("date", from).order("date"),
  ]);
  const rows: { date: string; hrv: number | null; resting_hr: number | null }[] = [
    ...((terra.data ?? []) as any[]).map((r) => ({ date: r.date, hrv: r.hrv, resting_hr: r.resting_hr })),
    ...((garmin.data ?? []) as any[]).map((r) => ({ date: r.date, hrv: null, resting_hr: r.resting_hr })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  const hrv = rows.filter((r) => typeof r.hrv === "number" && r.hrv! > 0).map((r) => Number(r.hrv));
  const rhr = rows.filter((r) => typeof r.resting_hr === "number" && r.resting_hr! > 0).map((r) => Number(r.resting_hr));

  const hrv7 = avg(hrv.slice(-7));
  const hrvBase = avg(hrv.slice(-42));
  const rhr7 = avg(rhr.slice(-7));
  const rhrBase = avg(rhr.slice(-42));
  const deltaPct = hrv7 != null && hrvBase ? ((hrv7 - hrvBase) / hrvBase) * 100 : null;

  let status: HrvContext["status"] = "unknown";
  if (deltaPct != null && hrv.length >= 7) {
    if (deltaPct <= -7) status = "suppressed";
    else if (deltaPct >= 5) status = "elevated";
    else status = "normal";
  } else if (rhr7 != null && rhrBase != null && rhr.length >= 7) {
    const d = rhr7 - rhrBase;
    status = d >= 3 ? "suppressed" : d <= -2 ? "elevated" : "normal";
  }

  return {
    latest_hrv: hrv.length ? Math.round(hrv[hrv.length - 1]) : null,
    hrv_7d: hrv7 != null ? Math.round(hrv7) : null,
    hrv_baseline: hrvBase != null ? Math.round(hrvBase) : null,
    hrv_delta_pct: deltaPct != null ? r1(deltaPct) : null,
    rhr_7d: rhr7 != null ? Math.round(rhr7) : null,
    rhr_baseline: rhrBase != null ? Math.round(rhrBase) : null,
    status,
  };
}

export function buildLoadContext(args: {
  planData: WeekPlan[];
  audit: PlanAudit;
  activities: NormActivity[];
  todayISO: string;
  fromIndex: number;
  hrv: HrvContext;
  thresholdPaceSec?: number | null;
  maxHr?: number | null;
}): LoadContext {
  const { planData, audit, activities, todayISO, fromIndex, hrv } = args;

  const pastWeeks = audit.weeks.filter((w) => w.week_index <= audit.current_week_index);
  const weeklyActual = pastWeeks.map((w) => w.actual_km);
  // The week in progress is incomplete, so it must not define the trend.
  const completed = pastWeeks.filter((w) => (w.end_date ?? "") < todayISO).map((w) => w.actual_km);
  const lastWeekKm = completed.length ? completed[completed.length - 1] : 0;
  const bestRecent = completed.slice(-3).reduce((m, v) => Math.max(m, v), 0);
  const peakActual = completed.reduce((m, v) => Math.max(m, v), 0);

  // Original plan intent, both overall and for what is still ahead.
  const plannedByWeek = planData.map((w, idx) => ({
    week: Number(w.week) || idx + 1,
    week_index: idx,
    planned_km: r1(
      (Array.isArray(w.days) ? (w.days as any[]) : []).reduce((s, d) => s + (Number(d?.distance_km) || 0), 0),
    ),
  }));
  const plannedPeak = plannedByWeek.reduce((m, w) => Math.max(m, w.planned_km), 0);
  const remaining = plannedByWeek.filter((w) => w.week_index >= fromIndex).map(({ week, planned_km }) => ({ week, planned_km }));
  const remainingPeak = remaining.reduce((m, w) => Math.max(m, w.planned_km), 0);

  // ---- training stress ----
  const tssByWeek: number[] = pastWeeks.map((w) => {
    const acts = activities.filter((a) => w.start_date && w.end_date && a.date >= w.start_date && a.date <= w.end_date);
    return Math.round(acts.reduce((s, a) => s + activityTss(a, args.thresholdPaceSec ?? null, args.maxHr ?? null), 0));
  });
  const dayMs = 86400000;
  const t0 = new Date(todayISO + "T00:00:00Z").getTime();
  const sumSince = (days: number) =>
    activities
      .filter((a) => new Date(a.date + "T00:00:00Z").getTime() > t0 - days * dayMs)
      .reduce((s, a) => s + activityTss(a, args.thresholdPaceSec ?? null, args.maxHr ?? null), 0);
  const acute = Math.round(sumSince(7));
  const chronic = Math.round(sumSince(28) / 4);
  const acwr = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : null;
  const trend: LoadContext["tss"]["trend"] =
    acwr == null ? "unknown" : acwr >= 1.15 ? "ramping" : acwr <= 0.85 ? "detraining" : "steady";

  const weeksToRace = Math.max(0, planData.length - fromIndex);
  const isTaper = weeksToRace <= 2;

  // ---- volume guardrails ----
  // Floor: never prescribe less than the runner is already holding (minus a small buffer),
  // unless we are tapering or recovery is clearly suppressed.
  const heldVolume = Math.max(lastWeekKm, bestRecent * 0.9);
  let floor = isTaper ? 0 : r1(heldVolume * 0.9);
  // Ceiling: normal 10% ramp off real load, but a runner already exceeding plan with healthy
  // recovery is allowed to keep climbing toward the plan's peak.
  let ceiling = r1(Math.max(heldVolume, lastWeekKm) * 1.1);
  const selfDirected = lastWeekKm > 0 && lastWeekKm >= (plannedByWeek[audit.current_week_index - 1]?.planned_km ?? 0) * 1.0;
  if (hrv.status !== "suppressed") {
    ceiling = r1(Math.max(ceiling, Math.min(plannedPeak, heldVolume * 1.15)));
  }
  const overreaching = hrv.status === "suppressed" && (acwr ?? 0) >= 1.3;
  if (overreaching) {
    ceiling = r1(Math.min(ceiling, heldVolume * 0.9));
    floor = 0;
  }
  if (isTaper) ceiling = r1(Math.min(ceiling, heldVolume * 0.8));

  return {
    weekly_actual_km: weeklyActual,
    last_week_km: r1(lastWeekKm),
    best_recent_week_km: r1(bestRecent),
    peak_actual_week_km: r1(peakActual),
    planned_peak_km: plannedPeak,
    planned_remaining_km: remaining,
    planned_remaining_peak_km: remainingPeak,
    weeks_to_race: weeksToRace,
    volume_ceiling_km: ceiling,
    volume_floor_km: floor,
    tss: { weekly: tssByWeek, acute_7d: acute, chronic_28d_avg: chronic, acwr, trend },
    hrv,
    self_directed_overload: selfDirected && lastWeekKm >= bestRecent * 0.95,
    overreaching,
  };
}

/** Human-readable block for the Gemini prompt. */
export function loadContextLines(ctx: LoadContext): string {
  const wk = ctx.weekly_actual_km.map((v, i) => `w${i + 1} ${v}km`).join(", ");
  const planned = ctx.planned_remaining_km.map((w) => `week ${w.week}: ${w.planned_km}km`).join(", ");
  const hrvLine =
    ctx.hrv.status === "unknown"
      ? "no HRV / resting-HR data available"
      : `HRV 7d ${ctx.hrv.hrv_7d ?? "n/a"} vs baseline ${ctx.hrv.hrv_baseline ?? "n/a"} (${
          ctx.hrv.hrv_delta_pct != null ? `${ctx.hrv.hrv_delta_pct > 0 ? "+" : ""}${ctx.hrv.hrv_delta_pct}%` : "n/a"
        }), resting HR 7d ${ctx.hrv.rhr_7d ?? "n/a"} vs baseline ${ctx.hrv.rhr_baseline ?? "n/a"} → recovery status: ${ctx.hrv.status}`;

  return `ACTUAL WEEKLY VOLUME (completed weeks): ${wk || "none"}
- Last completed week: ${ctx.last_week_km}km | best of last 3 weeks: ${ctx.best_recent_week_km}km | block peak so far: ${ctx.peak_actual_week_km}km
ORIGINAL PLAN INTENT
- Planned peak week in the original plan: ${ctx.planned_peak_km}km; highest volume still planned ahead: ${ctx.planned_remaining_peak_km}km
- Original planned volume for the weeks you are rebuilding: ${planned || "n/a"}
- Weeks remaining including this one: ${ctx.weeks_to_race}
TRAINING STRESS (estimated TSS)
- Last 7 days: ${ctx.tss.acute_7d} | 28-day weekly average: ${ctx.tss.chronic_28d_avg} | acute:chronic ratio ${ctx.tss.acwr ?? "n/a"} (${ctx.tss.trend})
- Weekly TSS so far: ${ctx.tss.weekly.join(", ") || "none"}
RECOVERY
- ${hrvLine}
INTERPRETATION
- Self-directed higher volume than the plan asked: ${ctx.self_directed_overload ? "YES — the runner is choosing to train at or above plan volume; respect that capacity instead of cutting it" : "no"}
- Genuine overreaching (high load + suppressed recovery): ${ctx.overreaching ? "YES — reduce load and insert recovery" : "no"}
VOLUME GUARDRAILS (hard numbers you must respect)
- Weekly volume ceiling for the first rebuilt week: ${ctx.volume_ceiling_km}km
- Weekly volume floor (do NOT prescribe less unless tapering or recovery is suppressed): ${ctx.volume_floor_km}km`;
}

/**
 * Deterministic safety net after the model returns: keep each rebuilt future week's volume
 * inside [floor, ceiling-with-ramp]. Gemini occasionally ignores the numeric guardrails and
 * halves a peak block; scaling the day distances proportionally fixes that without touching
 * session structure, past days, races or rest days.
 */
export function enforceVolumeBounds(
  plan: WeekPlan[],
  fromIndex: number,
  ctx: LoadContext,
  todayISO: string,
): { plan: WeekPlan[]; adjusted: number[] } {
  const out: WeekPlan[] = JSON.parse(JSON.stringify(plan));
  const adjusted: number[] = [];
  const totalWeeks = out.length;
  const suppressed = ctx.hrv.status === "suppressed" || ctx.overreaching;

  for (let i = fromIndex; i < totalWeeks; i++) {
    const w = out[i];
    const days = (Array.isArray(w?.days) ? (w.days as any[]) : []);
    if (!days.length) continue;
    const weeksFromRace = totalWeeks - 1 - i; // 0 = race week
    const isTaperWeek = weeksFromRace <= 1;
    const step = i - fromIndex;

    const editable = days.filter(
      (d) => d?.date && d.date >= todayISO && Number(d.distance_km) > 0 && d.type !== "Race" && d.type !== "Trail Race",
    );
    if (!editable.length) continue;
    const weekTotal = days.reduce((s, d) => s + (Number(d?.distance_km) || 0), 0);
    if (weekTotal <= 0) continue;

    const ramped = ctx.volume_ceiling_km * Math.pow(1.1, step);
    const ceiling = Math.min(ramped, Math.max(ctx.planned_peak_km, ctx.volume_ceiling_km));
    const floor = isTaperWeek || suppressed ? 0 : ctx.volume_floor_km;

    let scale = 1;
    if (floor > 0 && weekTotal < floor * 0.97) scale = floor / weekTotal;
    else if (ceiling > 0 && weekTotal > ceiling * 1.03) scale = ceiling / weekTotal;
    if (scale === 1) continue;

    // Only the editable (future, non-race) distance can absorb the correction.
    const editableTotal = editable.reduce((s, d) => s + Number(d.distance_km), 0);
    const targetEditable = Math.max(0, weekTotal * scale - (weekTotal - editableTotal));
    if (editableTotal <= 0 || targetEditable <= 0) continue;
    const k = targetEditable / editableTotal;
    if (Math.abs(k - 1) < 0.03) continue;
    for (const d of editable) {
      d.distance_km = Math.round(Number(d.distance_km) * k * 2) / 2;
      d.volume_scaled = Math.round(k * 100) / 100;
    }
    adjusted.push(Number(w.week) || i + 1);
  }
  return { plan: out, adjusted };
}

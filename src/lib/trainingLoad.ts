// Training load (TRIMP-based) helpers.
// Computes per-activity load and weekly Fitness/Fatigue/Form (CTL/ATL/TSB).

export interface LoadActivity {
  start_date: string;
  moving_time: number;
  average_heartrate: number | null;
  max_heartrate: number | null;
  sport_type?: string;
  source?: string;
  garmin_training_load?: number | null;
}

const cardioSportTypes = new Set([
  "Run",
  "TrailRun",
  "VirtualRun",
  "Treadmill",
  "running",
  "trail_running",
  "treadmill_running",
  "Ride",
  "VirtualRide",
  "Walk",
  "Hike",
  "Swim",
]);

export function isCardio(sportType?: string): boolean {
  if (!sportType) return true;
  return cardioSportTypes.has(sportType);
}

/**
 * Banister TRIMP approximation using HRR (heart rate reserve).
 * y = 0.75 * e^(1.8 * HRR)  (gender-averaged)
 * TRIMP = minutes * HRR * y
 */
export function computeTrainingLoad(act: {
  moving_time: number;
  average_heartrate: number | null;
  max_heartrate: number | null;
  age?: number | null;
  sport_type?: string;
}): number | null {
  if (!act.moving_time || act.moving_time < 60) return null;
  const minutes = act.moving_time / 60;

  const hrMax = act.max_heartrate || (act.age ? 220 - act.age : 190);
  const hrRest = 60;
  const hrAvg = act.average_heartrate ?? hrMax * 0.7;

  const hrr = Math.max(0, Math.min(1, (hrAvg - hrRest) / (hrMax - hrRest)));
  const y = 0.75 * Math.exp(1.8 * hrr);
  const trimp = minutes * hrr * y;
  if (!isFinite(trimp) || trimp <= 0) return null;
  return Math.round(trimp);
}

/** Pick an activity's training load: prefer Garmin-supplied, else compute. */
export function loadForActivity(
  act: LoadActivity,
  age?: number | null,
): number | null {
  if (act.garmin_training_load && act.garmin_training_load > 0) {
    return Math.round(act.garmin_training_load);
  }
  return computeTrainingLoad({
    moving_time: act.moving_time,
    average_heartrate: act.average_heartrate,
    max_heartrate: act.max_heartrate,
    age,
    sport_type: act.sport_type,
  });
}

// ---------- Weekly aggregation ----------

/** Returns Monday 00:00 (local) of the week containing `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export interface WeekPoint {
  weekStart: string; // ISO date
  weekLabel: string; // short label
  load: number;
  fitness: number; // CTL
  fatigue: number; // ATL
  form: number; // TSB
}

/**
 * Build a weekly series with EWMA-based CTL/ATL/TSB.
 * τ_CTL = 6 weeks, τ_ATL = 1 week.
 *
 * The series never starts earlier than the first week of 2026 — that's the
 * earliest point we have activity data for, and matches the rest of the
 * app's analytics window.
 */
export function buildWeeklyLoadSeries(
  activities: LoadActivity[],
  age?: number | null,
  weeks: number = 26,
): WeekPoint[] {
  const now = new Date();
  const currentWeek = weekStart(now);
  let startWeek = new Date(currentWeek);
  startWeek.setDate(startWeek.getDate() - (weeks - 1) * 7);

  // Clamp to the first week containing 2026-01-01.
  const earliest = weekStart(new Date(2026, 0, 1));
  if (startWeek < earliest) startWeek = earliest;

  // Recompute actual week count after clamping (≥ 1).
  const actualWeeks = Math.max(
    1,
    Math.round((currentWeek.getTime() - startWeek.getTime()) / (7 * 86400 * 1000)) + 1,
  );

  // Init week buckets
  const buckets: { ws: Date; load: number }[] = [];
  for (let i = 0; i < actualWeeks; i++) {
    const ws = new Date(startWeek);
    ws.setDate(ws.getDate() + i * 7);
    buckets.push({ ws, load: 0 });
  }

  // Sum load per week
  for (const act of activities) {
    if (!isCardio(act.sport_type)) continue;
    const date = new Date(act.start_date);
    if (isNaN(date.getTime())) continue;
    if (date < startWeek) continue;
    const load = loadForActivity(act, age);
    if (!load) continue;
    const ws = weekStart(date);
    const idx = Math.round((ws.getTime() - startWeek.getTime()) / (7 * 86400 * 1000));
    if (idx >= 0 && idx < actualWeeks) {
      buckets[idx].load += load;
    }
  }

  // EWMA on weekly series
  // alpha for time-constant τ (in weeks): α = 1 - e^(-1/τ)
  const alphaCtl = 1 - Math.exp(-1 / 6);
  const alphaAtl = 1 - Math.exp(-1 / 1);

  let ctl = 0;
  let atl = 0;
  const series: WeekPoint[] = [];

  for (const b of buckets) {
    ctl = ctl + alphaCtl * (b.load - ctl);
    atl = atl + alphaAtl * (b.load - atl);
    const form = ctl - atl;
    series.push({
      weekStart: b.ws.toISOString().slice(0, 10),
      weekLabel: b.ws.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      load: Math.round(b.load * 10) / 10,
      fitness: Math.round(ctl * 10) / 10,
      fatigue: Math.round(atl * 10) / 10,
      form: Math.round(form * 10) / 10,
    });
  }

  return series;
}

export type LoadStatusKey =
  | "overreaching"
  | "productive"
  | "building"
  | "fresh"
  | "maintenance"
  | "detraining";

// ---------- 4-week vs previous-4-week trend comparison ----------

export interface TrendMetric {
  key: string;
  current: number;
  previous: number;
  /** Percent change (current vs previous), positive = current is higher */
  pctChange: number;
  /** True when an increase counts as an improvement (e.g. distance ↑ good, HR ↑ bad). */
  higherIsBetter: boolean;
  /** Direction relative to "good": "improving" | "declining" | "flat" */
  direction: "improving" | "declining" | "flat";
}

export interface TrendComparison {
  metrics: Record<string, TrendMetric>;
  hasData: boolean;
  currentWeeks: number;
  previousWeeks: number;
}

interface WindowAgg {
  totalDistanceM: number;
  totalMovingS: number;
  totalElevationM: number;
  sessions: number;
  hrSum: number;
  hrCount: number;
  paceWeightedSum: number; // sum of (sec/m * distance)
  paceWeightDist: number;  // sum of distance for paced sessions
  cardioEffSum: number;    // sum of (speed_m_s * 60 / hr) per session
  cardioEffCount: number;
  weeksSpan: number;
}

function emptyAgg(): WindowAgg {
  return {
    totalDistanceM: 0,
    totalMovingS: 0,
    totalElevationM: 0,
    sessions: 0,
    hrSum: 0,
    hrCount: 0,
    paceWeightedSum: 0,
    paceWeightDist: 0,
    cardioEffSum: 0,
    cardioEffCount: 0,
    weeksSpan: 4,
  };
}

const runningSports = new Set([
  "Run", "TrailRun", "VirtualRun", "Treadmill",
  "running", "trail_running", "treadmill_running",
]);

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

/**
 * Compare last 4 weeks vs the prior 4 weeks across key metrics.
 * Window boundaries are based on `weekStart()` of "now".
 */
export function buildTrendComparison(
  activities: LoadActivity[] & { distance?: number; total_elevation_gain?: number; average_speed?: number }[] | any[],
): TrendComparison {
  const now = new Date();
  const currentWeekStart = weekStart(now);
  // Current window = the 4 weeks ending with the current week (inclusive)
  const currentWindowStart = new Date(currentWeekStart);
  currentWindowStart.setDate(currentWindowStart.getDate() - 3 * 7);

  // Previous window: default to the 4 weeks immediately before the current window,
  // but if that block has no activities, slide back (up to 12 months) to the most
  // recent 4-week block that DOES have activity. This avoids showing 0s when the
  // user simply had a gap (e.g. ran in Jan but not in Feb/Mar).
  const immediatePrevStart = new Date(currentWindowStart);
  immediatePrevStart.setDate(immediatePrevStart.getDate() - 4 * 7);

  // Pre-parse activity dates once
  const parsed: { date: Date; act: any }[] = [];
  for (const act of activities as any[]) {
    const date = new Date(act.start_date);
    if (!isNaN(date.getTime())) parsed.push({ date, act });
  }

  let previousWindowStart = immediatePrevStart;
  let previousWindowEnd = new Date(currentWindowStart); // exclusive
  const MAX_SLIDE_BACK_WEEKS = 52;
  for (let slide = 0; slide < MAX_SLIDE_BACK_WEEKS / 4; slide++) {
    const winStart = new Date(immediatePrevStart);
    winStart.setDate(winStart.getDate() - slide * 4 * 7);
    const winEnd = new Date(winStart);
    winEnd.setDate(winEnd.getDate() + 4 * 7);
    const hasAny = parsed.some(({ date }) => date >= winStart && date < winEnd);
    if (hasAny) {
      previousWindowStart = winStart;
      previousWindowEnd = winEnd;
      break;
    }
  }

  const curr = emptyAgg();
  const prev = emptyAgg();

  for (const { date, act } of parsed) {
    let bucket: WindowAgg | null = null;
    if (date >= currentWindowStart) bucket = curr;
    else if (date >= previousWindowStart && date < previousWindowEnd) bucket = prev;
    else continue;

    const distance = Number(act.distance) || 0;
    const moving = Number(act.moving_time) || 0;
    const elev = Number(act.total_elevation_gain) || 0;
    const avgHr = act.average_heartrate ? Number(act.average_heartrate) : null;
    const avgSpeed = Number(act.average_speed) || 0;

    bucket.totalDistanceM += distance;
    bucket.totalMovingS += moving;
    bucket.totalElevationM += elev;
    bucket.sessions += 1;

    if (avgHr && avgHr > 30) {
      bucket.hrSum += avgHr;
      bucket.hrCount += 1;
      if (avgSpeed > 0) {
        // simple cardiac efficiency proxy: meters per heartbeat per minute
        bucket.cardioEffSum += (avgSpeed * 60) / avgHr;
        bucket.cardioEffCount += 1;
      }
    }

    // Running pace only — weighted by distance
    if (runningSports.has(act.sport_type) && distance > 400 && moving > 60) {
      const secPerM = moving / distance;
      bucket.paceWeightedSum += secPerM * distance;
      bucket.paceWeightDist += distance;
    }
  }

  const hasData = curr.sessions > 0 || prev.sessions > 0;

  const buildMetric = (
    key: string,
    currVal: number,
    prevVal: number,
    higherIsBetter: boolean,
  ): TrendMetric => {
    const change = pctChange(currVal, prevVal);
    const epsilon = 1; // <1% delta = flat
    let direction: TrendMetric["direction"] = "flat";
    if (Math.abs(change) >= epsilon) {
      const positive = change > 0;
      direction = positive === higherIsBetter ? "improving" : "declining";
    }
    return { key, current: currVal, previous: prevVal, pctChange: change, higherIsBetter, direction };
  };

  // Per-week averages for volume/distance/sessions/elevation
  const W = 4;
  const weeklyVolumeS_curr = curr.totalMovingS / W;
  const weeklyVolumeS_prev = prev.totalMovingS / W;
  const weeklyDistKm_curr = curr.totalDistanceM / 1000 / W;
  const weeklyDistKm_prev = prev.totalDistanceM / 1000 / W;
  const weeklyElev_curr = curr.totalElevationM / W;
  const weeklyElev_prev = prev.totalElevationM / W;
  const sessionsPerWk_curr = curr.sessions / W;
  const sessionsPerWk_prev = prev.sessions / W;

  const avgSessionMin_curr = curr.sessions > 0 ? curr.totalMovingS / curr.sessions / 60 : 0;
  const avgSessionMin_prev = prev.sessions > 0 ? prev.totalMovingS / prev.sessions / 60 : 0;

  const avgHr_curr = curr.hrCount > 0 ? curr.hrSum / curr.hrCount : 0;
  const avgHr_prev = prev.hrCount > 0 ? prev.hrSum / prev.hrCount : 0;

  // Pace = sec/km (lower is better)
  const paceSecPerKm_curr =
    curr.paceWeightDist > 0 ? (curr.paceWeightedSum / curr.paceWeightDist) * 1000 : 0;
  const paceSecPerKm_prev =
    prev.paceWeightDist > 0 ? (prev.paceWeightedSum / prev.paceWeightDist) * 1000 : 0;

  const cardioEff_curr = curr.cardioEffCount > 0 ? curr.cardioEffSum / curr.cardioEffCount : 0;
  const cardioEff_prev = prev.cardioEffCount > 0 ? prev.cardioEffSum / prev.cardioEffCount : 0;

  const metrics: Record<string, TrendMetric> = {
    weeklyVolume: buildMetric("weeklyVolume", weeklyVolumeS_curr, weeklyVolumeS_prev, true),
    weeklyDistance: buildMetric("weeklyDistance", weeklyDistKm_curr, weeklyDistKm_prev, true),
    weeklyElevation: buildMetric("weeklyElevation", weeklyElev_curr, weeklyElev_prev, true),
    sessionsPerWeek: buildMetric("sessionsPerWeek", sessionsPerWk_curr, sessionsPerWk_prev, true),
    avgSessionLength: buildMetric("avgSessionLength", avgSessionMin_curr, avgSessionMin_prev, true),
    avgHr: buildMetric("avgHr", avgHr_curr, avgHr_prev, false),
    runningPace: buildMetric("runningPace", paceSecPerKm_curr, paceSecPerKm_prev, false),
    cardiacEfficiency: buildMetric("cardiacEfficiency", cardioEff_curr, cardioEff_prev, true),
  };

  return { metrics, hasData, currentWeeks: W, previousWeeks: W };
}

export function classifyLoadStatus(series: WeekPoint[]): LoadStatusKey {
  if (series.length === 0) return "maintenance";
  const last = series[series.length - 1];
  const prev = series[Math.max(0, series.length - 5)];
  const ctlTrendPct = prev.fitness > 0 ? (last.fitness - prev.fitness) / prev.fitness : 0;

  if (last.form < -10) return "overreaching";
  if (last.form < 5 && ctlTrendPct > 0.05) return "productive";
  if (last.form >= 5 && ctlTrendPct > 0.02) return "building";
  if (last.form > 15 && ctlTrendPct < -0.05) return "detraining";
  if (last.form > 5) return "fresh";
  return "maintenance";
}

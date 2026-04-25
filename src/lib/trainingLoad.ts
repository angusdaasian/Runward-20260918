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
 * Build a 26-week weekly series with EWMA-based CTL/ATL/TSB.
 * τ_CTL = 6 weeks, τ_ATL = 1 week.
 */
export function buildWeeklyLoadSeries(
  activities: LoadActivity[],
  age?: number | null,
  weeks: number = 26,
): WeekPoint[] {
  const now = new Date();
  const currentWeek = weekStart(now);
  const startWeek = new Date(currentWeek);
  startWeek.setDate(startWeek.getDate() - (weeks - 1) * 7);

  // Init week buckets
  const buckets: { ws: Date; load: number }[] = [];
  for (let i = 0; i < weeks; i++) {
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
    if (idx >= 0 && idx < weeks) {
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

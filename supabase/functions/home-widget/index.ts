// Home Widget SVG endpoint for Despia iOS home screen widgets.
// Public endpoint: /functions/v1/home-widget?user=<uid>&type=<widget>&theme=<dark|light>
// Returns Content-Type: image/svg+xml. Always responds with an SVG (even errors).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Large square widget canvas (~iOS Large widget aspect)
const W = 360;
const H = 380;

const THEMES = {
  dark: { bg1: "#1c1c1e", bg2: "#0f0f10", fg: "#ffffff", sub: "#9aa0a6", accent: "#f59e0b" },
  light: { bg1: "#ffffff", bg2: "#f3f4f6", fg: "#0f172a", sub: "#64748b", accent: "#f59e0b" },
};

type Theme = typeof THEMES.dark;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgWrap(inner: string, t: Theme): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" rx="28" ry="28" fill="url(#bg)"/>
${inner}
</svg>`;
}

const FONT = `-apple-system,SF Pro,Helvetica,Arial`;

function header(title: string, t: Theme, sub?: string): string {
  const h = `<text x="22" y="34" font-family="${FONT}" font-size="13" font-weight="700" fill="${t.accent}" letter-spacing="1">${esc(title.toUpperCase())}</text>`;
  const s = sub ? `<text x="${W - 22}" y="34" text-anchor="end" font-family="${FONT}" font-size="11" font-weight="500" fill="${t.sub}">${esc(sub)}</text>` : "";
  return h + s + `<line x1="22" y1="46" x2="${W - 22}" y2="46" stroke="${t.sub}" stroke-opacity="0.15"/>`;
}

function bigHero(value: string, label: string, t: Theme, y = 110): string {
  return `<text x="22" y="${y}" font-family="${FONT}" font-size="44" font-weight="800" fill="${t.fg}" letter-spacing="-1">${esc(value)}</text>
<text x="22" y="${y + 24}" font-family="${FONT}" font-size="12" font-weight="500" fill="${t.sub}" letter-spacing="0.5">${esc(label.toUpperCase())}</text>`;
}

function statBlock(x: number, y: number, value: string, label: string, t: Theme): string {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="20" font-weight="700" fill="${t.fg}">${esc(value)}</text>
<text x="${x}" y="${y + 18}" font-family="${FONT}" font-size="10" font-weight="500" fill="${t.sub}" letter-spacing="0.4">${esc(label.toUpperCase())}</text>`;
}

function emptyMsg(title: string, msg: string, t: Theme): string {
  return svgWrap(header(title, t) +
    `<text x="22" y="${H / 2}" font-family="${FONT}" font-size="17" font-weight="700" fill="${t.fg}">${esc(msg)}</text>` +
    `<text x="22" y="${H / 2 + 22}" font-family="${FONT}" font-size="12" fill="${t.sub}">${esc("Open Runward to set up")}</text>`, t);
}

function footerHint(text: string, t: Theme): string {
  return `<line x1="22" y1="${H - 38}" x2="${W - 22}" y2="${H - 38}" stroke="${t.sub}" stroke-opacity="0.15"/>
<text x="22" y="${H - 18}" font-family="${FONT}" font-size="11" font-weight="500" fill="${t.sub}">${esc(text)}</text>`;
}

function fmtPace(speedMps: number | null | undefined): string {
  if (!speedMps || speedMps <= 0) return "—";
  const sPerKm = 1000 / speedMps;
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtDur(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtKm(m: number | null | undefined): string {
  if (m == null) return "—";
  return (m / 1000).toFixed(2);
}

async function fetchLatestActivity(supabase: any, userId: string) {
  const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const queries = [
    supabase.from("strava_activities").select("name,distance,moving_time,average_speed,average_heartrate,total_elevation_gain,start_date").eq("user_id", userId).gte("start_date", cutoff).order("start_date", { ascending: false }).limit(1),
    supabase.from("suunto_activities").select("name,distance,moving_time,average_speed,total_elevation_gain,start_date").eq("user_id", userId).gte("start_date", cutoff).order("start_date", { ascending: false }).limit(1),
    supabase.from("garmin_activities").select("activity_name,distance_meters,duration_seconds,average_speed,average_hr,calories,elevation_gain,avg_cadence,start_time").eq("user_id", userId).gte("start_time", cutoff).order("start_time", { ascending: false }).limit(1),
    supabase.from("terra_activities").select("activity_name,distance_meters,duration_seconds,average_speed,average_hr,calories,elevation_gain,avg_cadence,start_time").eq("user_id", userId).gte("start_time", cutoff).order("start_time", { ascending: false }).limit(1),
    supabase.from("apple_health_activities").select("name,distance,moving_time,average_speed,total_elevation_gain,calories,start_date").eq("user_id", userId).gte("start_date", cutoff).order("start_date", { ascending: false }).limit(1),
  ];
  const results = await Promise.allSettled(queries);
  const normalized: { date: Date; name: string; distM: number; durS: number; speed: number; hr: number | null; cal: number | null; elev: number | null; cad: number | null }[] = [];
  results.forEach((r) => {
    if (r.status !== "fulfilled" || !r.value?.data?.length) return;
    const row: any = r.value.data[0];
    normalized.push({
      date: new Date(row.start_date ?? row.start_time),
      name: row.name ?? row.activity_name ?? "Run",
      distM: Number(row.distance ?? row.distance_meters ?? 0),
      durS: Number(row.moving_time ?? row.duration_seconds ?? 0),
      speed: Number(row.average_speed ?? 0),
      hr: row.average_heartrate ?? row.average_hr ?? null,
      cal: row.calories ?? null,
      elev: row.total_elevation_gain ?? row.elevation_gain ?? null,
      cad: row.avg_cadence ?? null,
    });
  });
  normalized.sort((a, b) => b.date.getTime() - a.date.getTime());
  return normalized[0] ?? null;
}

async function fetchWeekDistance(supabase: any, userId: string): Promise<number> {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(now.getDate() - day);
  const iso = weekStart.toISOString();
  const q = await Promise.allSettled([
    supabase.from("strava_activities").select("distance").eq("user_id", userId).gte("start_date", iso),
    supabase.from("suunto_activities").select("distance").eq("user_id", userId).gte("start_date", iso),
    supabase.from("garmin_activities").select("distance_meters").eq("user_id", userId).gte("start_time", iso),
    supabase.from("terra_activities").select("distance_meters").eq("user_id", userId).gte("start_time", iso),
    supabase.from("apple_health_activities").select("distance").eq("user_id", userId).gte("start_date", iso),
  ]);
  let m = 0;
  q.forEach((r) => {
    if (r.status === "fulfilled" && r.value?.data) {
      for (const row of r.value.data as any[]) m += Number(row.distance ?? row.distance_meters ?? 0);
    }
  });
  return m;
}

async function renderLatestActivity(supabase: any, userId: string, t: Theme): Promise<string> {
  const a = await fetchLatestActivity(supabase, userId);
  if (!a) return emptyMsg("Latest Activity", "No recent runs", t);
  const dateStr = a.date.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
  const weekM = await fetchWeekDistance(supabase, userId);

  const r1 = 215; // first row y
  const r2 = 285; // second row y
  const c = [22, 142, 262]; // 3-col x positions

  const inner = header("Latest Activity", t, dateStr) +
    `<text x="22" y="74" font-family="${FONT}" font-size="15" font-weight="700" fill="${t.fg}">${esc(a.name.slice(0, 30))}</text>` +
    bigHero(fmtKm(a.distM), "kilometres", t, 130) +
    `<line x1="22" y1="180" x2="${W - 22}" y2="180" stroke="${t.sub}" stroke-opacity="0.12"/>` +
    statBlock(c[0], r1, fmtPace(a.speed), "Pace /km", t) +
    statBlock(c[1], r1, fmtDur(a.durS), "Time", t) +
    statBlock(c[2], r1, a.hr ? `${Math.round(a.hr)}` : "—", "Avg HR", t) +
    statBlock(c[0], r2, a.cal ? `${Math.round(a.cal)}` : "—", "Calories", t) +
    statBlock(c[1], r2, a.elev != null ? `${Math.round(a.elev)}m` : "—", "Elev gain", t) +
    statBlock(c[2], r2, a.cad ? `${Math.round(a.cad)}` : "—", "Cadence", t) +
    footerHint(`This week: ${fmtKm(weekM)} km`, t);
  return svgWrap(inner, t);
}

async function renderProgramWeek(supabase: any, userId: string, t: Theme): Promise<string> {
  const { data: plan } = await supabase
    .from("training_plans")
    .select("plan_data, created_at, weeks")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let items: { date: string; title: string }[] = [];
  let weekLabel = "";
  const pd: any = plan?.plan_data;
  if (pd && Array.isArray(pd.weeks) && pd.weeks.length) {
    const weeksSince = plan?.created_at
      ? Math.floor((Date.now() - new Date(plan.created_at).getTime()) / (7 * 86400000))
      : 0;
    const idx = Math.min(Math.max(0, weeksSince), pd.weeks.length - 1);
    weekLabel = `Week ${idx + 1} of ${pd.weeks.length}`;
    const wk = pd.weeks[idx];
    const sessions: any[] = wk?.sessions || wk?.workouts || wk?.days || [];
    items = sessions.slice(0, 7).map((s: any, i: number) => ({
      date: s.day || s.day_name || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] || "",
      title: s.title || s.name || s.type || s.workout || s.description || "Workout",
    }));
  }

  if (!items.length) return emptyMsg("This Week's Plan", "No workouts scheduled", t);

  const startY = 80;
  const rowH = 40;
  const lines = items.slice(0, 7).map((it, i) => {
    const y = startY + i * rowH;
    return `<rect x="22" y="${y - 22}" width="44" height="28" rx="6" fill="${t.accent}" fill-opacity="0.15"/>
<text x="44" y="${y - 3}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="${t.accent}">${esc(it.date.slice(0, 3))}</text>
<text x="78" y="${y - 3}" font-family="${FONT}" font-size="13" font-weight="600" fill="${t.fg}">${esc(String(it.title).slice(0, 26))}</text>
${i < items.length - 1 ? `<line x1="78" y1="${y + 14}" x2="${W - 22}" y2="${y + 14}" stroke="${t.sub}" stroke-opacity="0.08"/>` : ""}`;
  }).join("\n");

  return svgWrap(header("This Week's Plan", t, weekLabel) + lines, t);
}


async function fetchTodayHealth(supabase: any, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const { data: terra } = await supabase
    .from("terra_daily_health")
    .select("date, steps, resting_hr, sleep_seconds, sleep_score, hrv")
    .eq("user_id", userId)
    .gte("date", weekAgo)
    .order("date", { ascending: false })
    .limit(8);
  const { data: garmin } = await supabase
    .from("garmin_daily_health")
    .select("date, resting_hr, sleep_seconds, sleep_score, vo2max")
    .eq("user_id", userId)
    .gte("date", weekAgo)
    .order("date", { ascending: false })
    .limit(8);
  const today_t = (terra || []).find((r: any) => r.date === today) || (terra || [])[0];
  const yesterday_t = (terra || []).find((r: any) => r.date === yesterday) || null;
  const latest_g = (garmin || [])[0];
  return { today_t, yesterday_t, latest_g, terra: terra || [], garmin: garmin || [] };
}

async function fetchCaloriesToday(supabase: any, userId: string): Promise<number> {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const iso = start.toISOString();
  const q = await Promise.allSettled([
    supabase.from("terra_activities").select("calories").eq("user_id", userId).gte("start_time", iso),
    supabase.from("apple_health_activities").select("calories").eq("user_id", userId).gte("start_date", iso),
    supabase.from("garmin_activities").select("calories").eq("user_id", userId).gte("start_time", iso),
  ]);
  let cal = 0;
  q.forEach((r) => {
    if (r.status === "fulfilled" && r.value?.data) {
      for (const row of r.value.data as any[]) cal += Number(row.calories || 0);
    }
  });
  return cal;
}

function avg(vals: (number | null | undefined)[]): number | null {
  const nums = vals.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function renderHealth(supabase: any, userId: string, type: string, t: Theme): Promise<string> {
  const h = await fetchTodayHealth(supabase, userId);
  const today = h.today_t;
  const sleepRow = h.yesterday_t || today;

  // Per-metric layout: hero value + 7-day average context
  const heroSingle = (title: string, value: string, label: string, avg7: string | null) => {
    return svgWrap(
      header(title, t) +
      bigHero(value, label, t, 140) +
      `<text x="22" y="260" font-family="${FONT}" font-size="12" font-weight="500" fill="${t.sub}" letter-spacing="0.4">7-DAY AVERAGE</text>` +
      `<text x="22" y="290" font-family="${FONT}" font-size="28" font-weight="700" fill="${t.fg}">${esc(avg7 ?? "—")}</text>` +
      footerHint("Tap to open Runward", t),
      t,
    );
  };

  switch (type) {
    case "steps_today": {
      const v = today?.steps;
      const a = avg(h.terra.map((r: any) => r.steps));
      return heroSingle("Steps Today", v ? Number(v).toLocaleString() : "—", "steps", a ? Math.round(a).toLocaleString() : null);
    }
    case "calories_today": {
      const v = await fetchCaloriesToday(supabase, userId);
      return heroSingle("Calories Today", v ? Math.round(v).toLocaleString() : "—", "kcal", null);
    }
    case "rhr": {
      const v = today?.resting_hr ?? h.latest_g?.resting_hr;
      const a = avg([...h.terra.map((r: any) => r.resting_hr), ...h.garmin.map((r: any) => r.resting_hr)]);
      return heroSingle("Resting HR", v ? `${v}` : "—", "bpm", a ? `${Math.round(a)} bpm` : null);
    }
    case "sleep_last_night": {
      const sec = sleepRow?.sleep_seconds ?? (h.latest_g?.sleep_seconds);
      const v = sec ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : "—";
      const a = avg([...h.terra.map((r: any) => r.sleep_seconds), ...h.garmin.map((r: any) => r.sleep_seconds)]);
      const aStr = a ? `${Math.floor(a / 3600)}h ${Math.round((a % 3600) / 60)}m` : null;
      return heroSingle("Sleep Last Night", v, "duration", aStr);
    }
    case "sleep_score": {
      const v = sleepRow?.sleep_score ?? h.latest_g?.sleep_score;
      const a = avg([...h.terra.map((r: any) => r.sleep_score), ...h.garmin.map((r: any) => r.sleep_score)]);
      return heroSingle("Sleep Score", v ? `${v}` : "—", "/ 100", a ? `${Math.round(a)}` : null);
    }
    case "hrv": {
      const v = today?.hrv;
      const a = avg(h.terra.map((r: any) => r.hrv));
      return heroSingle("HRV", v ? `${Math.round(Number(v))}` : "—", "ms (RMSSD)", a ? `${Math.round(a)} ms` : null);
    }
    case "health":
    default: {
      const steps = today?.steps ? Number(today.steps).toLocaleString() : "—";
      const cal = await fetchCaloriesToday(supabase, userId);
      const calStr = cal ? Math.round(cal).toLocaleString() : "—";
      const rhr = today?.resting_hr ?? h.latest_g?.resting_hr;
      const sec = sleepRow?.sleep_seconds ?? h.latest_g?.sleep_seconds;
      const sleep = sec ? `${Math.floor(sec / 3600)}h${Math.round((sec % 3600) / 60)}m` : "—";
      const sleepScore = sleepRow?.sleep_score ?? h.latest_g?.sleep_score;
      const hrv = today?.hrv;
      const vo2 = h.latest_g?.vo2max;

      // 3-col x 2-row grid of big stats
      const cx = [22, 142, 262];
      const r1 = 100;
      const r2 = 195;
      const r3 = 290;
      const today_label = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

      const inner = header("Daily Health", t, today_label) +
        statBlock(cx[0], r1, steps, "Steps", t) +
        statBlock(cx[1], r1, calStr, "Calories", t) +
        statBlock(cx[2], r1, rhr ? `${rhr}` : "—", "RHR bpm", t) +
        `<line x1="22" y1="${r1 + 35}" x2="${W - 22}" y2="${r1 + 35}" stroke="${t.sub}" stroke-opacity="0.1"/>` +
        statBlock(cx[0], r2, sleep, "Sleep", t) +
        statBlock(cx[1], r2, sleepScore ? `${sleepScore}` : "—", "Sleep score", t) +
        statBlock(cx[2], r2, hrv ? `${Math.round(Number(hrv))}` : "—", "HRV ms", t) +
        `<line x1="22" y1="${r2 + 35}" x2="${W - 22}" y2="${r2 + 35}" stroke="${t.sub}" stroke-opacity="0.1"/>` +
        statBlock(cx[0], r3, vo2 ? `${Math.round(Number(vo2))}` : "—", "VO₂ max", t) +
        footerHint("Updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), t);
      return svgWrap(inner, t);
    }
  }
}

async function renderDurationWeek(supabase: any, userId: string, t: Theme): Promise<string> {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(now.getDate() - day);
  const iso = weekStart.toISOString();
  const queries = [
    supabase.from("strava_activities").select("moving_time,distance,start_date").eq("user_id", userId).gte("start_date", iso),
    supabase.from("suunto_activities").select("moving_time,distance,start_date").eq("user_id", userId).gte("start_date", iso),
    supabase.from("garmin_activities").select("duration_seconds,distance_meters,start_time").eq("user_id", userId).gte("start_time", iso),
    supabase.from("terra_activities").select("duration_seconds,distance_meters,start_time").eq("user_id", userId).gte("start_time", iso),
    supabase.from("apple_health_activities").select("moving_time,distance,start_date").eq("user_id", userId).gte("start_date", iso),
  ];
  const results = await Promise.allSettled(queries);
  let totalSec = 0; let totalM = 0; let runs = 0;
  const perDayKm = [0, 0, 0, 0, 0, 0, 0];
  results.forEach((r) => {
    if (r.status !== "fulfilled" || !r.value?.data) return;
    for (const row of r.value.data as any[]) {
      const sec = Number(row.moving_time ?? row.duration_seconds ?? 0);
      const m = Number(row.distance ?? row.distance_meters ?? 0);
      totalSec += sec; totalM += m; runs += 1;
      const d = new Date(row.start_date ?? row.start_time);
      const idx = (d.getDay() + 6) % 7;
      perDayKm[idx] += m / 1000;
    }
  });
  const avgPace = totalM > 0 && totalSec > 0 ? fmtPace(totalM / totalSec) : "—";

  // Bar chart
  const maxKm = Math.max(...perDayKm, 0.001);
  const chartTop = 220;
  const chartH = 90;
  const barW = 30;
  const gap = 14;
  const chartLeft = (W - (barW * 7 + gap * 6)) / 2;
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  const todayIdx = (now.getDay() + 6) % 7;
  const bars = perDayKm.map((km, i) => {
    const h = (km / maxKm) * chartH;
    const x = chartLeft + i * (barW + gap);
    const y = chartTop + (chartH - h);
    const fill = i === todayIdx ? t.accent : t.fg;
    const op = km > 0 ? "0.9" : "0.18";
    return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, 3)}" rx="4" fill="${fill}" fill-opacity="${op}"/>
<text x="${x + barW / 2}" y="${chartTop + chartH + 18}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="600" fill="${t.sub}">${dayLabels[i]}</text>`;
  }).join("");

  const inner = header("This Week", t, `${runs} run${runs === 1 ? "" : "s"}`) +
    statBlock(22, 90, fmtKm(totalM), "Distance km", t) +
    statBlock(142, 90, fmtDur(totalSec), "Duration", t) +
    statBlock(262, 90, avgPace, "Avg pace", t) +
    `<text x="22" y="170" font-family="${FONT}" font-size="11" font-weight="600" fill="${t.sub}" letter-spacing="0.5">DAILY DISTANCE</text>` +
    bars;
  return svgWrap(inner, t);
}

async function renderTrainingLoad(supabase: any, userId: string, t: Theme): Promise<string> {
  const since28 = new Date(Date.now() - 28 * 86400000).toISOString();
  const { data: g } = await supabase
    .from("garmin_activities")
    .select("training_load,start_time")
    .eq("user_id", userId)
    .gte("start_time", since28);
  const rows = g || [];
  const weekly = [0, 0, 0, 0];
  rows.forEach((r: any) => {
    const days = Math.floor((Date.now() - new Date(r.start_time).getTime()) / 86400000);
    const wIdx = Math.min(3, Math.floor(days / 7));
    weekly[3 - wIdx] += Number(r.training_load || 0);
  });
  const load7 = weekly[3];
  const load28 = weekly.reduce((a, b) => a + b, 0);
  const avg7 = load28 / 4;

  const maxL = Math.max(...weekly, 1);
  const chartTop = 230;
  const chartH = 80;
  const barW = 50;
  const gap = 26;
  const chartLeft = (W - (barW * 4 + gap * 3)) / 2;
  const labels = ["3w ago", "2w ago", "Last wk", "This wk"];
  const bars = weekly.map((v, i) => {
    const h = (v / maxL) * chartH;
    const x = chartLeft + i * (barW + gap);
    const y = chartTop + (chartH - h);
    const fill = i === 3 ? t.accent : t.fg;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, 3)}" rx="5" fill="${fill}" fill-opacity="${v > 0 ? "0.9" : "0.18"}"/>
<text x="${x + barW / 2}" y="${chartTop + chartH + 18}" text-anchor="middle" font-family="${FONT}" font-size="9" font-weight="600" fill="${t.sub}">${labels[i]}</text>`;
  }).join("");

  const inner = header("Training Load", t, "Last 4 weeks") +
    bigHero(load7 ? Math.round(load7).toString() : "—", "this week (TSS)", t, 130) +
    statBlock(22, 195, load28 ? Math.round(load28).toString() : "—", "28-day total", t) +
    statBlock(180, 195, avg7 ? Math.round(avg7).toString() : "—", "Weekly avg", t) +
    bars;
  return svgWrap(inner, t);
}

async function renderRacePredictor(supabase: any, userId: string, t: Theme): Promise<string> {
  const { data: g } = await supabase
    .from("garmin_daily_health")
    .select("vo2max,date")
    .eq("user_id", userId)
    .not("vo2max", "is", null)
    .order("date", { ascending: false })
    .limit(1);
  const v = Number((g || [])[0]?.vo2max ?? 0);

  // Daniels VDOT -> race time approximation (very rough): seconds = distKm * (3600 / pace_kph)
  // Use empirical: pace_kph ≈ 0.2989 * vo2max + 4.6 (rough fit). Adjusted per distance.
  const pred = (km: number, factor: number) => {
    if (!v) return "—";
    const kph = 0.2989 * v + 4.6;
    const adjusted = kph * factor; // factor < 1 for longer distances
    const sec = (km / adjusted) * 3600;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
  };

  const inner = header("Race Predictor", t, v ? `VO₂max ${Math.round(v)}` : "") +
    bigHero(v ? `${Math.round(v)}` : "—", "VO₂ max", t, 110) +
    `<line x1="22" y1="170" x2="${W - 22}" y2="170" stroke="${t.sub}" stroke-opacity="0.12"/>` +
    statBlock(22, 210, pred(5, 1.04), "5K", t) +
    statBlock(190, 210, pred(10, 1.0), "10K", t) +
    statBlock(22, 285, pred(21.0975, 0.94), "Half marathon", t) +
    statBlock(190, 285, pred(42.195, 0.88), "Marathon", t) +
    footerHint("Estimated from VO₂max", t);
  return svgWrap(inner, t);
}

function renderOpenApp(title: string, t: Theme): string {
  return svgWrap(header(title, t) +
    `<text x="22" y="${H / 2 - 10}" font-family="${FONT}" font-size="22" font-weight="800" fill="${t.fg}">Runward</text>` +
    `<text x="22" y="${H / 2 + 16}" font-family="${FONT}" font-size="13" fill="${t.sub}">Tap to view the full chart</text>`, t);
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const userId = url.searchParams.get("user") || "";
  const type = (url.searchParams.get("type") || "latest_activity").toLowerCase();
  const themeName = (url.searchParams.get("theme") || "dark").toLowerCase();
  const t = (THEMES as any)[themeName] || THEMES.dark;

  const headers = {
    ...corsHeaders,
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-store",
  };

  try {
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return new Response(emptyMsg("Runward", "Sign in to set up widget", t), { headers });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    let svg: string;
    switch (type) {
      case "latest_activity":
        svg = await renderLatestActivity(supabase, userId, t); break;
      case "program_week":
        svg = await renderProgramWeek(supabase, userId, t); break;
      case "steps_today":
      case "calories_today":
      case "rhr":
      case "sleep_last_night":
      case "sleep_score":
      case "hrv":
      case "health":
        svg = await renderHealth(supabase, userId, type, t); break;
      case "duration_week":
        svg = await renderDurationWeek(supabase, userId, t); break;
      case "training_load":
        svg = await renderTrainingLoad(supabase, userId, t); break;
      case "race_predictor":
        svg = await renderRacePredictor(supabase, userId, t); break;
      case "hr_zones":
        svg = renderOpenApp("Heart Rate Zones", t); break;
      case "trends":
        svg = renderOpenApp("Trends", t); break;
      case "year_heatmap":
        svg = renderOpenApp("Year Heatmap", t); break;
      default:
        svg = emptyMsg("Runward", "Unknown widget type", t);
    }
    return new Response(svg, { headers });
  } catch (e) {
    console.error("home-widget error", e);
    return new Response(emptyMsg("Runward", "Widget unavailable", t), { headers });
  }
});

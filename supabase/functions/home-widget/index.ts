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

const W = 360;
const H = 169;

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
<rect width="${W}" height="${H}" rx="22" ry="22" fill="url(#bg)"/>
${inner}
</svg>`;
}

function header(title: string, t: Theme): string {
  return `<text x="20" y="30" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="13" font-weight="600" fill="${t.accent}" letter-spacing="0.5">${esc(title.toUpperCase())}</text>`;
}

function bigStat(value: string, label: string, t: Theme, y = 80): string {
  return `
<text x="20" y="${y}" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="36" font-weight="800" fill="${t.fg}">${esc(value)}</text>
<text x="20" y="${y + 28}" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="13" font-weight="500" fill="${t.sub}">${esc(label)}</text>`;
}

function emptyMsg(title: string, msg: string, t: Theme): string {
  return svgWrap(header(title, t) +
    `<text x="20" y="80" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="16" font-weight="600" fill="${t.fg}">${esc(msg)}</text>` +
    `<text x="20" y="105" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="12" fill="${t.sub}">${esc("Open Runward to set up")}</text>`, t);
}

function fmtPace(speedMps: number | null | undefined): string {
  if (!speedMps || speedMps <= 0) return "—";
  const sPerKm = 1000 / speedMps;
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
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
  return (m / 1000).toFixed(2) + " km";
}

async function fetchLatestActivity(supabase: any, userId: string) {
  // Pull most recent run across all sources.
  const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const queries = [
    supabase.from("strava_activities").select("name,distance,moving_time,average_speed,average_heartrate,start_date").eq("user_id", userId).gte("start_date", cutoff).order("start_date", { ascending: false }).limit(1),
    supabase.from("suunto_activities").select("activity_name,distance,duration,avg_speed,avg_hr,start_time").eq("user_id", userId).gte("start_time", cutoff).order("start_time", { ascending: false }).limit(1),
    supabase.from("garmin_activities").select("activity_name,distance_meters,duration_seconds,average_speed,average_hr,start_time").eq("user_id", userId).gte("start_time", cutoff).order("start_time", { ascending: false }).limit(1),
    supabase.from("terra_activities").select("activity_name,distance_meters,duration_seconds,average_speed_mps,average_hr_bpm,start_time").eq("user_id", userId).gte("start_time", cutoff).order("start_time", { ascending: false }).limit(1),
    supabase.from("apple_health_activities").select("name,distance,duration,average_speed,average_hr,start_date").eq("user_id", userId).gte("start_date", cutoff).order("start_date", { ascending: false }).limit(1),
  ];
  const results = await Promise.allSettled(queries);
  const normalized: { date: Date; name: string; distM: number; durS: number; speed: number; hr: number | null }[] = [];
  results.forEach((r) => {
    if (r.status !== "fulfilled" || !r.value?.data?.length) return;
    const row: any = r.value.data[0];
    const date = new Date(row.start_date ?? row.start_time);
    normalized.push({
      date,
      name: row.name ?? row.activity_name ?? "Run",
      distM: Number(row.distance ?? row.distance_meters ?? 0),
      durS: Number(row.moving_time ?? row.duration ?? row.duration_seconds ?? 0),
      speed: Number(row.average_speed ?? row.avg_speed ?? row.average_speed_mps ?? 0),
      hr: row.average_heartrate ?? row.avg_hr ?? row.average_hr ?? row.average_hr_bpm ?? null,
    });
  });
  normalized.sort((a, b) => b.date.getTime() - a.date.getTime());
  return normalized[0] ?? null;
}

async function renderLatestActivity(supabase: any, userId: string, t: Theme): Promise<string> {
  const a = await fetchLatestActivity(supabase, userId);
  if (!a) return emptyMsg("Latest Activity", "No recent runs", t);
  const dateStr = a.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const inner = header("Latest Activity", t) +
    `<text x="20" y="56" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="14" font-weight="600" fill="${t.fg}">${esc(a.name.slice(0, 28))}</text>` +
    `<text x="20" y="74" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="11" fill="${t.sub}">${esc(dateStr)}</text>` +
    // 3 metrics row
    statBlock(20, 95, fmtKm(a.distM), "Distance", t) +
    statBlock(140, 95, fmtPace(a.speed), "Pace", t) +
    statBlock(250, 95, fmtDur(a.durS), "Time", t);
  return svgWrap(inner, t);
}

function statBlock(x: number, y: number, value: string, label: string, t: Theme): string {
  return `<text x="${x}" y="${y}" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="20" font-weight="700" fill="${t.fg}">${esc(value)}</text>
<text x="${x}" y="${y + 22}" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="11" fill="${t.sub}">${esc(label)}</text>
<text x="${x}" y="${y + 38}" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="11" fill="${t.sub}"> </text>`;
}

async function renderProgramWeek(supabase: any, userId: string, t: Theme): Promise<string> {
  // Latest training plan (AI or custom), pick current week from plan_data.weeks
  const { data: plan } = await supabase
    .from("training_plans")
    .select("plan_data, created_at, weeks")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let items: { date: string; title: string }[] = [];
  const pd: any = plan?.plan_data;
  if (pd && Array.isArray(pd.weeks) && pd.weeks.length) {
    const weeksSince = plan?.created_at
      ? Math.floor((Date.now() - new Date(plan.created_at).getTime()) / (7 * 86400000))
      : 0;
    const idx = Math.min(Math.max(0, weeksSince), pd.weeks.length - 1);
    const wk = pd.weeks[idx];
    const sessions: any[] = wk?.sessions || wk?.workouts || wk?.days || [];
    items = sessions.slice(0, 4).map((s: any, i: number) => ({
      date: s.day || s.day_name || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] || "",
      title: s.title || s.name || s.type || s.workout || s.description || "Workout",
    }));
  }

  if (!items.length) return emptyMsg("This Week's Plan", "No workouts scheduled", t);

  const lines = items.slice(0, 4).map((it, i) => {
    const y = 60 + i * 24;
    return `<circle cx="26" cy="${y - 4}" r="3" fill="${t.accent}"/>
<text x="38" y="${y}" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="13" font-weight="600" fill="${t.fg}">${esc(it.date)}</text>
<text x="78" y="${y}" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="13" fill="${t.fg}">${esc(String(it.title).slice(0, 30))}</text>`;
  }).join("\n");

  return svgWrap(header("This Week's Plan", t) + lines, t);
}


async function fetchTodayHealth(supabase: any, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { data: terra } = await supabase
    .from("terra_daily_health")
    .select("date, steps, calories_total, resting_hr, sleep_total_seconds, sleep_score, hrv_rmssd_ms")
    .eq("user_id", userId)
    .gte("date", yesterday)
    .order("date", { ascending: false })
    .limit(2);
  const { data: garmin } = await supabase
    .from("garmin_daily_health")
    .select("date, resting_hr, sleep_seconds, sleep_score, vo2max")
    .eq("user_id", userId)
    .gte("date", yesterday)
    .order("date", { ascending: false })
    .limit(2);
  const today_t = (terra || []).find((r: any) => r.date === today) || (terra || [])[0];
  const yesterday_t = (terra || []).find((r: any) => r.date === yesterday) || null;
  const latest_g = (garmin || [])[0];
  return { today_t, yesterday_t, latest_g };
}

async function renderHealth(supabase: any, userId: string, type: string, t: Theme): Promise<string> {
  const h = await fetchTodayHealth(supabase, userId);
  const today = h.today_t;
  const sleepRow = h.yesterday_t || today;
  switch (type) {
    case "steps_today": {
      const v = today?.steps;
      return svgWrap(header("Steps Today", t) + bigStat(v ? Number(v).toLocaleString() : "—", "steps", t), t);
    }
    case "calories_today": {
      const v = today?.calories_total;
      return svgWrap(header("Calories Today", t) + bigStat(v ? Number(v).toLocaleString() : "—", "kcal", t), t);
    }
    case "rhr": {
      const v = today?.resting_hr ?? h.latest_g?.resting_hr;
      return svgWrap(header("Resting HR", t) + bigStat(v ? `${v}` : "—", "bpm", t), t);
    }
    case "sleep_last_night": {
      const sec = sleepRow?.sleep_total_seconds ?? (h.latest_g?.sleep_seconds);
      const v = sec ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : "—";
      return svgWrap(header("Sleep Last Night", t) + bigStat(v, "duration", t), t);
    }
    case "sleep_score": {
      const v = sleepRow?.sleep_score ?? h.latest_g?.sleep_score;
      return svgWrap(header("Sleep Score", t) + bigStat(v ? `${v}` : "—", "/ 100", t), t);
    }
    case "hrv": {
      const v = today?.hrv_rmssd_ms;
      return svgWrap(header("HRV", t) + bigStat(v ? `${Math.round(Number(v))}` : "—", "ms (RMSSD)", t), t);
    }
    case "health":
    default: {
      const steps = today?.steps ? Number(today.steps).toLocaleString() : "—";
      const cal = today?.calories_total ? Number(today.calories_total).toLocaleString() : "—";
      const rhr = today?.resting_hr ?? h.latest_g?.resting_hr ?? "—";
      const sec = sleepRow?.sleep_total_seconds ?? h.latest_g?.sleep_seconds;
      const sleep = sec ? `${Math.floor(sec / 3600)}h${Math.round((sec % 3600) / 60)}m` : "—";
      const inner = header("Daily Health", t) +
        statBlock(20, 80, steps, "Steps", t) +
        statBlock(110, 80, cal, "Calories", t) +
        statBlock(200, 80, `${rhr}`, "RHR", t) +
        statBlock(280, 80, sleep, "Sleep", t);
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
    supabase.from("strava_activities").select("moving_time,distance").eq("user_id", userId).gte("start_date", iso),
    supabase.from("suunto_activities").select("duration,distance").eq("user_id", userId).gte("start_time", iso),
    supabase.from("garmin_activities").select("duration_seconds,distance_meters").eq("user_id", userId).gte("start_time", iso),
    supabase.from("terra_activities").select("duration_seconds,distance_meters").eq("user_id", userId).gte("start_time", iso),
    supabase.from("apple_health_activities").select("duration,distance").eq("user_id", userId).gte("start_date", iso),
  ];
  const results = await Promise.allSettled(queries);
  let totalSec = 0; let totalM = 0;
  results.forEach((r) => {
    if (r.status !== "fulfilled" || !r.value?.data) return;
    for (const row of r.value.data as any[]) {
      totalSec += Number(row.moving_time ?? row.duration ?? row.duration_seconds ?? 0);
      totalM += Number(row.distance ?? row.distance_meters ?? 0);
    }
  });
  const inner = header("This Week", t) +
    statBlock(20, 80, fmtDur(totalSec), "Duration", t) +
    statBlock(180, 80, fmtKm(totalM), "Distance", t);
  return svgWrap(inner, t);
}

async function renderTrainingLoad(supabase: any, userId: string, t: Theme): Promise<string> {
  // Sum recent week training_load from garmin / approximate from terra
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: g } = await supabase.from("garmin_activities").select("training_load").eq("user_id", userId).gte("start_time", since);
  let load = 0; (g || []).forEach((r: any) => { load += Number(r.training_load || 0); });
  return svgWrap(header("Training Load (7d)", t) + bigStat(load ? Math.round(load).toString() : "—", "TSS-equivalent", t), t);
}

async function renderRacePredictor(supabase: any, userId: string, t: Theme): Promise<string> {
  // Show latest VO2max as a proxy with hint
  const { data: g } = await supabase.from("garmin_daily_health").select("vo2max,date").eq("user_id", userId).not("vo2max", "is", null).order("date", { ascending: false }).limit(1);
  const v = (g || [])[0]?.vo2max;
  const inner = header("Race Predictor", t) +
    bigStat(v ? `${Math.round(Number(v))}` : "—", "VO₂max", t) +
    `<text x="20" y="150" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="11" fill="${t.sub}">Open Runward for predicted times</text>`;
  return svgWrap(inner, t);
}

function renderOpenApp(title: string, t: Theme): string {
  return svgWrap(header(title, t) +
    `<text x="20" y="85" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="16" font-weight="700" fill="${t.fg}">Runward</text>` +
    `<text x="20" y="108" font-family="-apple-system,SF Pro,Helvetica,Arial" font-size="12" fill="${t.sub}">Tap to view the full chart</text>`, t);
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

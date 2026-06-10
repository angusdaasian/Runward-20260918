// Home Widget SVG endpoint for Despia iOS home screen widgets.
// Public endpoint: /functions/v1/home-widget?user=<uid>&type=<widget>&theme=<dark|light>&size=<small|medium|large>
// Returns Content-Type: image/svg+xml.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type SizeName = "small" | "medium" | "large";
const SIZES: Record<SizeName, { w: number; h: number }> = {
  small: { w: 360, h: 360 },   // iOS Small (square)
  medium: { w: 360, h: 170 },  // iOS Medium (wide rectangle)
  large: { w: 360, h: 380 },   // iOS Large (square-ish)
};

const THEMES = {
  dark: { bg1: "#1c1c1e", bg2: "#0f0f10", fg: "#ffffff", sub: "#9aa0a6", accent: "#f59e0b" },
  light: { bg1: "#ffffff", bg2: "#f3f4f6", fg: "#0f172a", sub: "#64748b", accent: "#f59e0b" },
};
type Theme = typeof THEMES.dark;
const FONT = `-apple-system,SF Pro,Helvetica,Arial`;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Card model: each widget produces this normalized data, then we lay it out per size ──
interface Stat { value: string; label: string }
interface WidgetCard {
  title: string;
  sub?: string;
  hero: { value: string; label: string };
  stats: Stat[];          // up to 6 supporting stats
  bars?: { label: string; value: number; highlight?: boolean }[]; // optional chart, large only
  barUnit?: string;
  footer?: string;
}

// ── SVG layout per size ──
function frame(W: number, H: number, t: Theme, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" rx="28" ry="28" fill="url(#bg)"/>
${inner}
</svg>`;
}

function renderCard(card: WidgetCard, size: SizeName, t: Theme): string {
  const { w: W, h: H } = SIZES[size];

  if (size === "medium") {
    // Wide: header top, hero left, up to 3 stats right
    const stats = card.stats.slice(0, 3);
    const inner =
      `<text x="20" y="26" font-family="${FONT}" font-size="11" font-weight="700" fill="${t.accent}" letter-spacing="1">${esc(card.title.toUpperCase())}</text>` +
      (card.sub ? `<text x="${W - 20}" y="26" text-anchor="end" font-family="${FONT}" font-size="10" fill="${t.sub}">${esc(card.sub)}</text>` : "") +
      `<text x="20" y="78" font-family="${FONT}" font-size="32" font-weight="800" fill="${t.fg}" letter-spacing="-1">${esc(card.hero.value)}</text>` +
      `<text x="20" y="96" font-family="${FONT}" font-size="10" font-weight="500" fill="${t.sub}" letter-spacing="0.4">${esc(card.hero.label.toUpperCase())}</text>` +
      stats.map((s, i) => {
        const cols = stats.length;
        const colW = 180 / cols;
        const x = 180 + i * colW;
        return `<text x="${x}" y="78" font-family="${FONT}" font-size="16" font-weight="700" fill="${t.fg}">${esc(s.value)}</text>
<text x="${x}" y="94" font-family="${FONT}" font-size="9" font-weight="500" fill="${t.sub}" letter-spacing="0.3">${esc(s.label.toUpperCase())}</text>`;
      }).join("") +
      (card.footer ? `<text x="20" y="${H - 14}" font-family="${FONT}" font-size="10" fill="${t.sub}">${esc(card.footer)}</text>` : "");
    return frame(W, H, t, inner);
  }

  if (size === "small") {
    // Square: header, big hero centered, up to 2 stats in a row below
    const stats = card.stats.slice(0, 2);
    const inner =
      `<text x="22" y="34" font-family="${FONT}" font-size="13" font-weight="700" fill="${t.accent}" letter-spacing="1">${esc(card.title.toUpperCase())}</text>` +
      (card.sub ? `<text x="${W - 22}" y="34" text-anchor="end" font-family="${FONT}" font-size="11" fill="${t.sub}">${esc(card.sub)}</text>` : "") +
      `<line x1="22" y1="46" x2="${W - 22}" y2="46" stroke="${t.sub}" stroke-opacity="0.15"/>` +
      `<text x="22" y="160" font-family="${FONT}" font-size="48" font-weight="800" fill="${t.fg}" letter-spacing="-1.5">${esc(card.hero.value)}</text>` +
      `<text x="22" y="186" font-family="${FONT}" font-size="12" font-weight="500" fill="${t.sub}" letter-spacing="0.5">${esc(card.hero.label.toUpperCase())}</text>` +
      (stats.length
        ? `<line x1="22" y1="225" x2="${W - 22}" y2="225" stroke="${t.sub}" stroke-opacity="0.12"/>` +
          stats.map((s, i) => {
            const x = 22 + i * 160;
            return `<text x="${x}" y="275" font-family="${FONT}" font-size="22" font-weight="700" fill="${t.fg}">${esc(s.value)}</text>
<text x="${x}" y="295" font-family="${FONT}" font-size="10" font-weight="500" fill="${t.sub}" letter-spacing="0.4">${esc(s.label.toUpperCase())}</text>`;
          }).join("")
        : "") +
      (card.footer ? `<text x="22" y="${H - 18}" font-family="${FONT}" font-size="11" fill="${t.sub}">${esc(card.footer)}</text>` : "");
    return frame(W, H, t, inner);
  }

  // Large: header, hero, up to 6 stats in 3x2 grid, optional bar chart, footer
  const stats = card.stats.slice(0, 6);
  const c = [22, 142, 262];
  const heroY = 130;
  let cursor = card.bars && card.bars.length ? 195 : 215;
  const rowH = 70;

  let statsSvg = "";
  if (stats.length) {
    statsSvg += `<line x1="22" y1="${cursor - 35}" x2="${W - 22}" y2="${cursor - 35}" stroke="${t.sub}" stroke-opacity="0.12"/>`;
    stats.forEach((s, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = c[col];
      const y = cursor + row * rowH;
      statsSvg += `<text x="${x}" y="${y}" font-family="${FONT}" font-size="20" font-weight="700" fill="${t.fg}">${esc(s.value)}</text>
<text x="${x}" y="${y + 18}" font-family="${FONT}" font-size="10" font-weight="500" fill="${t.sub}" letter-spacing="0.4">${esc(s.label.toUpperCase())}</text>`;
      if (col === 2 && row === 0 && stats.length > 3) {
        statsSvg += `<line x1="22" y1="${y + 28}" x2="${W - 22}" y2="${y + 28}" stroke="${t.sub}" stroke-opacity="0.1"/>`;
      }
    });
  }

  let barsSvg = "";
  if (card.bars && card.bars.length) {
    const maxV = Math.max(...card.bars.map((b) => b.value), 0.001);
    const n = card.bars.length;
    const barW = n <= 4 ? 50 : 30;
    const gap = n <= 4 ? 26 : 14;
    const chartH = 80;
    const chartTop = H - 70 - chartH;
    const chartLeft = (W - (barW * n + gap * (n - 1))) / 2;
    barsSvg = card.bars.map((b, i) => {
      const h = (b.value / maxV) * chartH;
      const x = chartLeft + i * (barW + gap);
      const y = chartTop + (chartH - h);
      const fill = b.highlight ? t.accent : t.fg;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, 3)}" rx="5" fill="${fill}" fill-opacity="${b.value > 0 ? "0.9" : "0.18"}"/>
<text x="${x + barW / 2}" y="${chartTop + chartH + 18}" text-anchor="middle" font-family="${FONT}" font-size="${n <= 4 ? 9 : 10}" font-weight="600" fill="${t.sub}">${esc(b.label)}</text>`;
    }).join("");
  }

  const inner =
    `<text x="22" y="34" font-family="${FONT}" font-size="13" font-weight="700" fill="${t.accent}" letter-spacing="1">${esc(card.title.toUpperCase())}</text>` +
    (card.sub ? `<text x="${W - 22}" y="34" text-anchor="end" font-family="${FONT}" font-size="11" fill="${t.sub}">${esc(card.sub)}</text>` : "") +
    `<line x1="22" y1="46" x2="${W - 22}" y2="46" stroke="${t.sub}" stroke-opacity="0.15"/>` +
    `<text x="22" y="${heroY}" font-family="${FONT}" font-size="44" font-weight="800" fill="${t.fg}" letter-spacing="-1">${esc(card.hero.value)}</text>` +
    `<text x="22" y="${heroY + 24}" font-family="${FONT}" font-size="12" font-weight="500" fill="${t.sub}" letter-spacing="0.5">${esc(card.hero.label.toUpperCase())}</text>` +
    statsSvg + barsSvg +
    (card.footer ? `<line x1="22" y1="${H - 38}" x2="${W - 22}" y2="${H - 38}" stroke="${t.sub}" stroke-opacity="0.15"/>
<text x="22" y="${H - 18}" font-family="${FONT}" font-size="11" fill="${t.sub}">${esc(card.footer)}</text>` : "");
  return frame(W, H, t, inner);
}

function emptyCard(title: string, msg: string): WidgetCard {
  return { title, hero: { value: "—", label: msg }, stats: [], footer: "Open Runward to set up" };
}

// ── Formatters ──
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
function avg(vals: (number | null | undefined)[]): number | null {
  const nums = vals.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ── Data fetchers ──
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
  const normalized: any[] = [];
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

async function fetchTodayHealth(supabase: any, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const { data: terra } = await supabase
    .from("terra_daily_health")
    .select("date, steps, resting_hr, sleep_seconds, sleep_score, hrv")
    .eq("user_id", userId).gte("date", weekAgo).order("date", { ascending: false }).limit(8);
  const { data: garmin } = await supabase
    .from("garmin_daily_health")
    .select("date, resting_hr, sleep_seconds, sleep_score, vo2max")
    .eq("user_id", userId).gte("date", weekAgo).order("date", { ascending: false }).limit(8);
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

// ── Card builders per widget type ──
async function buildLatestActivity(supabase: any, userId: string): Promise<WidgetCard> {
  const a = await fetchLatestActivity(supabase, userId);
  if (!a) return emptyCard("Latest Activity", "No recent runs");
  const dateStr = a.date.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
  const weekM = await fetchWeekDistance(supabase, userId);
  return {
    title: "Latest Activity",
    sub: dateStr,
    hero: { value: fmtKm(a.distM), label: "kilometres" },
    stats: [
      { value: fmtPace(a.speed), label: "Pace /km" },
      { value: fmtDur(a.durS), label: "Time" },
      { value: a.hr ? `${Math.round(a.hr)}` : "—", label: "Avg HR" },
      { value: a.cal ? `${Math.round(a.cal)}` : "—", label: "Calories" },
      { value: a.elev != null ? `${Math.round(a.elev)}m` : "—", label: "Elev gain" },
      { value: a.cad ? `${Math.round(a.cad)}` : "—", label: "Cadence" },
    ],
    footer: `This week: ${fmtKm(weekM)} km`,
  };
}

async function buildProgramWeek(supabase: any, userId: string, size: SizeName): Promise<WidgetCard | string> {
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
      ? Math.floor((Date.now() - new Date(plan.created_at).getTime()) / (7 * 86400000)) : 0;
    const idx = Math.min(Math.max(0, weeksSince), pd.weeks.length - 1);
    weekLabel = `Week ${idx + 1} of ${pd.weeks.length}`;
    const wk = pd.weeks[idx];
    const sessions: any[] = wk?.sessions || wk?.workouts || wk?.days || [];
    items = sessions.map((s: any, i: number) => ({
      date: s.day || s.day_name || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] || "",
      title: s.title || s.name || s.type || s.workout || s.description || "Workout",
    }));
  }
  if (!items.length) return emptyCard("This Week's Plan", "No workouts scheduled");

  // Custom rendering for program week (list layout doesn't fit card model well)
  // For small/medium we use the card model with first 1-3 items as "stats".
  if (size === "large") {
    const t = THEMES.dark; // placeholder; real theme passed at call site — handled below
    // We return a sentinel and render specially below.
    return JSON.stringify({ __programWeek: true, items, weekLabel });
  }

  // small/medium: show "next" workout as hero
  const next = items[0];
  return {
    title: "This Week's Plan",
    sub: weekLabel,
    hero: { value: next.date.slice(0, 3) || "—", label: next.title.slice(0, 24) },
    stats: items.slice(1, 4).map((it) => ({ value: it.date.slice(0, 3), label: it.title.slice(0, 14) })),
  };
}

function renderProgramWeekLarge(items: { date: string; title: string }[], weekLabel: string, t: Theme): string {
  const { w: W, h: H } = SIZES.large;
  const startY = 80;
  const rowH = 40;
  const lines = items.slice(0, 7).map((it, i) => {
    const y = startY + i * rowH;
    return `<rect x="22" y="${y - 22}" width="44" height="28" rx="6" fill="${t.accent}" fill-opacity="0.15"/>
<text x="44" y="${y - 3}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="${t.accent}">${esc(it.date.slice(0, 3))}</text>
<text x="78" y="${y - 3}" font-family="${FONT}" font-size="13" font-weight="600" fill="${t.fg}">${esc(String(it.title).slice(0, 26))}</text>
${i < items.length - 1 ? `<line x1="78" y1="${y + 14}" x2="${W - 22}" y2="${y + 14}" stroke="${t.sub}" stroke-opacity="0.08"/>` : ""}`;
  }).join("\n");
  const inner =
    `<text x="22" y="34" font-family="${FONT}" font-size="13" font-weight="700" fill="${t.accent}" letter-spacing="1">THIS WEEK'S PLAN</text>` +
    `<text x="${W - 22}" y="34" text-anchor="end" font-family="${FONT}" font-size="11" fill="${t.sub}">${esc(weekLabel)}</text>` +
    `<line x1="22" y1="46" x2="${W - 22}" y2="46" stroke="${t.sub}" stroke-opacity="0.15"/>` +
    lines;
  return frame(W, H, t, inner);
}

async function buildHealth(supabase: any, userId: string, type: string): Promise<WidgetCard> {
  const h = await fetchTodayHealth(supabase, userId);
  const today = h.today_t;
  const sleepRow = h.yesterday_t || today;

  const singleStat = (title: string, value: string, label: string, avg7: string | null): WidgetCard => ({
    title, hero: { value, label },
    stats: avg7 ? [{ value: avg7, label: "7-day avg" }] : [],
    footer: "Tap to open Runward",
  });

  switch (type) {
    case "steps_today": {
      const v = today?.steps;
      const a = avg(h.terra.map((r: any) => r.steps));
      return singleStat("Steps Today", v ? Number(v).toLocaleString() : "—", "steps", a ? Math.round(a).toLocaleString() : null);
    }
    case "calories_today": {
      const v = await fetchCaloriesToday(supabase, userId);
      return singleStat("Calories Today", v ? Math.round(v).toLocaleString() : "—", "kcal", null);
    }
    case "rhr": {
      const v = today?.resting_hr ?? h.latest_g?.resting_hr;
      const a = avg([...h.terra.map((r: any) => r.resting_hr), ...h.garmin.map((r: any) => r.resting_hr)]);
      return singleStat("Resting HR", v ? `${v}` : "—", "bpm", a ? `${Math.round(a)} bpm` : null);
    }
    case "sleep_last_night": {
      const sec = sleepRow?.sleep_seconds ?? (h.latest_g?.sleep_seconds);
      const v = sec ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : "—";
      const a = avg([...h.terra.map((r: any) => r.sleep_seconds), ...h.garmin.map((r: any) => r.sleep_seconds)]);
      const aStr = a ? `${Math.floor(a / 3600)}h ${Math.round((a % 3600) / 60)}m` : null;
      return singleStat("Sleep Last Night", v, "duration", aStr);
    }
    case "sleep_score": {
      const v = sleepRow?.sleep_score ?? h.latest_g?.sleep_score;
      const a = avg([...h.terra.map((r: any) => r.sleep_score), ...h.garmin.map((r: any) => r.sleep_score)]);
      return singleStat("Sleep Score", v ? `${v}` : "—", "/ 100", a ? `${Math.round(a)}` : null);
    }
    case "hrv": {
      const v = today?.hrv;
      const a = avg(h.terra.map((r: any) => r.hrv));
      return singleStat("HRV", v ? `${Math.round(Number(v))}` : "—", "ms (RMSSD)", a ? `${Math.round(a)} ms` : null);
    }
    case "health":
    default: {
      const steps = today?.steps ? Number(today.steps).toLocaleString() : "—";
      const cal = await fetchCaloriesToday(supabase, userId);
      const rhr = today?.resting_hr ?? h.latest_g?.resting_hr;
      const sec = sleepRow?.sleep_seconds ?? h.latest_g?.sleep_seconds;
      const sleep = sec ? `${Math.floor(sec / 3600)}h${Math.round((sec % 3600) / 60)}m` : "—";
      const sleepScore = sleepRow?.sleep_score ?? h.latest_g?.sleep_score;
      const hrv = today?.hrv;
      const vo2 = h.latest_g?.vo2max;
      const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return {
        title: "Daily Health",
        sub: todayLabel,
        hero: { value: steps, label: "steps today" },
        stats: [
          { value: cal ? Math.round(cal).toLocaleString() : "—", label: "Calories" },
          { value: rhr ? `${rhr}` : "—", label: "RHR bpm" },
          { value: sleep, label: "Sleep" },
          { value: sleepScore ? `${sleepScore}` : "—", label: "Sleep score" },
          { value: hrv ? `${Math.round(Number(hrv))}` : "—", label: "HRV ms" },
          { value: vo2 ? `${Math.round(Number(vo2))}` : "—", label: "VO₂ max" },
        ],
        footer: "Updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      };
    }
  }
}

async function buildDurationWeek(supabase: any, userId: string): Promise<WidgetCard> {
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
  let totalSec = 0, totalM = 0, runs = 0;
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
  const todayIdx = (now.getDay() + 6) % 7;
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  return {
    title: "This Week",
    sub: `${runs} run${runs === 1 ? "" : "s"}`,
    hero: { value: fmtKm(totalM), label: "km this week" },
    stats: [
      { value: fmtDur(totalSec), label: "Duration" },
      { value: avgPace, label: "Avg pace" },
      { value: `${runs}`, label: "Runs" },
    ],
    bars: perDayKm.map((km, i) => ({ label: dayLabels[i], value: km, highlight: i === todayIdx })),
  };
}

async function buildTrainingLoad(supabase: any, userId: string): Promise<WidgetCard> {
  const since28 = new Date(Date.now() - 28 * 86400000).toISOString();
  const { data: g } = await supabase
    .from("garmin_activities").select("training_load,start_time")
    .eq("user_id", userId).gte("start_time", since28);
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
  return {
    title: "Training Load",
    sub: "Last 4 weeks",
    hero: { value: load7 ? Math.round(load7).toString() : "—", label: "this week (TSS)" },
    stats: [
      { value: load28 ? Math.round(load28).toString() : "—", label: "28-day total" },
      { value: avg7 ? Math.round(avg7).toString() : "—", label: "Weekly avg" },
    ],
    bars: weekly.map((v, i) => ({ label: ["3w", "2w", "1w", "Now"][i], value: v, highlight: i === 3 })),
  };
}

async function buildRacePredictor(supabase: any, userId: string): Promise<WidgetCard> {
  const { data: g } = await supabase
    .from("garmin_daily_health").select("vo2max,date")
    .eq("user_id", userId).not("vo2max", "is", null)
    .order("date", { ascending: false }).limit(1);
  const v = Number((g || [])[0]?.vo2max ?? 0);
  const pred = (km: number, factor: number): string => {
    if (!v) return "—";
    const kph = (0.2989 * v + 4.6) * factor;
    const sec = (km / kph) * 3600;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.round(sec % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
  };
  return {
    title: "Race Predictor",
    sub: v ? `VO₂max ${Math.round(v)}` : "",
    hero: { value: v ? `${Math.round(v)}` : "—", label: "VO₂ max" },
    stats: [
      { value: pred(5, 1.04), label: "5K" },
      { value: pred(10, 1.0), label: "10K" },
      { value: pred(21.0975, 0.94), label: "Half" },
      { value: pred(42.195, 0.88), label: "Marathon" },
    ],
    footer: "Estimated from VO₂max",
  };
}

function openAppCard(title: string): WidgetCard {
  return { title, hero: { value: "Runward", label: "Tap to view" }, stats: [], footer: "Open Runward for the full chart" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const userId = url.searchParams.get("user") || "";
  const type = (url.searchParams.get("type") || "latest_activity").toLowerCase();
  const themeName = (url.searchParams.get("theme") || "dark").toLowerCase();
  const sizeParam = (url.searchParams.get("size") || "large").toLowerCase() as SizeName;
  const size: SizeName = (["small", "medium", "large"] as SizeName[]).includes(sizeParam) ? sizeParam : "large";
  const t = (THEMES as any)[themeName] || THEMES.dark;

  const headers = {
    ...corsHeaders,
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-store",
  };

  try {
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return new Response(renderCard(emptyCard("Runward", "Sign in to set up widget"), size, t), { headers });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    let card: WidgetCard | null = null;
    switch (type) {
      case "latest_activity":
        card = await buildLatestActivity(supabase, userId); break;
      case "program_week": {
        const r = await buildProgramWeek(supabase, userId, size);
        if (typeof r === "string") {
          // large list-style override
          const parsed = JSON.parse(r);
          return new Response(renderProgramWeekLarge(parsed.items, parsed.weekLabel, t), { headers });
        }
        card = r; break;
      }
      case "steps_today":
      case "calories_today":
      case "rhr":
      case "sleep_last_night":
      case "sleep_score":
      case "hrv":
      case "health":
        card = await buildHealth(supabase, userId, type); break;
      case "duration_week":
        card = await buildDurationWeek(supabase, userId); break;
      case "training_load":
        card = await buildTrainingLoad(supabase, userId); break;
      case "race_predictor":
        card = await buildRacePredictor(supabase, userId); break;
      case "hr_zones":
        card = openAppCard("Heart Rate Zones"); break;
      case "trends":
        card = openAppCard("Trends"); break;
      case "year_heatmap":
        card = openAppCard("Year Heatmap"); break;
      default:
        card = emptyCard("Runward", "Unknown widget type");
    }
    return new Response(renderCard(card!, size, t), { headers });
  } catch (e) {
    console.error("home-widget error", e);
    return new Response(renderCard(emptyCard("Runward", "Widget unavailable"), size, t), { headers });
  }
});

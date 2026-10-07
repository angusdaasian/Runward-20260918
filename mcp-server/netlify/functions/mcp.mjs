import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ACT_COLS = "id,provider,activity_name,activity_type,start_time,duration_seconds,distance_meters,calories,average_hr,max_hr,elevation_gain,avg_cadence,training_load,vo2max,device_model";

const TOOLS = [
  {
    name: "list_runs",
    description: "List the user's RunWard activities (newest first). Optional date range (YYYY-MM-DD) and minimum distance in km.",
    inputSchema: { type: "object", properties: {
      from: { type: "string" }, to: { type: "string" },
      min_km: { type: "number" }, limit: { type: "number", description: "max 500, default 100" } } },
  },
  {
    name: "get_run",
    description: "Full details of one activity by id, including laps and heart-rate samples (downsampled).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "daily_health",
    description: "Daily health records: resting HR, HRV, sleep, steps, calories, VO2max. Optional date range (YYYY-MM-DD), default last 30 days.",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } },
  },
  {
    name: "training_summary",
    description: "Monthly totals (runs, km, hours) and longest runs over a date range (default last 12 months).",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } },
  },
];

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fmtRun = (r) => ({
  id: r.id, date: r.start_time, name: r.activity_name, type: r.activity_type,
  km: r.distance_meters ? +(r.distance_meters / 1000).toFixed(2) : null,
  duration_min: r.duration_seconds ? +(r.duration_seconds / 60).toFixed(1) : null,
  pace_min_per_km: r.distance_meters && r.duration_seconds ? +((r.duration_seconds / 60) / (r.distance_meters / 1000)).toFixed(2) : null,
  avg_hr: r.average_hr, max_hr: r.max_hr, elevation_m: r.elevation_gain, cadence: r.avg_cadence,
  calories: r.calories, training_load: r.training_load, device: r.device_model, source: r.provider,
});

async function runTool(userId, name, a = {}) {
  if (name === "list_runs") {
    let q = db.from("terra_activities").select(ACT_COLS).eq("user_id", userId).order("start_time", { ascending: false });
    if (isDate(a.from)) q = q.gte("start_time", a.from);
    if (isDate(a.to)) q = q.lte("start_time", a.to + "T23:59:59Z");
    if (typeof a.min_km === "number") q = q.gte("distance_meters", a.min_km * 1000);
    const { data, error } = await q.limit(Math.min(Math.max(Number(a.limit) || 100, 1), 500));
    if (error) throw error;
    return { count: data.length, runs: data.map(fmtRun) };
  }
  if (name === "get_run") {
    const { data, error } = await db.from("terra_activities").select(ACT_COLS + ",laps,hr_samples").eq("user_id", userId).eq("id", String(a.id)).maybeSingle();
    if (error) throw error;
    if (!data) return { error: "Not found" };
    let hr = Array.isArray(data.hr_samples) ? data.hr_samples : [];
    if (hr.length > 200) { const step = Math.ceil(hr.length / 200); hr = hr.filter((_, i) => i % step === 0); }
    return { ...fmtRun(data), laps: data.laps, hr_samples: hr };
  }
  if (name === "daily_health") {
    const to = isDate(a.to) ? a.to : new Date().toISOString().slice(0, 10);
    const from = isDate(a.from) ? a.from : new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const { data, error } = await db.from("terra_daily_health")
      .select("date,provider,resting_hr,hrv,sleep_seconds,sleep_score,steps,calories,vo2max")
      .eq("user_id", userId).gte("date", from).lte("date", to).order("date", { ascending: false }).limit(1000);
    if (error) throw error;
    return { from, to, days: data.map((d) => ({ ...d, sleep_hours: d.sleep_seconds ? +(d.sleep_seconds / 3600).toFixed(2) : null })) };
  }
  if (name === "training_summary") {
    const to = isDate(a.to) ? a.to : new Date().toISOString().slice(0, 10);
    const from = isDate(a.from) ? a.from : new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const rows = [];
    for (let off = 0; off < 10000; off += 1000) {
      const { data, error } = await db.from("terra_activities").select("start_time,distance_meters,duration_seconds,activity_name")
        .eq("user_id", userId).gte("start_time", from).lte("start_time", to + "T23:59:59Z")
        .order("start_time", { ascending: true }).range(off, off + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const months = {};
    for (const r of rows) {
      const m = r.start_time.slice(0, 7);
      months[m] ??= { runs: 0, km: 0, hours: 0 };
      months[m].runs++; months[m].km += (r.distance_meters || 0) / 1000; months[m].hours += (r.duration_seconds || 0) / 3600;
    }
    for (const m of Object.values(months)) { m.km = +m.km.toFixed(1); m.hours = +m.hours.toFixed(1); }
    const longest = [...rows].sort((x, y) => (y.distance_meters || 0) - (x.distance_meters || 0)).slice(0, 10)
      .map((r) => ({ date: r.start_time, name: r.activity_name, km: +((r.distance_meters || 0) / 1000).toFixed(2), duration_min: +((r.duration_seconds || 0) / 60).toFixed(1) }));
    return { from, to, total_runs: rows.length, months, longest };
  }
  throw new Error("Unknown tool: " + name);
}

async function authUser(req) {
  const url = new URL(req.url);
  let key = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  if (!key && auth?.startsWith("Bearer ")) key = auth.slice(7);
  if (!key || !/^rw_[0-9a-f]{64}$/.test(key)) return null;
  const hash = createHash("sha256").update(key).digest("hex");
  const { data } = await db.from("mcp_tokens").select("id,user_id,last_used_at").eq("token_hash", hash).maybeSingle();
  if (!data) return null;
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 5 * 60e3) {
    await db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return data.user_id;
}

async function handle(msg, userId) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notification
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: params?.protocolVersion || "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "runward", version: "1.0.0" },
        instructions: "Read-only access to the user's RunWard running activities and daily health data. Distances in km, pace in min/km.",
      });
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS });
    case "tools/call":
      try {
        const out = await runTool(userId, params?.name, params?.arguments || {});
        return ok({ content: [{ type: "text", text: JSON.stringify(out) }] });
      } catch (e) {
        return ok({ isError: true, content: [{ type: "text", text: String(e?.message || e) }] });
      }
    default: return err(-32601, "Method not found: " + method);
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return new Response("Method Not Allowed", { status: 405, headers: CORS });
  if (req.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Server not configured" }, 500);
  const userId = await authUser(req);
  if (!userId) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid or revoked RunWard link" } }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m, userId)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handle(body, userId);
  return res ? json(res) : new Response(null, { status: 202, headers: CORS });
};

export const config = { path: "/mcp" };

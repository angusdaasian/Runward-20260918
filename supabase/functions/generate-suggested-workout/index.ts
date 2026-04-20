import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (b: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: jsonHeaders });

const RUNNING_SPORTS = new Set([
  "Run", "TrailRun", "VirtualRun", "Treadmill",
  "running", "trail_running", "treadmill_running",
]);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface RecentRun {
  date: string;
  distance_km: number;
  duration_min: number;
  pace: string;
  avg_hr?: number | null;
  source: string;
}

function paceFromSpeed(speedMps: number): string {
  if (!speedMps || speedMps <= 0) return "--";
  const sec = 1000 / speedMps;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

// ── Vertex AI helper ──
async function callVertexAI(opts: { apiKey: string; model?: string; messages: Array<{ role: string; content: any }> }): Promise<Response> {
  const VERTEX_MODEL_MAP: Record<string, string> = {
    "google/gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
    "google/gemini-3-flash-preview": "gemini-3.1-flash-lite-preview",
  };
  const model = VERTEX_MODEL_MAP[opts.model || ""] || (opts.model || "gemini-3.1-flash-lite-preview").replace(/^google\//, "");
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${opts.apiKey}`;
  const systemParts: any[] = [];
  const contents: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") { systemParts.push({ text: typeof m.content === "string" ? m.content : "" }); continue; }
    const role = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: typeof m.content === "string" ? m.content : String(m.content) }] });
  }
  const body: any = { contents };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  const vRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!vRes.ok) return new Response(await vRes.text(), { status: vRes.status });
  const vData = await vRes.json();
  const text = vData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const token = auth.replace(/^Bearer\s+/i, "").trim();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY")!;
    if (!SUPABASE_URL || !SERVICE_KEY || !VERTEX_API_KEY) {
      return json({ error: "Server not configured" }, 500);
    }

    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userResp, error: uErr } = await svc.auth.getUser(token);
    if (uErr || !userResp?.user) return json({ error: "Unauthorized" }, 401);
    const user = userResp.user;

    const body = await req.json().catch(() => ({}));
    const lang: "en" | "zh" = body?.lang === "zh" ? "zh" : "en";
    const idealTime: { distance?: string; seconds?: number } | null = body?.idealTime ?? null;
    const isZh = lang === "zh";

    // --- Pull last 7 days of runs from all 3 sources ---
    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

    const [stravaRes, ahRes, garminRes, profileRes] = await Promise.all([
      svc.from("strava_activities")
        .select("name, sport_type, distance, moving_time, average_speed, average_heartrate, start_date")
        .eq("user_id", user.id).gte("start_date", since).order("start_date", { ascending: false }),
      svc.from("apple_health_activities")
        .select("name, sport_type, distance, moving_time, average_speed, average_heartrate, start_date")
        .eq("user_id", user.id).gte("start_date", since).order("start_date", { ascending: false }),
      svc.from("garmin_activities")
        .select("activity_name, activity_type, distance_meters, duration_seconds, average_speed, average_hr, start_time")
        .eq("user_id", user.id).gte("start_time", since).order("start_time", { ascending: false }),
      svc.from("profiles")
        .select("training_score, runs_per_week, age, sex")
        .eq("user_id", user.id).maybeSingle(),
    ]);

    const recent: RecentRun[] = [];
    for (const a of (stravaRes.data || [])) {
      if (!RUNNING_SPORTS.has(a.sport_type)) continue;
      recent.push({
        date: a.start_date,
        distance_km: +(a.distance / 1000).toFixed(2),
        duration_min: Math.round(a.moving_time / 60),
        pace: paceFromSpeed(a.average_speed),
        avg_hr: a.average_heartrate,
        source: "Strava",
      });
    }
    for (const a of (ahRes.data || [])) {
      if (!RUNNING_SPORTS.has(a.sport_type)) continue;
      recent.push({
        date: a.start_date,
        distance_km: +(a.distance / 1000).toFixed(2),
        duration_min: Math.round(a.moving_time / 60),
        pace: paceFromSpeed(a.average_speed),
        avg_hr: a.average_heartrate,
        source: "Apple Health",
      });
    }
    for (const a of (garminRes.data || [])) {
      const speed = a.average_speed && a.average_speed > 0
        ? a.average_speed
        : (a.distance_meters && a.duration_seconds ? a.distance_meters / a.duration_seconds : 0);
      recent.push({
        date: a.start_time,
        distance_km: +((a.distance_meters || 0) / 1000).toFixed(2),
        duration_min: Math.round((a.duration_seconds || 0) / 60),
        pace: paceFromSpeed(speed),
        avg_hr: a.average_hr,
        source: "Garmin",
      });
    }
    recent.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const profile = profileRes.data as any;
    const trainingScore = profile?.training_score ?? null;
    const runsPerWeek = profile?.runs_per_week ?? null;

    // --- Build context for AI ---
    let context = "";
    if (recent.length > 0) {
      context = `Runner's last 7 days of running (most recent first):\n`;
      for (const r of recent.slice(0, 10)) {
        const dateStr = new Date(r.date).toISOString().split("T")[0];
        context += `- ${dateStr}: ${r.distance_km} km in ${r.duration_min} min, pace ${r.pace}` +
          (r.avg_hr ? `, avg HR ${Math.round(r.avg_hr)}` : "") +
          ` (${r.source})\n`;
      }
    } else {
      context = `Runner has NO logged runs in the last 7 days.\n`;
      if (idealTime?.distance && idealTime?.seconds && idealTime.seconds > 0) {
        const h = Math.floor(idealTime.seconds / 3600);
        const m = Math.floor((idealTime.seconds % 3600) / 60);
        const s = idealTime.seconds % 60;
        const tStr = h > 0
          ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
          : `${m}:${String(s).padStart(2, "0")}`;
        context += `Use the runner's onboarding goal as the fitness anchor: target ${idealTime.distance} in ${tStr}.\n`;
      }
    }
    if (trainingScore != null) context += `Training score: ${trainingScore} (higher = fitter).\n`;
    if (runsPerWeek != null) context += `Typical runs/week: ${runsPerWeek}.\n`;

    const systemPrompt = isZh
      ? `你是專業跑步教練 AI。根據跑者最近七天表現（或入門目標），給出明日具體訓練建議。回覆繁體中文 Markdown。

格式：
## 明日建議訓練
- **類型**：（恢復跑 / 輕鬆有氧 / 節奏跑 / 間歇 / 休息）
- **距離**：X 公里
- **配速**：X:XX /km
- **時長**：約 X 分鐘
- **理由**：1-2 句說明

如果跑者最近訓練量大或配速辛苦 → 建議恢復或輕鬆。如果完全沒有跑步紀錄 → 給一個適合其目標水平的入門訓練。`
      : `You are a professional running coach AI. Given the runner's last 7 days (or onboarding goal if no runs), suggest tomorrow's concrete workout. Reply in Markdown.

Format:
## Suggested Workout
- **Type**: (Recovery / Easy aerobic / Tempo / Intervals / Rest)
- **Distance**: X km
- **Pace**: X:XX /km
- **Duration**: ~X min
- **Why**: 1-2 sentences

If recent volume was high or paces were taxing, suggest recovery/easy. If no runs at all, give a beginner-appropriate session matched to their goal pace.`;

    const aiResp = await callVertexAI({
      apiKey: VERTEX_API_KEY,
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: context },
      ],
    });
    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "Rate limited" }, 429);
      if (aiResp.status === 402) return json({ error: "Payment required" }, 402);
      const t = await aiResp.text();
      console.error("AI error:", aiResp.status, t);
      return json({ error: "AI gateway error" }, 500);
    }
    const aiData = await aiResp.json();
    const suggestion = aiData.choices?.[0]?.message?.content?.trim() || "";

    return json({ suggestion, basedOnRuns: recent.length });
  } catch (e) {
    console.error("generate-suggested-workout error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

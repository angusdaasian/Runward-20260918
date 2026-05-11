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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function callVertex(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  jsonMode?: boolean;
}): Promise<Response> {
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${opts.model}:generateContent?key=${opts.apiKey}`;
  const body: any = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingLevel: "low" },
      ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface Workout {
  type?: string | null;
  distance_km?: number | null;
  pace?: string | null;
  description?: string | null;
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
    const original: Workout = body?.original ?? {};
    const edited: Workout = body?.edited ?? {};
    const planContext: string | null = typeof body?.planContext === "string" ? body.planContext : null;

    if (!edited || (edited.distance_km == null && !edited.pace && !edited.description)) {
      return json({ error: "Missing edited workout" }, 400);
    }

    // Pull last 7 days of running for fitness context
    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const [stravaRes, garminRes, terraRes, profileRes] = await Promise.all([
      svc.from("strava_activities")
        .select("distance, moving_time, average_speed, average_heartrate, start_date")
        .eq("user_id", user.id).gte("start_date", since).order("start_date", { ascending: false }).limit(10),
      svc.from("garmin_activities")
        .select("distance_meters, duration_seconds, average_speed, average_hr, start_time")
        .eq("user_id", user.id).gte("start_time", since).order("start_time", { ascending: false }).limit(10),
      svc.from("terra_activities")
        .select("distance_meters, duration_seconds, average_speed, average_hr, start_time")
        .eq("user_id", user.id).gte("start_time", since).order("start_time", { ascending: false }).limit(10),
      svc.from("profiles")
        .select("training_score, runs_per_week, age").eq("user_id", user.id).maybeSingle(),
    ]);

    const recent: string[] = [];
    const fmt = (dist: number, dur: number, speed: number, hr: number | null) => {
      const km = (dist / 1000).toFixed(1);
      const min = Math.round(dur / 60);
      const paceSec = speed > 0 ? 1000 / speed : 0;
      const pm = Math.floor(paceSec / 60);
      const ps = Math.floor(paceSec % 60);
      const pace = paceSec > 0 ? `${pm}:${String(ps).padStart(2, "0")}/km` : "--";
      return `${km}km ${min}min ${pace}${hr ? ` HR${Math.round(hr)}` : ""}`;
    };
    for (const a of (stravaRes.data || [])) {
      recent.push(`${(a.start_date as string).slice(0, 10)}: ${fmt(a.distance, a.moving_time, a.average_speed, a.average_heartrate)}`);
    }
    for (const a of (garminRes.data || [])) {
      const sp = a.average_speed && a.average_speed > 0
        ? a.average_speed
        : (a.distance_meters && a.duration_seconds ? a.distance_meters / a.duration_seconds : 0);
      recent.push(`${(a.start_time as string).slice(0, 10)}: ${fmt(a.distance_meters || 0, a.duration_seconds || 0, sp, a.average_hr)}`);
    }
    for (const a of (terraRes.data || [])) {
      const sp = a.average_speed && a.average_speed > 0
        ? a.average_speed
        : (a.distance_meters && a.duration_seconds ? a.distance_meters / a.duration_seconds : 0);
      recent.push(`${(a.start_time as string).slice(0, 10)}: ${fmt(a.distance_meters || 0, a.duration_seconds || 0, sp, a.average_hr)}`);
    }

    const profile = profileRes.data as any;

    const w = (x: Workout) => {
      const parts: string[] = [];
      if (x.type) parts.push(`type=${x.type}`);
      if (x.distance_km != null) parts.push(`distance=${x.distance_km}km`);
      if (x.pace) parts.push(`pace=${x.pace}`);
      if (x.description) parts.push(`desc="${x.description}"`);
      return parts.join(", ") || "(empty)";
    };

    const userPrompt = `
Original planned workout: ${w(original)}
User-edited workout:      ${w(edited)}
${planContext ? `\nPlan context: ${planContext}` : ""}
${profile?.training_score ? `\nRunner training score (higher=fitter): ${profile.training_score}` : ""}
${profile?.runs_per_week ? `\nTypical runs/week: ${profile.runs_per_week}` : ""}

Last 7 days of runs (most recent first):
${recent.slice(0, 10).map((r) => `- ${r}`).join("\n") || "(no runs in last 7 days)"}
`.trim();

    const systemPrompt = (lang === "zh"
      ? `你是專業跑步教練。判斷跑者把計劃中的訓練改成新的版本是否合理。考慮：與原訓練的差距、跑者最近表現、訓練負荷、是否會增加受傷或過度訓練的風險。

只輸出 JSON：
{
  "verdict": "ok" | "caution" | "risky",
  "feedback": "1-2 句精簡的繁體中文教練回饋（香港用語）"
}

判定原則：
- ok：合理的微調（距離±20%、配速±15 秒/km、休息日改成輕鬆短跑等）。
- caution：差距較大但可接受，例如把休息日改成中等強度、把短輕鬆跑加長 50% 等。給出提醒。
- risky：明顯有受傷或過度訓練風險，例如把休息日改成長距離或高強度間歇、把易跑改成接近比賽配速、距離跳 2 倍以上、配速比近期表現快很多。`
      : `You are a professional running coach. Judge whether changing a planned workout into the user's edited version is sensible. Consider: how big the change is, the runner's recent performance, training load, and whether it raises injury or overtraining risk.

Output JSON ONLY:
{
  "verdict": "ok" | "caution" | "risky",
  "feedback": "1-2 short coach sentences in plain English"
}

Rules:
- ok: reasonable tweaks (distance ±20%, pace ±15 sec/km, rest day → easy short run).
- caution: bigger but acceptable change (e.g. rest day → moderate run, easy run lengthened by 50%). Add a heads-up.
- risky: clear injury/overtraining risk (rest day → long run or hard intervals, easy → near race pace, distance jump ≥2x, pace much faster than recent runs).`);

    const vRes = await callVertex({
      apiKey: VERTEX_API_KEY,
      model: "gemini-3.1-flash-preview",
      systemPrompt,
      userPrompt,
      jsonMode: true,
    });
    if (!vRes.ok) {
      const t = await vRes.text();
      console.error("validate AI error:", vRes.status, t);
      if (vRes.status === 429) return json({ error: "Rate limited" }, 429);
      if (vRes.status === 402) return json({ error: "Payment required" }, 402);
      return json({ error: "AI gateway error" }, 500);
    }
    const vData = await vRes.json();
    const text = vData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    let parsed: { verdict: string; feedback: string } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // try to extract JSON object
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }
    if (!parsed || !parsed.verdict) {
      return json({ verdict: "ok", feedback: lang === "zh" ? "已記錄變更。" : "Change saved." });
    }
    const verdict = ["ok", "caution", "risky"].includes(parsed.verdict) ? parsed.verdict : "ok";
    return json({
      verdict,
      feedback: parsed.feedback || (lang === "zh" ? "已記錄變更。" : "Change saved."),
    });
  } catch (e) {
    console.error("validate-workout-edit error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

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

const WORKOUT_TYPE_DESCRIPTIONS: Record<string, string> = {
  auto: "Coach picks the most appropriate session.",
  recovery: "Very easy recovery jog; conversational pace, low HR, short.",
  easy: "Easy aerobic run at conversational pace.",
  long: "Long steady run to build aerobic endurance.",
  tempo: "Comfortably hard tempo at lactate-threshold effort, ~20-40 min.",
  intervals: "VO2max intervals (e.g. 400m–1km reps with recovery).",
  progressive: "Progressive run that gradually increases pace each km.",
  fartlek: "Fartlek with mixed surges and easy segments.",
  hill: "Hill repeats — short hard uphill efforts with jog-down recovery.",
  race_pace: "Race-pace specific workout aligned to the runner's goal pace.",
};

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

// Find a planned workout for "today" inside a saved training plan.
function findTodayPlannedWorkout(planData: any, todayISO: string): any | null {
  if (!Array.isArray(planData)) return null;
  for (const week of planData) {
    for (const day of week?.days || []) {
      if (day?.date === todayISO) return day;
    }
  }
  return null;
}

// Pull a few upcoming planned workouts to give the AI context about training direction.
function nextPlannedWorkouts(planData: any, todayISO: string, limit = 5): any[] {
  if (!Array.isArray(planData)) return [];
  const all: any[] = [];
  for (const week of planData) {
    for (const day of week?.days || []) {
      if (day?.date && day.date >= todayISO) all.push(day);
    }
  }
  all.sort((a, b) => (a.date < b.date ? -1 : 1));
  return all.slice(0, limit);
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
    const todayDate: string | null = typeof body?.todayDate === "string" ? body.todayDate : null;
    const lastActivityDate: string | null = typeof body?.lastActivityDate === "string" ? body.lastActivityDate : null;
    const workoutType: string = typeof body?.workoutType === "string" ? body.workoutType : "auto";
    const workoutTypeLabel: string = typeof body?.workoutTypeLabel === "string" ? body.workoutTypeLabel : workoutType;
    const isZh = lang === "zh";

    // ── Translate-only mode: take an existing suggestion and translate it ──
    if (body?.translate === true && typeof body?.existingSuggestion === "string") {
      const targetLang: "en" | "zh" = body?.targetLang === "zh" ? "zh" : "en";
      const sysT = targetLang === "zh"
        ? `你是專業翻譯。把以下跑步訓練建議的 Markdown 翻譯成繁體中文（香港用語）。保留所有 Markdown 結構、標題層級、列表、粗體、配速數字（例如 5:30 /km 保持原樣）。只輸出翻譯結果，不要加任何前言。`
        : `You are a professional translator. Translate the following running workout suggestion Markdown into natural English. Preserve all Markdown structure, headings, lists, bold, and pace numbers (e.g. keep "5:30 /km" verbatim). Output only the translation, no preamble.`;
      const tResp = await callVertexAI({
        apiKey: VERTEX_API_KEY,
        model: "google/gemini-3.1-flash-lite-preview",
        messages: [
          { role: "system", content: sysT },
          { role: "user", content: body.existingSuggestion },
        ],
      });
      if (!tResp.ok) {
        if (tResp.status === 429) return json({ error: "Rate limited" }, 429);
        if (tResp.status === 402) return json({ error: "Payment required" }, 402);
        return json({ error: "AI gateway error" }, 500);
      }
      const tData = await tResp.json();
      const translated = tData.choices?.[0]?.message?.content?.trim() || "";
      return json({ suggestion: translated, targetLang });
    }

    // --- Pull last 7 days of runs from all 3 sources + active training plan ---
    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

    const [stravaRes, ahRes, garminRes, profileRes, planRes] = await Promise.all([
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
      svc.from("training_plans")
        .select("distance, target_time, goal, race_date, weeks, plan_data")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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

    const plan = planRes.data as any;
    const planData = plan?.plan_data ?? null;
    const todayPlanned = todayDate && planData ? findTodayPlannedWorkout(planData, todayDate) : null;
    const upcomingPlanned = todayDate && planData ? nextPlannedWorkouts(planData, todayDate, 5) : [];

    // --- Build context for AI ---
    let context = "";
    if (todayDate) context += `Today's date (user's local timezone): ${todayDate}.\n`;
    if (lastActivityDate) context += `Last activity date: ${lastActivityDate}.\n`;
    else context += `The runner has NO recorded activities yet.\n`;

    // Workout type the user picked
    const typeDesc = WORKOUT_TYPE_DESCRIPTIONS[workoutType] || WORKOUT_TYPE_DESCRIPTIONS.auto;
    if (workoutType && workoutType !== "auto") {
      context += `\nThe runner has REQUESTED a specific workout type: "${workoutTypeLabel}".\n`;
      context += `Type guidance: ${typeDesc}\n`;
      context += `You MUST design today's session as this type. Do NOT override their choice — only adjust distance/pace/intensity to suit their fitness and recovery.\n`;
    } else {
      context += `\nThe runner asked the coach to pick the best workout type for today (auto). Choose what fits their plan and recovery.\n`;
    }

    // Active plan context (highest priority anchor)
    if (plan) {
      context += `\nActive training plan: goal="${plan.goal ?? ""}", target distance=${plan.distance ?? "?"}, target time=${plan.target_time ?? "?"}, race date=${plan.race_date ?? "?"}, weeks=${plan.weeks ?? "?"}.\n`;
      if (todayPlanned) {
        context += `Today's planned workout from their plan: type=${todayPlanned.type ?? "?"}, distance_km=${todayPlanned.distance_km ?? "?"}.\n`;
        context += `Use this planned workout as the primary anchor. Tailor pace/structure to their recent performance.\n`;
      }
      if (upcomingPlanned.length > 0) {
        context += `Next ${upcomingPlanned.length} planned sessions:\n`;
        for (const d of upcomingPlanned) {
          context += `  - ${d.date}: ${d.type ?? "?"} ${d.distance_km ?? "?"} km\n`;
        }
      }
    } else {
      context += `\nNo training plan saved.\n`;
    }

    if (recent.length > 0) {
      context += `\nRunner's last 7 days of running (most recent first):\n`;
      for (const r of recent.slice(0, 10)) {
        const dateStr = new Date(r.date).toISOString().split("T")[0];
        context += `- ${dateStr}: ${r.distance_km} km in ${r.duration_min} min, pace ${r.pace}` +
          (r.avg_hr ? `, avg HR ${Math.round(r.avg_hr)}` : "") +
          ` (${r.source})\n`;
      }
    } else {
      context += `\nRunner has NO logged runs in the last 7 days.\n`;
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
    if (trainingScore != null) context += `\nTraining score: ${trainingScore} (higher = fitter).\n`;
    if (runsPerWeek != null) context += `Typical runs/week: ${runsPerWeek}.\n`;

    const systemPrompt = isZh
      ? `你是專業跑步教練 AI。根據跑者的訓練計劃（最高優先級）、最近七天表現，以及他們今天指定的訓練類型，給出**今日**具體訓練建議（不是明日）。回覆繁體中文 Markdown。

優先順序：
1. 如果跑者有訓練計劃且今天有安排，以該安排為主軸。
2. 如果跑者指定了訓練類型（不是 auto），必須遵守該類型。
3. 用最近七天表現決定具體距離、配速、時長。
4. 如果完全沒有跑步紀錄，使用入門目標作為基準，給適合的入門訓練。

格式：
## 今日建議訓練
- **類型**：（跑者指定的類型）
- **距離**：X 公里
- **配速**：X:XX /km（如為間歇等多段配速，請列出每段）
- **時長**：約 X 分鐘
- **暖身/收操**：簡短建議
- **理由**：1-2 句說明（連結到訓練計劃或最近恢復狀況）`
      : `You are a professional running coach AI. Given the runner's training plan (highest priority), last 7 days of activity, and the workout type they picked for today, suggest **today's** concrete workout (NOT tomorrow's). Reply in Markdown.

Priority:
1. If the runner has an active plan with a workout scheduled for today, anchor on that.
2. If the runner specified a workout type (not "auto"), you MUST honor that type.
3. Use the last 7 days of performance to set concrete distance, pace, and duration.
4. If there are no logged runs at all, fall back to the onboarding goal pace and prescribe a beginner-appropriate session.

Format:
## Today's Suggested Workout
- **Type**: (the requested type)
- **Distance**: X km
- **Pace**: X:XX /km (for intervals/progressive, list per segment)
- **Duration**: ~X min
- **Warm-up / Cool-down**: short note
- **Why**: 1-2 sentences (tie back to plan or recent recovery)`;

    const aiResp = await callVertexAI({
      apiKey: VERTEX_API_KEY,
      model: "google/gemini-3.1-flash-lite-preview",
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

    // Also generate the OTHER language so the client can switch instantly without waiting.
    let suggestion_en = isZh ? "" : suggestion;
    let suggestion_zh = isZh ? suggestion : "";
    try {
      const otherLang: "en" | "zh" = isZh ? "en" : "zh";
      const sysT = otherLang === "zh"
        ? `你是專業翻譯。把以下跑步訓練建議的 Markdown 翻譯成繁體中文（香港用語）。保留所有 Markdown 結構、標題層級、列表、粗體、配速數字（例如 5:30 /km 保持原樣）。只輸出翻譯結果，不要加任何前言。`
        : `You are a professional translator. Translate the following running workout suggestion Markdown into natural English. Preserve all Markdown structure, headings, lists, bold, and pace numbers (e.g. keep "5:30 /km" verbatim). Output only the translation, no preamble.`;
      const tResp = await callVertexAI({
        apiKey: VERTEX_API_KEY,
        model: "google/gemini-3.1-flash-lite-preview",
        messages: [
          { role: "system", content: sysT },
          { role: "user", content: suggestion },
        ],
      });
      if (tResp.ok) {
        const tData = await tResp.json();
        const translated = tData.choices?.[0]?.message?.content?.trim() || "";
        if (otherLang === "zh") suggestion_zh = translated;
        else suggestion_en = translated;
      }
    } catch (e) {
      console.warn("translation step failed:", e);
    }

    return json({
      suggestion,
      suggestion_en,
      suggestion_zh,
      basedOnRuns: recent.length,
      hasPlan: !!plan,
      hasPlannedToday: !!todayPlanned,
      workoutType,
    });
  } catch (e) {
    console.error("generate-suggested-workout error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildVertexAuth } from "../_shared/vertex-auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY")!;
const WEBHOOK_AUTH_KEY = Deno.env.get("WEBHOOK_AUTH_KEY") || "";

function getVertexProjectId(): string {
  return Deno.env.get("GOOGLE_VERTEX_PROJECT_ID")
    || Deno.env.get("GOOGLE_CLOUD_PROJECT")
    || Deno.env.get("GCLOUD_PROJECT")
    || "inbound-isotope-500908-n8";
}

function getVertexLocation(): string {
  return Deno.env.get("GOOGLE_VERTEX_LOCATION") || "global";
}

const MODEL = "gemini-3.1-flash-lite-preview";

interface PlannedDay {
  date: string;
  type: string;
  distance_km: number | null;
  pace?: string | null;
}
interface WeekPlan {
  week: number;
  startDate: string;
  days: PlannedDay[];
}

// ---------- Helpers ----------
function paceSecPerKm(distMeters: number, secs: number): number | null {
  if (!distMeters || !secs) return null;
  const km = distMeters / 1000;
  if (km < 0.05) return null;
  return secs / km;
}
function parsePaceStr(p: string | null | undefined): number | null {
  if (!p) return null;
  const m = p.match(/(\d+):(\d+)/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const url = `https://aiplatform.googleapis.com/v1/projects/${getVertexProjectId()}/locations/${getVertexLocation()}/publishers/google/models/${MODEL}:generateContent?key=${VERTEX_API_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Vertex AI ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
}

// ---------- Activity gathering ----------
async function fetchActivities(admin: any, userId: string, startISO: string, endISO: string) {
  const [strava, garmin, terra, apple] = await Promise.all([
    admin.from("strava_activities").select("start_date,distance,moving_time,average_heartrate,max_heartrate,sport_type")
      .eq("user_id", userId).gte("start_date", startISO).lt("start_date", endISO),
    admin.from("garmin_activities").select("start_time,distance_meters,duration_seconds,average_hr,max_hr,activity_type")
      .eq("user_id", userId).gte("start_time", startISO).lt("start_time", endISO),
    admin.from("terra_activities").select("start_time,distance_meters,duration_seconds,average_hr,max_hr,activity_type")
      .eq("user_id", userId).gte("start_time", startISO).lt("start_time", endISO),
    admin.from("apple_health_activities").select("start_date,distance,moving_time,average_heartrate,max_heartrate,sport_type")
      .eq("user_id", userId).gte("start_date", startISO).lt("start_date", endISO),
  ]);

  const norm: Array<{ date: string; distance_m: number; seconds: number; avg_hr: number | null; max_hr: number | null; type: string }> = [];
  for (const r of (strava.data ?? [])) norm.push({ date: r.start_date, distance_m: Number(r.distance) || 0, seconds: Number(r.moving_time) || 0, avg_hr: r.average_heartrate, max_hr: r.max_heartrate, type: r.sport_type || "Run" });
  for (const r of (apple.data ?? [])) norm.push({ date: r.start_date, distance_m: Number(r.distance) || 0, seconds: Number(r.moving_time) || 0, avg_hr: r.average_heartrate, max_hr: r.max_heartrate, type: r.sport_type || "Run" });
  for (const r of (garmin.data ?? [])) norm.push({ date: r.start_time, distance_m: Number(r.distance_meters) || 0, seconds: Number(r.duration_seconds) || 0, avg_hr: r.average_hr, max_hr: r.max_hr, type: r.activity_type || "Run" });
  for (const r of (terra.data ?? [])) norm.push({ date: r.start_time, distance_m: Number(r.distance_meters) || 0, seconds: Number(r.duration_seconds) || 0, avg_hr: r.average_hr, max_hr: r.max_hr, type: r.activity_type || "Run" });

  // Dedup: by (yyyy-mm-dd, rounded distance km, rounded duration min)
  const seen = new Set<string>();
  const dedup: typeof norm = [];
  for (const a of norm) {
    if (!a.date) continue;
    const day = new Date(a.date).toISOString().slice(0, 10);
    const k = `${day}|${Math.round(a.distance_m / 100)}|${Math.round(a.seconds / 30)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push({ ...a, date: day });
  }
  return dedup;
}

async function fetchHealth(admin: any, userId: string, startISO: string, endISO: string) {
  const [g, t] = await Promise.all([
    admin.from("garmin_daily_health").select("date,resting_hr,sleep_score,vo2max").eq("user_id", userId).gte("date", startISO.slice(0, 10)).lt("date", endISO.slice(0, 10)),
    admin.from("terra_daily_health").select("date,resting_hr,sleep_score,vo2max").eq("user_id", userId).gte("date", startISO.slice(0, 10)).lt("date", endISO.slice(0, 10)),
  ]);
  const all = [...(g.data ?? []), ...(t.data ?? [])];
  const rhrs = all.map((r) => r.resting_hr).filter((v): v is number => typeof v === "number" && v > 0);
  const sleeps = all.map((r) => r.sleep_score).filter((v): v is number => typeof v === "number" && v > 0);
  const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  return { avg_resting_hr: avg(rhrs), avg_sleep_score: avg(sleeps), days_with_data: all.length };
}

// ---------- Scoring ----------
function scoreWeek(planned: PlannedDay[], actual: Awaited<ReturnType<typeof fetchActivities>>, health: Awaited<ReturnType<typeof fetchHealth>>) {
  const plannedRuns = planned.filter((d) => d.type !== "Rest" && (d.distance_km ?? 0) > 0);
  const plannedKm = plannedRuns.reduce((s, d) => s + (d.distance_km ?? 0), 0);
  const actualKm = actual.reduce((s, a) => s + a.distance_m / 1000, 0);

  // Distance: how close actual matches planned (penalize both under and over)
  let distance_score = 0;
  if (plannedKm > 0) {
    const ratio = actualKm / plannedKm;
    distance_score = Math.round(clamp(100 - Math.abs(1 - ratio) * 100));
  } else if (actualKm > 0) {
    distance_score = 80;
  }

  // Completion: # of completed sessions vs planned (count days with any run)
  const ranDays = new Set(actual.filter((a) => a.distance_m > 500).map((a) => a.date));
  const completion_pct = plannedRuns.length > 0
    ? Math.round(clamp((ranDays.size / plannedRuns.length) * 100))
    : (actual.length > 0 ? 100 : 0);

  // HR: data presence + reasonable avg (115-165 bpm sweet spot for endurance avg)
  const hrs = actual.map((a) => a.avg_hr).filter((v): v is number => typeof v === "number" && v > 0);
  let hr_score = 0;
  if (hrs.length) {
    const avgHr = hrs.reduce((s, v) => s + v, 0) / hrs.length;
    const dev = Math.abs(avgHr - 145);
    hr_score = Math.round(clamp(100 - dev * 1.5));
  }

  // Pace: avg actual pace vs avg planned pace (if planned has pace strings)
  const plannedPaces = planned.map((d) => parsePaceStr(d.pace ?? null)).filter((v): v is number => v != null);
  const actualPaces = actual.map((a) => paceSecPerKm(a.distance_m, a.seconds)).filter((v): v is number => v != null);
  let pace_score = 0;
  if (actualPaces.length) {
    if (plannedPaces.length) {
      const aP = actualPaces.reduce((s, v) => s + v, 0) / actualPaces.length;
      const pP = plannedPaces.reduce((s, v) => s + v, 0) / plannedPaces.length;
      const diffPct = Math.abs(aP - pP) / pP;
      pace_score = Math.round(clamp(100 - diffPct * 200));
    } else {
      pace_score = 70; // ran but no planned reference
    }
  }

  // Recovery: based on resting HR + sleep score availability
  let recovery_score = 0;
  if (health.days_with_data > 0) {
    let s = 50;
    if (health.avg_sleep_score != null) s = (s + health.avg_sleep_score) / 2 + 10;
    if (health.avg_resting_hr != null) {
      const dev = Math.abs(health.avg_resting_hr - 55);
      s = (s + clamp(100 - dev * 1.5)) / 2;
    }
    recovery_score = Math.round(clamp(s));
  }

  const overall_score = Math.round(
    completion_pct * 0.35 + distance_score * 0.25 + pace_score * 0.15 + hr_score * 0.10 + recovery_score * 0.15,
  );

  return {
    completion_pct,
    distance_score,
    hr_score,
    pace_score,
    recovery_score,
    overall_score,
    stats: {
      planned_km: Math.round(plannedKm * 10) / 10,
      actual_km: Math.round(actualKm * 10) / 10,
      planned_runs: plannedRuns.length,
      completed_runs: ranDays.size,
      avg_hr: hrs.length ? Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length) : null,
      avg_pace_sec_per_km: actualPaces.length ? Math.round(actualPaces.reduce((s, v) => s + v, 0) / actualPaces.length) : null,
      avg_resting_hr: health.avg_resting_hr ? Math.round(health.avg_resting_hr) : null,
      avg_sleep_score: health.avg_sleep_score ? Math.round(health.avg_sleep_score) : null,
    },
  };
}

// ---------- Week resolution ----------
function pickWeek(planData: WeekPlan[], weekIndex?: number): { idx: number; week: WeekPlan } | null {
  if (!planData?.length) return null;
  if (typeof weekIndex === "number" && planData[weekIndex]) {
    return { idx: weekIndex, week: planData[weekIndex] };
  }
  // Default: most recently completed week (week_end < today)
  const today = new Date().toISOString().slice(0, 10);
  let best: { idx: number; week: WeekPlan } | null = null;
  for (let i = 0; i < planData.length; i++) {
    const w = planData[i];
    const end = w.days[w.days.length - 1]?.date;
    if (end && end < today) best = { idx: i, week: w };
  }
  return best ?? { idx: 0, week: planData[0] };
}

// ---------- Generate one review ----------
async function generateReview(admin: any, userId: string, planRow: any, weekIndex?: number) {
  const planData: WeekPlan[] = planRow.plan_data || [];
  const picked = pickWeek(planData, weekIndex);
  if (!picked) throw new Error("No week available");
  const { idx, week } = picked;

  const startDate = week.days[0]?.date;
  const endDate = week.days[week.days.length - 1]?.date;
  if (!startDate || !endDate) throw new Error("Week has no dates");

  // TEMP: WEEK_IN_FUTURE check disabled for testing — re-enable later
  // const todayStr = new Date().toISOString().slice(0, 10);
  // if (startDate > todayStr) {
  //   const err: any = new Error("Week has not started yet");
  //   err.code = "WEEK_IN_FUTURE";
  //   err.week_start = startDate;
  //   err.week_end = endDate;
  //   err.week_index = idx;
  //   throw err;
  // }

  const startISO = `${startDate}T00:00:00.000Z`;
  const endDateObj = new Date(endDate);
  endDateObj.setUTCDate(endDateObj.getUTCDate() + 1);
  const endISO = endDateObj.toISOString();

  const [activities, health] = await Promise.all([
    fetchActivities(admin, userId, startISO, endISO),
    fetchHealth(admin, userId, startISO, endISO),
  ]);

  const scored = scoreWeek(week.days, activities, health);

  const sysPrompt = `You are a running coach analyzing a user's weekly training plan adherence.
Return ONLY a JSON object with this exact shape:
{
  "en": "overall insight, 3-5 sentences, encouraging but honest, in English",
  "zh": "same overall insight in Traditional Chinese (Hong Kong / Taiwan), 繁體中文 only",
  "scores": {
    "distance": { "en": "1-2 sentence reason for the distance score", "zh": "繁體中文 version (Traditional Chinese only)" },
    "pace":     { "en": "1-2 sentence reason for the pace score",     "zh": "..." },
    "hr":       { "en": "1-2 sentence reason for the HR score",       "zh": "..." },
    "recovery": { "en": "1-2 sentence reason for the recovery score", "zh": "..." }
  }
}
IMPORTANT LANGUAGE RULES for every "zh" field:
- Write strictly in Traditional Chinese (繁體中文) as used in Hong Kong / Taiwan.
- DO NOT use any Simplified Chinese characters (简体字). Examples of forbidden simplified forms: 训练/练 (use 訓練/練), 关于 (use 關於), 这 (use 這), 体 (use 體), 时间 (use 時間), 后 (use 後), 学 (use 學), 应该 (use 應該), 节奏 (use 節奏), 强度 (use 強度), 长 (use 長), 实际 (use 實際), 计划 (use 計劃), 数据 (use 數據), 总 (use 總), 跑步训练 (use 跑步訓練).
- If unsure whether a character is traditional, choose the traditional form.
Each per-score explanation must reference the actual numbers (e.g. planned vs actual km, avg pace, avg HR, resting HR, sleep) and explain WHY the score is what it is. Do not wrap in markdown code fences.`;

  const userPrompt = `Week ${week.week} (${startDate} to ${endDate}) of plan:
- Planned: ${scored.stats.planned_runs} runs / ${scored.stats.planned_km}km
- Completed: ${scored.stats.completed_runs} runs / ${scored.stats.actual_km}km
- Completion: ${scored.completion_pct}%
- Distance score: ${scored.distance_score}/100
- Pace score: ${scored.pace_score}/100 (avg ${scored.stats.avg_pace_sec_per_km ? Math.floor(scored.stats.avg_pace_sec_per_km / 60) + ":" + String(scored.stats.avg_pace_sec_per_km % 60).padStart(2, "0") + "/km" : "n/a"})
- HR score: ${scored.hr_score}/100 (avg ${scored.stats.avg_hr ?? "n/a"} bpm)
- Recovery score: ${scored.recovery_score}/100 (resting HR ${scored.stats.avg_resting_hr ?? "n/a"}, sleep score ${scored.stats.avg_sleep_score ?? "n/a"})
- Overall: ${scored.overall_score}/100

Planned workouts:
${week.days.map((d) => `- ${d.date} ${d.type}${d.distance_km ? ` ${d.distance_km}km` : ""}${d.pace ? ` @ ${d.pace}` : ""}`).join("\n")}

Actual runs:
${activities.length ? activities.map((a) => `- ${a.date} ${(a.distance_m / 1000).toFixed(1)}km in ${Math.round(a.seconds / 60)}min`).join("\n") : "(none)"}`;

  let insights_en = "";
  let insights_zh = "";
  let scoreExplanations: any = null;
  try {
    const text = await callGemini(sysPrompt, userPrompt);
    const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      insights_en = parsed.en || "";
      insights_zh = parsed.zh || "";
      if (parsed.scores && typeof parsed.scores === "object") {
        scoreExplanations = parsed.scores;
      }
    } else {
      insights_en = text;
    }
  } catch (e) {
    console.warn("Gemini insight failed:", e);
  }

  const statsWithExplanations = {
    ...scored.stats,
    ...(scoreExplanations ? { explanations: scoreExplanations } : {}),
  };

  const row = {
    user_id: userId,
    plan_id: planRow.id,
    week_index: idx,
    week_start: startDate,
    week_end: endDate,
    completion_pct: scored.completion_pct,
    distance_score: scored.distance_score,
    hr_score: scored.hr_score,
    pace_score: scored.pace_score,
    recovery_score: scored.recovery_score,
    overall_score: scored.overall_score,
    stats: statsWithExplanations,
    insights_en,
    insights_zh,
  };

  const { data, error } = await admin
    .from("weekly_plan_reviews")
    .upsert(row, { onConflict: "user_id,plan_id,week_index" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Handler ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const isCron = url.searchParams.get("mode") === "cron" || req.headers.get("x-webhook-key") === WEBHOOK_AUTH_KEY;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (isCron) {
      // Iterate premium users with active plans
      const { data: subs } = await admin
        .from("premium_subscriptions")
        .select("user_id,expires_at")
        .gt("expires_at", new Date().toISOString());
      const userIds = Array.from(new Set((subs ?? []).map((s: any) => s.user_id)));
      let processed = 0, errors = 0;
      for (const uid of userIds) {
        try {
          const { data: plans } = await admin
            .from("training_plans")
            .select("*")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(1);
          const plan = plans?.[0];
          if (!plan) continue;
          await generateReview(admin, uid, plan);
          processed++;
        } catch (e) {
          console.error("review failed for", uid, e);
          errors++;
        }
      }
      return json({ ok: true, processed, errors });
    }

    // User-authenticated on-demand
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Premium check
    const { data: sub } = await admin
      .from("premium_subscriptions")
      .select("expires_at")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!sub) return json({ error: "Premium required", code: "PREMIUM_REQUIRED" }, 403);

    const body = await req.json().catch(() => ({}));
    const { plan_id, week_index, action } = body as { plan_id?: string; week_index?: number; action?: string };

    // List existing reviews
    if (action === "list") {
      const q = admin.from("weekly_plan_reviews").select("*").eq("user_id", userId).order("week_start", { ascending: false });
      if (plan_id) q.eq("plan_id", plan_id);
      const { data } = await q;
      return json({ reviews: data ?? [] });
    }

    // Resolve plan
    let plan: any = null;
    if (plan_id) {
      const { data } = await admin.from("training_plans").select("*").eq("id", plan_id).eq("user_id", userId).maybeSingle();
      plan = data;
    } else {
      const { data } = await admin.from("training_plans").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      plan = data?.[0];
    }
    if (!plan) return json({ error: "No training plan found" }, 404);

    const review = await generateReview(admin, userId, plan, week_index);
    return json({ review });
  } catch (e: any) {
    console.error("weekly-plan-review error:", e);
    if (e?.code === "WEEK_IN_FUTURE") {
      return json({
        error: "Week has not started yet",
        code: "WEEK_IN_FUTURE",
        week_start: e.week_start,
        week_end: e.week_end,
        week_index: e.week_index,
      }, 400);
    }
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

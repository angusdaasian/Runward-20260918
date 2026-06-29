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

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const __baseUrl = `https://aiplatform.googleapis.com/v1/projects/${getVertexProjectId()}/locations/${getVertexLocation()}/publishers/google/models/${MODEL}:generateContent`;
  const { url, headers: __vxHeaders } = await buildVertexAuth(__baseUrl, VERTEX_API_KEY);
  const body = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2000,
      responseMimeType: "application/json",
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: __vxHeaders,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Vertex AI ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
}

async function fetchRecovery(admin: any, userId: string, days = 14, avgWindow = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const avgSince = new Date(Date.now() - avgWindow * 86400000).toISOString().slice(0, 10);
  const [garmin, terra] = await Promise.all([
    admin.from("garmin_daily_health").select("date,resting_hr,sleep_score")
      .eq("user_id", userId).gte("date", since).order("date", { ascending: false }),
    admin.from("terra_daily_health").select("date,resting_hr,sleep_score,hrv")
      .eq("user_id", userId).gte("date", since).order("date", { ascending: false }),
  ]);
  const pickPos = (a: any, b: any) => {
    const av = typeof a === "number" && a > 0 ? a : null;
    const bv = typeof b === "number" && b > 0 ? b : null;
    return av ?? bv;
  };
  const byDate = new Map<string, { date: string; rhr?: number | null; hrv?: number | null; sleep?: number | null }>();
  for (const r of (terra.data ?? [])) {
    byDate.set(r.date, {
      date: r.date,
      rhr: pickPos(r.resting_hr, null),
      hrv: pickPos(r.hrv, null),
      sleep: pickPos(r.sleep_score, null),
    });
  }
  for (const r of (garmin.data ?? [])) {
    const existing = byDate.get(r.date) ?? { date: r.date };
    byDate.set(r.date, {
      ...existing,
      rhr: pickPos(existing.rhr, r.resting_hr),
      hrv: existing.hrv ?? null,
      sleep: pickPos(existing.sleep, r.sleep_score),
    });
  }
  const rows = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  const recent = rows.filter((r) => r.date >= avgSince);
  const rhrs = recent.map((r) => r.rhr).filter((v): v is number => typeof v === "number" && v > 0);
  const hrvs = recent.map((r) => r.hrv).filter((v): v is number => typeof v === "number" && v > 0);
  const sleeps = recent.map((r) => r.sleep).filter((v): v is number => typeof v === "number" && v > 0);
  const avg = (a: number[]) => a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null;
  return {
    rows: rows.slice(0, 14),
    avg_rhr: avg(rhrs),
    avg_hrv: avg(hrvs),
    avg_sleep: avg(sleeps),
    has_data: rhrs.length > 0 || hrvs.length > 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { data: sub } = await admin
      .from("premium_subscriptions").select("expires_at")
      .eq("user_id", userId).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!sub) return json({ error: "Premium required", code: "PREMIUM_REQUIRED" }, 403);

    const body = await req.json().catch(() => ({}));
    const { plan_id, week_index, action = "analyze", adjusted_days, lang = "en" } = body as {
      plan_id?: string; week_index?: number; action?: "check" | "analyze" | "confirm"; adjusted_days?: any[]; lang?: "en" | "zh";
    };

    if (action === "check") {
      const recovery = await fetchRecovery(admin, userId);
      return json({ has_data: recovery.has_data, avg_rhr: recovery.avg_rhr, avg_hrv: recovery.avg_hrv });
    }

    if (!plan_id || typeof week_index !== "number") {
      return json({ error: "plan_id and week_index required" }, 400);
    }

    const { data: plan } = await admin.from("training_plans").select("*").eq("id", plan_id).eq("user_id", userId).maybeSingle();
    if (!plan) return json({ error: "Plan not found" }, 404);
    const planData: any[] = Array.isArray(plan.plan_data) ? plan.plan_data : [];
    const week = planData[week_index];
    if (!week) return json({ error: "Week not found" }, 404);

    if (action === "confirm") {
      if (!Array.isArray(adjusted_days) || adjusted_days.length !== week.days.length) {
        return json({ error: "adjusted_days mismatch" }, 400);
      }
      const newPlanData = planData.map((w, i) => i === week_index ? { ...w, days: adjusted_days } : w);
      const { error } = await admin.from("training_plans").update({ plan_data: newPlanData }).eq("id", plan_id);
      if (error) throw error;
      return json({ ok: true });
    }

    const recovery = await fetchRecovery(admin, userId);
    if (!recovery.has_data) {
      return json({ has_data: false, error: "No HRV/RHR data available" }, 200);
    }

    const sysPrompt = `You are an expert running coach. Given a runner's recent HRV, resting heart rate (RHR), and sleep score data plus their planned training week, suggest small adjustments to optimize recovery and adaptation. Be conservative: keep workout types, dates, and overall structure unless recovery clearly demands a change. Adjust distance_km, pace, or convert hard sessions to easy/rest only when data justifies it.

Return ONLY valid JSON with this exact shape:
{
  "summary_en": "2-4 sentence plain-language summary of what you changed and why, in English",
  "summary_zh": "用繁體中文寫的 2-4 句總結",
  "adjusted_days": [ /* same length & order as input days, each preserving keys: date, type, distance_km, pace, description; only change values that need adjusting. Keep date unchanged. */ ]
}`;

    const userPrompt = JSON.stringify({
      recovery_summary: {
        avg_rhr_14d: recovery.avg_rhr,
        avg_hrv_14d: recovery.avg_hrv,
        avg_sleep_score_14d: recovery.avg_sleep,
      },
      recent_daily: recovery.rows,
      planned_week: week.days,
      lang_hint: lang,
    });

    const raw = await callGemini(sysPrompt, userPrompt);
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    if (!parsed?.adjusted_days || !Array.isArray(parsed.adjusted_days)) {
      return json({ error: "AI returned invalid response", raw: raw.slice(0, 400) }, 502);
    }

    const sanitized = week.days.map((orig: any, i: number) => {
      const adj = parsed.adjusted_days[i] || {};
      return {
        ...orig,
        type: adj.type ?? orig.type,
        distance_km: adj.distance_km ?? orig.distance_km,
        pace: adj.pace ?? orig.pace ?? null,
        description: adj.description ?? orig.description ?? "",
        date: orig.date,
      };
    });

    return json({
      has_data: true,
      summary_en: parsed.summary_en || "",
      summary_zh: parsed.summary_zh || "",
      adjusted_days: sanitized,
      original_days: week.days,
      recovery: {
        avg_rhr: recovery.avg_rhr,
        avg_hrv: recovery.avg_hrv,
        avg_sleep: recovery.avg_sleep,
        sample_days: recovery.rows.length,
      },
    });
  } catch (e: any) {
    console.error("finetune-plan-week error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

// Finishes an AI training program: archives it to completed_programs and builds a
// one-time completion report (key-session audit, race result vs target, AI analysis).
// The report is generated once per plan — repeat calls return the stored report.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildVertexAuth } from "../_shared/vertex-auth.ts";
import {
  fetchActivities,
  fmtDuration,
  isKeySession,
  isRest,
  paceSecPerKm,
  parseDurationStr,
  raceDistanceMeters,
  type NormActivity,
} from "../_shared/planAdherence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY") || "";

// Higher-tier model for the one-off in-depth analysis, with fallbacks if unavailable.
const MODELS = ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview"];

const projectId = () =>
  Deno.env.get("GOOGLE_VERTEX_PROJECT_ID") || Deno.env.get("GOOGLE_CLOUD_PROJECT") || "inbound-isotope-500908-n8";
const location = () => Deno.env.get("GOOGLE_VERTEX_LOCATION") || "global";

const FM_ALIASES: Record<string, string> = { FM: "marathon", HM: "half", "5K": "5k", "10K": "10k" };

function isRunType(t: string) {
  return /run|跑|treadmill|trail|race|track/i.test(t || "Run") && !/walk|hike|ride|cycl|swim|步行|登山/i.test(t || "");
}

function classify(type: string): "long" | "interval" | "tempo" | "race" | "other" {
  if (/race|比賽/i.test(type)) return "race";
  if (/interval|repeat|間歇|fartlek/i.test(type)) return "interval";
  if (/tempo|threshold|節奏|乳酸/i.test(type)) return "tempo";
  if (/long|長課|長距離/i.test(type)) return "long";
  return "other";
}

interface KeyResult {
  week: number;
  planned_date: string;
  type: string;
  title: string | null;
  planned_km: number | null;
  status: "done" | "done_other_day" | "partial" | "missed";
  completed_date: string | null;
  actual_km: number | null;
  actual_pace: string | null;
}

function fmtPace(sec: number | null) {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function auditKeySessions(planData: any[], runs: NormActivity[], raceDate: string | null): KeyResult[] {
  const results: KeyResult[] = [];
  planData.forEach((week: any, wi: number) => {
    const days: any[] = Array.isArray(week?.days) ? week.days : [];
    const dates = days.map((d) => d.date).filter(Boolean).sort();
    if (!dates.length) return;
    const wStart = dates[0];
    const wEnd = dates[dates.length - 1];
    const weekRuns = runs.filter((a) => a.date >= wStart && a.date <= wEnd);
    const used = new Set<number>();
    const keys = days
      .filter((d) => d.date && !isRest(d.type, d.distance_km) && isKeySession(d.type, d.distance_km))
      .filter((d) => !(raceDate && d.date === raceDate && classify(d.type) === "race"))
      .sort((a, b) => (b.distance_km ?? 0) - (a.distance_km ?? 0));

    for (const d of keys) {
      const plannedKm = Number(d.distance_km) || 0;
      // Candidate runs anywhere in the same week; prefer the same day, then closest distance.
      let bestIdx = -1;
      let bestScore = Infinity;
      weekRuns.forEach((a, i) => {
        if (used.has(i)) return;
        const km = a.distance_m / 1000;
        const ratio = plannedKm > 0 ? km / plannedKm : 1;
        if (plannedKm > 0 && ratio < 0.6) return;
        const score = Math.abs(1 - ratio) + (a.date === d.date ? 0 : 0.25);
        if (score < bestScore) { bestScore = score; bestIdx = i; }
      });
      if (bestIdx < 0) {
        results.push({ week: wi + 1, planned_date: d.date, type: d.type, title: d.title ?? null, planned_km: plannedKm || null, status: "missed", completed_date: null, actual_km: null, actual_pace: null });
        continue;
      }
      used.add(bestIdx);
      const a = weekRuns[bestIdx];
      const km = a.distance_m / 1000;
      const ratio = plannedKm > 0 ? km / plannedKm : 1;
      results.push({
        week: wi + 1,
        planned_date: d.date,
        type: d.type,
        title: d.title ?? null,
        planned_km: plannedKm || null,
        status: ratio < 0.85 ? "partial" : a.date === d.date ? "done" : "done_other_day",
        completed_date: a.date,
        actual_km: Math.round(km * 100) / 100,
        actual_pace: fmtPace(paceSecPerKm(a.distance_m, a.seconds)),
      });
    }
  });
  return results;
}

async function callGemini(system: string, prompt: string): Promise<{ text: string; model: string }> {
  let lastErr = "";
  for (const model of MODELS) {
    const base = `https://aiplatform.googleapis.com/v1/projects/${projectId()}/locations/${location()}/publishers/google/models/${model}:generateContent`;
    const { url, headers } = await buildVertexAuth(base, VERTEX_API_KEY);
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192, responseMimeType: "application/json" },
      }),
    });
    if (r.ok) {
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
      if (text) return { text, model };
      lastErr = "empty response";
      continue;
    }
    lastErr = `${r.status}: ${(await r.text()).slice(0, 200)}`;
    console.warn(`[program-completion-report] ${model} failed ${lastErr}`);
    if (r.status !== 404 && r.status !== 400) break; // only fall through when the model isn't available
  }
  throw new Error(`Vertex AI ${lastErr}`);
}

function parseAi(text: string) {
  try {
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { summary: text.slice(0, 3000), strengths: [], improvements: [], next_steps: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const planId = typeof body.plan_id === "string" ? body.plan_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(planId)) return json({ error: "plan_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Already completed → return the stored (non-regenerable) report.
    const { data: existing } = await admin.from("completed_programs").select("*")
      .eq("user_id", user.id).eq("source_plan_id", planId).maybeSingle();
    if (existing) return json({ program: existing, already: true });

    const { data: sub } = await admin.from("premium_subscriptions").select("expires_at").eq("user_id", user.id).maybeSingle();
    if (!sub || new Date(sub.expires_at) <= new Date()) return json({ error: "Premium required" }, 403);

    const { data: plan } = await admin.from("training_plans").select("*").eq("id", planId).eq("user_id", user.id).maybeSingle();
    if (!plan) return json({ error: "Plan not found" }, 404);

    const { data: profile } = await admin.from("profiles").select("lang").eq("user_id", user.id).maybeSingle();
    const lang = (body.lang === "zh" || profile?.lang === "zh") ? "zh" : "en";

    const planData: any[] = Array.isArray(plan.plan_data) ? plan.plan_data : [];
    const allDates = planData.flatMap((w: any) => (w?.days ?? []).map((d: any) => d.date)).filter(Boolean).sort();
    const startDate: string = allDates[0] || String(plan.created_at).slice(0, 10);
    const endDate: string = plan.race_date || allDates[allDates.length - 1] || startDate;
    const today = new Date().toISOString().slice(0, 10);
    if (endDate > today) return json({ error: "Program not finished yet" }, 400);

    const endExclusive = new Date(new Date(endDate + "T00:00:00Z").getTime() + 2 * 86400000).toISOString();
    const activities = await fetchActivities(admin, user.id, new Date(new Date(startDate + "T00:00:00Z").getTime() - 86400000).toISOString(), endExclusive);
    const runs = activities.filter((a) => isRunType(a.type) && a.distance_m > 500);

    // ---- Key sessions (matched anywhere within the same week) ----
    const keySessions = auditKeySessions(planData, runs, plan.race_date);
    const missed = keySessions.filter((k) => k.status === "missed");

    // ---- Volume ----
    const weekly = planData.map((w: any, i: number) => {
      const days: any[] = w?.days ?? [];
      const dates = days.map((d) => d.date).filter(Boolean).sort();
      const plannedKm = days.reduce((s, d) => s + (isRest(d.type, d.distance_km) ? 0 : Number(d.distance_km) || 0), 0);
      const wr = dates.length ? runs.filter((a) => a.date >= dates[0] && a.date <= dates[dates.length - 1]) : [];
      const actualKm = wr.reduce((s, a) => s + a.distance_m / 1000, 0);
      return { week: i + 1, start: dates[0] ?? null, planned_km: Math.round(plannedKm * 10) / 10, actual_km: Math.round(actualKm * 10) / 10, runs: wr.length };
    });
    const plannedTotal = weekly.reduce((s, w) => s + w.planned_km, 0);
    const actualTotal = weekly.reduce((s, w) => s + w.actual_km, 0);

    // ---- Race result vs target ----
    const distKey = FM_ALIASES[String(plan.distance || "").toUpperCase()] || plan.distance;
    const raceMeters = raceDistanceMeters(distKey);
    const targetSec = parseDurationStr(String(plan.target_time || "").replace(/[^\d:]/g, ""));
    let raceSec: number | null = null;
    let raceSource: string | null = null;
    let raceName: string | null = null;
    if (plan.race_date) {
      const { data: ur } = await admin.from("user_races").select("race_name,finish_time_seconds,distance_km")
        .eq("user_id", user.id).eq("race_date", plan.race_date);
      const withTime = (ur ?? []).find((r: any) => r.finish_time_seconds);
      if (withTime) { raceSec = withTime.finish_time_seconds; raceSource = "race_record"; raceName = withTime.race_name; }
      else if (ur?.[0]) raceName = ur[0].race_name;
      if (!raceSec) {
        const sameDay = runs.filter((a) => a.date === plan.race_date);
        const pick = raceMeters
          ? sameDay.sort((a, b) => Math.abs(Math.log(a.distance_m / raceMeters)) - Math.abs(Math.log(b.distance_m / raceMeters)))[0]
          : sameDay.sort((a, b) => b.distance_m - a.distance_m)[0];
        if (pick && (!raceMeters || pick.distance_m >= raceMeters * 0.9)) { raceSec = pick.seconds; raceSource = "activity"; }
      }
    }
    const race = {
      name: raceName,
      date: plan.race_date,
      distance: plan.distance,
      target_seconds: targetSec,
      target_label: targetSec ? fmtDuration(targetSec) : (plan.target_time || null),
      actual_seconds: raceSec,
      actual_label: raceSec ? fmtDuration(raceSec) : null,
      diff_seconds: raceSec && targetSec ? raceSec - targetSec : null,
      source: raceSource,
    };

    const report = {
      start_date: startDate,
      end_date: endDate,
      weeks: planData.length,
      planned_km: Math.round(plannedTotal),
      actual_km: Math.round(actualTotal),
      total_runs: runs.filter((a) => a.date >= startDate && a.date <= endDate).length,
      key_sessions_total: keySessions.length,
      key_sessions_done: keySessions.filter((k) => k.status === "done" || k.status === "done_other_day").length,
      key_sessions_partial: keySessions.filter((k) => k.status === "partial").length,
      key_sessions_missed: missed.length,
      key_sessions: keySessions,
      weekly,
      race,
    };

    // ---- AI analysis (generated exactly once) ----
    let ai: any = null;
    let aiModel: string | null = null;
    try {
      const system = lang === "zh"
        ? "你是一位資深跑步教練。請用繁體中文，根據完整訓練計劃的數據，給出深入、具體、有數據支持的整體回顧。只輸出 JSON。"
        : "You are an experienced running coach. Write an in-depth, specific, data-backed review of the athlete's entire training block. Output JSON only.";
      const prompt = `${lang === "zh" ? "訓練計劃資料" : "Training block data"}:
Goal: ${plan.goal}, distance: ${plan.distance}, target: ${plan.target_time || "n/a"}, race date: ${plan.race_date || "n/a"}
Race result: ${race.actual_label ? `${race.actual_label} (target ${race.target_label ?? "n/a"}, diff ${race.diff_seconds ?? "n/a"}s)` : "no race time found"}
Totals: planned ${report.planned_km} km, actual ${report.actual_km} km, ${report.total_runs} runs.
Weekly (week, planned km, actual km, runs): ${weekly.map((w) => `W${w.week} ${w.planned_km}/${w.actual_km}/${w.runs}`).join("; ")}
Key sessions (a session done on another day in the same week counts as completed): ${keySessions.map((k) => `W${k.week} ${k.type} ${k.planned_km ?? "?"}km -> ${k.status}${k.actual_km ? ` ${k.actual_km}km @${k.actual_pace}` : ""}`).join("; ")}
All runs (date, km, time, avgHR): ${runs.filter((a) => a.date >= startDate && a.date <= endDate).map((a) => `${a.date} ${(a.distance_m / 1000).toFixed(1)} ${fmtDuration(a.seconds)} ${a.avg_hr ?? "-"}`).join("; ")}

Return JSON: {"headline": string (one sentence), "summary": string (2-3 paragraphs covering consistency, progression, race execution vs target), "strengths": [{"title": string, "detail": string}] (3-5), "improvements": [{"title": string, "detail": string}] (3-5, actionable), "next_steps": [string] (3 concrete recommendations for the next program)}`;
      const res = await callGemini(system, prompt);
      ai = parseAi(res.text);
      aiModel = res.model;
    } catch (e) {
      console.error("[program-completion-report] AI failed", e);
    }

    const { data: saved, error: insErr } = await admin.from("completed_programs").insert({
      user_id: user.id,
      source_plan_id: plan.id,
      goal: plan.goal,
      distance: plan.distance,
      target_time: plan.target_time,
      race_date: plan.race_date,
      start_date: startDate,
      end_date: endDate,
      weeks: planData.length || plan.weeks,
      plan_data: planData,
      race_schedule: plan.race_schedule ?? null,
      report,
      ai_analysis: ai,
      ai_model: aiModel,
      lang,
      plan_created_at: plan.created_at,
    }).select().single();
    if (insErr) {
      // Concurrent call already archived it.
      const { data: again } = await admin.from("completed_programs").select("*").eq("source_plan_id", planId).maybeSingle();
      if (again) return json({ program: again, already: true });
      throw insErr;
    }

    await admin.from("training_plans").delete().eq("id", plan.id).eq("user_id", user.id);
    return json({ program: saved });
  } catch (e) {
    console.error("[program-completion-report]", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

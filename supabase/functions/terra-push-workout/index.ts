// Pushes a single planned workout (one plan day) to the user's watch via Terra.
// Body: { plan_id: string, week: number, day_index: number, lang?: "en" | "zh" }
//
// Returns:
//   { ok: true, log_id, provider } on success
//   { ok: false, code, message_en, message_zh } on failure (rate limit, no connection, etc.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";
import { buildPlannedWorkout, type PlanDay } from "../_shared/terraPlannedWorkout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const WRITE_PROVIDERS = ["GARMIN", "COROS"];

async function pushOne(opts: {
  admin: any;
  userId: string;
  plan: any;
  week: number;
  dayIndex: number;
  lang: "en" | "zh";
  devId: string;
  apiKey: string;
}): Promise<{ ok: true; log_id: string; provider: string } | { ok: false; code: string; reason: string }> {
  const { admin, userId, plan, week, dayIndex, lang, devId, apiKey } = opts;
  const planData: any[] = Array.isArray(plan.plan_data) ? plan.plan_data : [];
  const weekObj = planData[week];
  const day: PlanDay | undefined = weekObj?.days?.[dayIndex];
  if (!day) return { ok: false, code: "day_not_found", reason: "Day not found" };

  const payload = buildPlannedWorkout(day, lang);
  if (!payload) return { ok: false, code: "not_pushable", reason: "Rest day or missing distance" };

  // Find writable connection (Garmin / Coros).
  const { data: conns } = await admin
    .from("terra_connections")
    .select("terra_user_id, provider")
    .eq("user_id", userId)
    .eq("active", true)
    .in("provider", WRITE_PROVIDERS);
  if (!conns || conns.length === 0) {
    return { ok: false, code: "no_connection", reason: "No Garmin/Coros connection" };
  }
  const conn = conns[0];

  // If we already pushed this exact day, delete the old one first.
  const { data: existing } = await admin
    .from("pushed_workouts")
    .select("id, terra_log_id, provider")
    .eq("user_id", userId)
    .eq("plan_id", plan.id)
    .eq("week", week)
    .eq("day_index", dayIndex)
    .maybeSingle();

  if (existing?.terra_log_id) {
    try {
      const delUrl = `https://api.tryterra.co/v2/athlete/plannedWorkout?user_id=${conn.terra_user_id}&workout_id=${existing.terra_log_id}`;
      await fetch(delUrl, { method: "DELETE", headers: { "dev-id": devId, "x-api-key": apiKey } });
    } catch (e) {
      console.warn("[terra-push-workout] delete prior failed (continuing):", e);
    }
    await admin.from("pushed_workouts").delete().eq("id", existing.id);
  }

  // POST to Terra.
  const url = `https://api.tryterra.co/v2/athlete/plannedWorkout?user_id=${conn.terra_user_id}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "dev-id": devId, "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ data: [payload] }),
  });
  const respText = await r.text();
  if (!r.ok) {
    console.error("[terra-push-workout] terra error", r.status, respText);
    return { ok: false, code: "terra_error", reason: `Terra ${r.status}: ${respText.slice(0, 200)}` };
  }
  let respJson: any = null;
  try { respJson = JSON.parse(respText); } catch { /* ignore */ }
  const logId: string = respJson?.log_ids?.[0] ?? respJson?.log_id ?? "";

  await admin.from("pushed_workouts").insert({
    user_id: userId,
    plan_id: plan.id,
    week,
    day_index: dayIndex,
    provider: conn.provider,
    terra_log_id: logId || null,
  });

  return { ok: true, log_id: logId, provider: conn.provider };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const planId: string | undefined = body.plan_id;
    const week: number = Number(body.week);
    const dayIndex: number = Number(body.day_index);
    const lang: "en" | "zh" = body.lang === "zh" ? "zh" : "en";
    if (!planId || !Number.isFinite(week) || !Number.isFinite(dayIndex)) {
      return json({ ok: false, error: "missing plan_id/week/day_index" }, 400);
    }

    // Rate-limit: 20 pushes / day / user
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("terra_sync_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("function_name", "terra-push-workout")
      .gte("called_at", startOfDay.toISOString());
    if ((count ?? 0) >= 20) {
      return json({
        ok: false, code: "rate_limited",
        message_en: "You've pushed too many workouts to your watch today. Please try again tomorrow.",
        message_zh: "您今天推送到手錶的訓練次數已達上限，請明天再試。",
      });
    }

    const { data: plan } = await admin
      .from("training_plans")
      .select("id, plan_data, user_id")
      .eq("id", planId)
      .maybeSingle();
    if (!plan || plan.user_id !== user.id) return json({ ok: false, error: "plan not found" }, 404);

    const { devId, apiKey } = getTerraCreds(pickEnvFromRequest(req));
    const result = await pushOne({ admin, userId: user.id, plan, week, dayIndex, lang, devId, apiKey });

    await admin.from("terra_sync_usage").insert({ user_id: user.id, function_name: "terra-push-workout" });

    if (!result.ok) {
      if (result.code === "no_connection") {
        return json({
          ok: false, code: result.code,
          message_en: "Connect Garmin or Coros to send workouts to your watch.",
          message_zh: "請先連接 Garmin 或 Coros，才能將訓練同步到手錶。",
        });
      }
      if (result.code === "not_pushable") {
        return json({
          ok: false, code: result.code,
          message_en: "This day has no distance to push (rest day).",
          message_zh: "這天沒有距離可同步（休息日）。",
        });
      }
      return json({
        ok: false, code: result.code,
        message_en: "Failed to send workout to your watch. Please try again later.",
        message_zh: "同步到手錶失敗，請稍後再試。",
      });
    }

    return json({ ok: true, log_id: result.log_id, provider: result.provider });
  } catch (e) {
    console.error("[terra-push-workout] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

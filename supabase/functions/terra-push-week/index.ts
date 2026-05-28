// Pushes all non-rest days in a given week of a plan to the watch via Terra.
// Body: { plan_id: string, week: number, lang?: "en" | "zh" }

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
    const lang: "en" | "zh" = body.lang === "zh" ? "zh" : "en";
    if (!planId || !Number.isFinite(week)) return json({ ok: false, error: "missing plan_id/week" }, 400);

    // Rate-limit: 3 week-pushes / day / user
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("terra_sync_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("function_name", "terra-push-week")
      .gte("called_at", startOfDay.toISOString());
    if ((count ?? 0) >= 3) {
      return json({
        ok: false, code: "rate_limited",
        message_en: "You've already pushed a week to your watch a few times today. Please try again tomorrow.",
        message_zh: "您今天已多次推送整週訓練到手錶，請明天再試。",
      });
    }

    const { data: plan } = await admin
      .from("training_plans")
      .select("id, plan_data, user_id")
      .eq("id", planId)
      .maybeSingle();
    if (!plan || plan.user_id !== user.id) return json({ ok: false, error: "plan not found" }, 404);

    const weekObj = (Array.isArray(plan.plan_data) ? plan.plan_data : [])[week];
    const days: PlanDay[] = Array.isArray(weekObj?.days) ? weekObj.days : [];

    const { data: conns } = await admin
      .from("terra_connections")
      .select("terra_user_id, provider")
      .eq("user_id", user.id).eq("active", true).in("provider", WRITE_PROVIDERS);
    if (!conns || conns.length === 0) {
      return json({
        ok: false, code: "no_connection",
        message_en: "Connect Garmin or Coros to send workouts to your watch.",
        message_zh: "請先連接 Garmin 或 Coros，才能將訓練同步到手錶。",
      });
    }
    const conn = conns[0];

    const { devId, apiKey } = getTerraCreds(pickEnvFromRequest(req));
    const headers = { "dev-id": devId, "x-api-key": apiKey, "Content-Type": "application/json" };

    // Clear existing pushes for this week.
    const { data: existing } = await admin
      .from("pushed_workouts")
      .select("id, terra_log_id")
      .eq("user_id", user.id).eq("plan_id", planId).eq("week", week);
    for (const row of existing ?? []) {
      if (row.terra_log_id) {
        try {
          await fetch(
            `https://api.tryterra.co/v2/athlete/plannedWorkout?user_id=${conn.terra_user_id}&workout_id=${row.terra_log_id}`,
            { method: "DELETE", headers: { "dev-id": devId, "x-api-key": apiKey } },
          );
        } catch (e) { console.warn("[terra-push-week] delete prior failed:", e); }
      }
    }
    if (existing && existing.length > 0) {
      await admin.from("pushed_workouts").delete().eq("user_id", user.id).eq("plan_id", planId).eq("week", week);
    }

    let pushed = 0, skipped = 0, failed = 0;
    for (let di = 0; di < days.length; di++) {
      const payload = buildPlannedWorkout(days[di], lang);
      if (!payload) { skipped++; continue; }
      try {
        const r = await fetch(
          `https://api.tryterra.co/v2/athlete/plannedWorkout?user_id=${conn.terra_user_id}`,
          { method: "POST", headers, body: JSON.stringify({ data: [payload] }) },
        );
        const respText = await r.text();
        if (!r.ok) { console.error("[terra-push-week]", r.status, respText); failed++; continue; }
        let respJson: any = null;
        try { respJson = JSON.parse(respText); } catch { /* noop */ }
        const logId: string = respJson?.log_ids?.[0] ?? respJson?.log_id ?? "";
        await admin.from("pushed_workouts").insert({
          user_id: user.id, plan_id: planId, week, day_index: di,
          provider: conn.provider, terra_log_id: logId || null,
        });
        pushed++;
      } catch (e) {
        console.error("[terra-push-week] push error:", e); failed++;
      }
    }

    await admin.from("terra_sync_usage").insert({ user_id: user.id, function_name: "terra-push-week" });

    return json({
      ok: true, pushed, skipped, failed, provider: conn.provider,
      message_en: `Sent ${pushed} workout${pushed === 1 ? "" : "s"} to your ${conn.provider} watch.` +
        (failed ? ` (${failed} failed)` : ""),
      message_zh: `已將 ${pushed} 個訓練同步到 ${conn.provider} 手錶。` +
        (failed ? `（${failed} 個失敗）` : ""),
    });
  } catch (e) {
    console.error("[terra-push-week] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

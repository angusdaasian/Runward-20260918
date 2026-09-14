// Push "a friend just ran" to private-group members who kept notifications on.
// Called by the DB trigger tg_notify_group_activity with header x-webhook-key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TABLES: Record<string, { table: string; distance: string; type: string; name: string }> = {
  strava: { table: "strava_activities", distance: "distance", type: "sport_type", name: "name" },
  intervals: { table: "intervals_activities", distance: "distance", type: "sport_type", name: "name" },
  suunto: { table: "suunto_activities", distance: "distance", type: "sport_type", name: "name" },
  apple: { table: "apple_health_activities", distance: "distance", type: "sport_type", name: "name" },
  apple_health: { table: "apple_health_activities", distance: "distance", type: "sport_type", name: "name" },
  polar: { table: "polar_activities", distance: "distance", type: "sport_type", name: "detailed_sport_type" },
  terra: { table: "terra_activities", distance: "distance_meters", type: "activity_type", name: "activity_name" },
  garmin: { table: "garmin_activities", distance: "distance_meters", type: "activity_type", name: "activity_name" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.headers.get("x-webhook-key") !== Deno.env.get("WEBHOOK_AUTH_KEY")) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const source = String(body?.source ?? "");
    const sourceId = String(body?.source_id ?? "");
    const actorId = String(body?.user_id ?? "");
    const map = TABLES[source];
    if (!map || !sourceId || !actorId) return json({ error: "Invalid payload" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Idempotency: one group push per activity.
    const { data: claim } = await supabase
      .from("activity_push_log")
      .insert({ user_id: actorId, activity_key: `group_${source}_${sourceId}` })
      .select("id")
      .maybeSingle();
    if (!claim) return json({ skipped: "already_notified" });

    const { data: activity } = await supabase
      .from(map.table)
      .select(`${map.distance}, ${map.type}`)
      .eq("id", sourceId)
      .maybeSingle();
    if (!activity) return json({ skipped: "activity_not_found" });

    const meters = Number((activity as Record<string, unknown>)[map.distance] ?? 0);
    const rawType = (activity as Record<string, unknown>)[map.type];
    if (!(meters > 500)) return json({ skipped: "too_short" });

    const { data: isRun } = await supabase.rpc("community_is_run", { p_type: rawType == null ? null : String(rawType) });
    if (!isRun) return json({ skipped: "not_a_run" });

    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", actorId)
      .maybeSingle();
    const runnerName = actorProfile?.display_name?.trim() || "A friend";

    const { data: recipients } = await supabase.rpc("get_group_push_recipients", { p_user_id: actorId });
    const list = (recipients || []) as Array<{ user_id: string; lang: string | null }>;
    if (list.length === 0) return json({ sent: 0 });

    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!onesignalAppId || !onesignalApiKey) return json({ error: "OneSignal not configured" }, 500);

    const km = (meters / 1000).toFixed(1);
    const zhIds = list.filter((r) => String(r.lang || "").toLowerCase().startsWith("zh")).map((r) => r.user_id);
    const enIds = list.filter((r) => !String(r.lang || "").toLowerCase().startsWith("zh")).map((r) => r.user_id);

    const send = async (ids: string[], title: string, message: string) => {
      if (ids.length === 0) return 0;
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${onesignalApiKey}` },
        body: JSON.stringify({
          app_id: onesignalAppId,
          include_external_user_ids: ids,
          headings: { en: title },
          contents: { en: message },
        }),
      });
      const result = await res.text();
      console.log(`[notify-group-activity] OneSignal ${res.status}: ${result}`);
      return res.ok ? ids.length : 0;
    };

    const sent =
      (await send(zhIds, "群組跑步動態", `${runnerName} 剛完成了 ${km} 公里跑步！去為他/她打氣一下吧！🎉`)) +
      (await send(enIds, "Group activity", `${runnerName} just did a ${km} km run! Congratulate them! 🎉`));

    return json({ sent, recipients: list.length });
  } catch (err) {
    console.error("[notify-group-activity] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

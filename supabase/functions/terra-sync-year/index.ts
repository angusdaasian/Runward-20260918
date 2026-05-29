// Sync all activities from a target year (default: 2026) via Terra.
// Uses to_webhook=true so Terra delivers payloads via the existing webhook
// pipeline asynchronously — this function only triggers the historical pull.
//
// Premium-gated on the client. Rate-limited to 1 call per UTC day per user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
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
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const providerFilter: string | undefined = body.provider
      ? String(body.provider).toUpperCase()
      : undefined;
    const targetYear = Number.isFinite(Number(body.year)) ? Number(body.year) : 2026;
    const targetUserId: string | undefined = typeof body.targetUserId === "string"
      ? body.targetUserId
      : undefined;

    let connUserId = user.id;
    const isAdminCall = !!(targetUserId && targetUserId !== user.id);
    if (isAdminCall) {
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      connUserId = targetUserId!;
    }

    if (!isAdminCall) {
      const { data: prem } = await admin
        .from("premium_subscriptions")
        .select("expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      const stillPremium = prem && new Date(prem.expires_at) > new Date();
      if (!stillPremium) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "premium_required",
            message_en: "Premium membership required to sync a full year.",
            message_zh: "需要 Premium 會員方可同步整年活動。",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Lifetime limit: 1 call per premium user, ever.
      const { count } = await admin
        .from("terra_sync_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("function_name", "terra-sync-year");
      if ((count ?? 0) >= 1) {
        return new Response(
          JSON.stringify({
            ok: false,
            rateLimited: true,
            activities: 0,
            message_en: `You've already used your one-time ${targetYear} sync.`,
            message_zh: `您已使用過一次 ${targetYear} 年活動同步。`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await admin.from("terra_sync_usage").insert({
        user_id: user.id,
        function_name: "terra-sync-year",
      });
    }

    const q = admin.from("terra_connections").select("*").eq("user_id", connUserId).eq("active", true);
    const { data: conns } = providerFilter ? await q.eq("provider", providerFilter) : await q;
    if (!conns || conns.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, activities: 0, message: "no active connections" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const forceProd = body.forceEnv === "prod" || body.useProd === true;
    const resolvedEnv = forceProd ? "prod" : pickEnvFromRequest(req);
    const { devId, apiKey, env } = getTerraCreds(resolvedEnv);

    // Window: 2026-01-01 -> today.
    const startDate = `${targetYear}-01-01`;
    const endDate = ymd(new Date());
    console.log(`[terra-sync-year] env=${env} ${startDate}->${endDate} user=${connUserId} conns=${conns.length}`);

    const headers = { "dev-id": devId, "x-api-key": apiKey };
    const providers: Array<Record<string, unknown>> = [];

    for (const c of conns) {
      const url = `https://api.tryterra.co/v2/activity?user_id=${c.terra_user_id}&start_date=${startDate}&end_date=${endDate}&to_webhook=true&with_samples=true`;
      try {
        const r = await fetch(url, { headers });
        const terraReference = r.headers.get("terra-reference");
        const text = await r.text();
        console.log(`[terra-sync-year] ${c.provider} status=${r.status} ref=${terraReference}`);
        providers.push({
          provider: c.provider,
          status: r.status,
          terraReference,
          body: text.slice(0, 500),
        });
      } catch (e) {
        console.error(`[terra-sync-year] fetch failed ${c.provider}`, e);
        providers.push({ provider: c.provider, error: String(e) });
      }

      await admin
        .from("terra_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", c.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        year: targetYear,
        window: { start: startDate, end: endDate },
        toWebhook: true,
        providers,
        message_en: "Sync queued at Terra. Activities will arrive via webhook over the next 5–10 minutes.",
        message_zh: "已在 Terra 排程同步，活動將於 5–10 分鐘內透過 webhook 陸續送達。",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[terra-sync-year] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

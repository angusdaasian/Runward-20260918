// Today-only Terra activity sync.
// Mirrors terra-sync's activity path but ONLY fetches today's date window
// (start=today UTC, end=tomorrow UTC since Terra treats end_date as exclusive).
// Always uses to_webhook=false&with_samples=true — same flags as terra-tick-all —
// so we get the raw HR sample arrays inline instead of triggering a webhook delivery.
// Ingests via the trusted webhook pipeline so rows match real webhook deliveries.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";
import { ingestTrustedTerraPayload } from "../_shared/terraWebhookHandler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function countHrSamples(a: any): number {
  const hrd = a?.heart_rate_data ?? {};
  const sources: any[] = [
    hrd?.detailed?.hr_samples,
    hrd?.detailed?.hr_samples_data,
    hrd?.detailed?.heart_rate_samples,
    hrd?.detailed?.samples,
    hrd?.samples,
    hrd?.hr_samples,
    a?.hr_data?.samples,
    a?.heart_rate_samples,
  ];
  const arr = sources.find((s) => Array.isArray(s) && s.length > 0);
  return Array.isArray(arr) ? arr.length : 0;
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
    const targetUserId: string | undefined = typeof body.targetUserId === "string"
      ? body.targetUserId
      : undefined;

    let connUserId = user.id;
    if (targetUserId && targetUserId !== user.id) {
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      connUserId = targetUserId;
    }

    // Rate limit: max 5 calls per UTC day per user (admins acting on themselves
    // are still rate-limited; admins acting on another user bypass).
    const isAdminCall = targetUserId && targetUserId !== user.id;
    if (!isAdminCall) {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const { count } = await admin
        .from("terra_sync_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("function_name", "terra-sync-today")
        .gte("called_at", startOfDay.toISOString());
      if ((count ?? 0) >= 5) {
        return new Response(
          JSON.stringify({
            ok: false,
            rateLimited: true,
            activities: 0,
            message_en: "You've already synced today's activities the maximum number of times. Please try again later.",
            message_zh: "您今天已達到同步今日活動的次數上限，請稍後再試。",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await admin.from("terra_sync_usage").insert({
        user_id: user.id,
        function_name: "terra-sync-today",
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

    // Today-only window. Terra's end_date is exclusive, so ask through tomorrow.
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const startStr = today.toISOString().slice(0, 10);
    const endStr = tomorrow.toISOString().slice(0, 10);
    console.log(`[terra-sync-today] env=${env} window ${startStr} -> ${endStr} user=${connUserId}`);

    let activityCount = 0;
    const perProvider: Array<Record<string, unknown>> = [];

    for (const c of conns) {
      const headers = { "dev-id": devId, "x-api-key": apiKey };
      const url = `https://api.tryterra.co/v2/activity?user_id=${c.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=true`;
      console.log(`[terra-sync-today] fetch ${c.provider} url=${url}`);
      try {
        const r = await fetch(url, { headers });
        const terraReference = r.headers.get("terra-reference");
        const j = await r.json();
        const items: any[] = Array.isArray(j?.data) ? j.data : [];
        const summary = items.map((it) => ({
          id: String(it?.metadata?.summary_id ?? it?.metadata?.upload_id ?? ""),
          start_time: it?.metadata?.start_time ?? null,
          hr_samples: countHrSamples(it),
        }));
        console.log(
          `[terra-sync-today] ${c.provider} status=${r.status} items=${items.length} terraReference=${terraReference ?? "none"} summary=${JSON.stringify(summary).slice(0, 1200)}`,
        );

        let ingestedHere = 0;
        let skippedHere = 0;
        for (const a of items) {
          const envelope = {
            type: "activity",
            user: { user_id: c.terra_user_id, reference_id: c.reference_id, provider: c.provider },
            data: [a],
          };
          const aid = String(a?.metadata?.summary_id ?? a?.metadata?.upload_id ?? "");
          try {
            const ing = await ingestTrustedTerraPayload(
              JSON.stringify(envelope),
              "prod",
              "manual_sync_today",
            );
            if (ing.ok) { activityCount++; ingestedHere++; }
            else { skippedHere++; console.warn(`[terra-sync-today] ingest err ${c.provider} id=${aid}: ${ing.error}`); }
          } catch (e) {
            skippedHere++;
            console.error(`[terra-sync-today] ingest threw ${c.provider} id=${aid}`, e);
          }
        }
        console.log(
          `[terra-sync-today] ingest summary ${c.provider} returned=${items.length} ingested=${ingestedHere} skipped=${skippedHere}`,
        );
        perProvider.push({
          provider: c.provider,
          status: r.status,
          returned: items.length,
          ingested: ingestedHere,
          skipped: skippedHere,
          terraReference,
          activities: summary,
        });
      } catch (e) {
        console.error(`[terra-sync-today] fetch failed ${c.provider}`, e);
        perProvider.push({ provider: c.provider, error: String(e) });
      }

      await admin
        .from("terra_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", c.id);
    }

    const noData = activityCount === 0;
    return new Response(
      JSON.stringify({
        ok: true,
        activities: activityCount,
        window: { startStr, endStr },
        providers: perProvider,
        ...(noData ? {
          message_en: "Your activity data hasn't arrived from our provider yet. Please try again shortly.",
          message_zh: "您的活動資料尚未從我們的供應商傳來，請稍後再試。",
        } : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("[terra-sync-today] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Cron-triggered tick: for every active terra_connection, fetch today's
// activities with full samples (to_webhook=false, with_samples=true) and
// run them through the trusted webhook ingest pipeline. Dedup happens via
// terra_activities (user_id, terra_activity_id) so re-runs are safe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds } from "../_shared/terraEnv.ts";
import { ingestTrustedTerraPayload } from "../_shared/terraWebhookHandler.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const expected = Deno.env.get("WEBHOOK_AUTH_KEY");
  if (!expected || req.headers.get("x-webhook-key") !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: conns, error: connErr } = await admin
    .from("terra_connections")
    .select("id, user_id, terra_user_id, provider")
    .eq("active", true);
  if (connErr) {
    return new Response(JSON.stringify({ error: connErr.message }), { status: 500, headers: cors });
  }

  const { devId, apiKey } = getTerraCreds("prod");

  // Today in HKT (UTC+8) — same as user-facing "today".
  const nowHkt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const startDate = nowHkt.toISOString().slice(0, 10);
  const endDate = new Date(nowHkt.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const results: any[] = [];
  const list = conns ?? [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    try {
      const url = `https://api.tryterra.co/v2/activity?user_id=${c.terra_user_id}` +
        `&start_date=${startDate}&end_date=${endDate}` +
        `&to_webhook=false&with_samples=true`;
      const res = await fetch(url, {
        headers: { "dev-id": devId, "x-api-key": apiKey },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.text().catch(() => "");
      let ingested = 0;
      let err: string | null = null;
      if (res.ok && body) {
        try {
          const r = await ingestTrustedTerraPayload(body, "prod", "cron_tick_all");
          ingested = r.count;
          err = r.error;
        } catch (e) {
          err = `ingest threw: ${String(e).slice(0, 300)}`;
        }
        await admin
          .from("terra_connections")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", c.id);
      } else {
        err = `http_${res.status}: ${body.slice(0, 200)}`;
      }
      results.push({ user_id: c.user_id, provider: c.provider, http: res.status, ingested, err });
      console.log(`[terra-tick-all] user=${c.user_id} provider=${c.provider} http=${res.status} ingested=${ingested}${err ? ` err=${err}` : ""}`);
    } catch (e) {
      results.push({ user_id: c.user_id, provider: c.provider, err: String(e).slice(0, 300) });
      console.error(`[terra-tick-all] fetch failed user=${c.user_id} provider=${c.provider}`, e);
    }
    // Space requests 10s apart to avoid hammering Terra
    if (i < list.length - 1) {
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }

  return new Response(JSON.stringify({ ok: true, connections: conns?.length ?? 0, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

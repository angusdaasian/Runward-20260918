// Cron-triggered tick: for every active terra_connection, fetch today's
// activities with full samples (to_webhook=false, with_samples=true) and
// run them through the trusted webhook ingest pipeline. Dedup happens via
// terra_activities (user_id, terra_activity_id) so re-runs are safe.
//
// To stay under the edge-runtime wall limit (~150s), we process a CHUNK of
// connections per invocation (default 10 users × ~10s = ~100s) and then
// self-trigger the next chunk asynchronously. Ordering by last_synced_at
// NULLS FIRST guarantees forward progress across chunks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds } from "../_shared/terraEnv.ts";
import { ingestTrustedTerraPayload } from "../_shared/terraWebhookHandler.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

const CHUNK_SIZE = 10;
const INTER_USER_DELAY_MS = 10_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const expected = Deno.env.get("WEBHOOK_AUTH_KEY");
  if (!expected || req.headers.get("x-webhook-key") !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }

  const url = new URL(req.url);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.max(1, parseInt(url.searchParams.get("limit") ?? String(CHUNK_SIZE), 10) || CHUNK_SIZE);
  // Sync cutoff: only re-fetch users whose last_synced_at is older than this (or null).
  // Used to avoid touching users already processed in the current sweep.
  const runId = url.searchParams.get("run_id") ?? new Date().toISOString();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Order by last_synced_at NULLS FIRST so least-recently-synced are
  // processed first. Combined with `last_synced_at` updates after each
  // success, successive chunks naturally walk through all users.
  const { data: conns, error: connErr } = await admin
    .from("terra_connections")
    .select("id, user_id, terra_user_id, provider, last_synced_at")
    .eq("active", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1);
  if (connErr) {
    return new Response(JSON.stringify({ error: connErr.message }), { status: 500, headers: cors });
  }

  const { devId, apiKey } = getTerraCreds("prod");

  const nowHkt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const startDate = nowHkt.toISOString().slice(0, 10);
  const endDate = new Date(nowHkt.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const list = conns ?? [];

  // Count total active connections so we know when to stop chaining.
  const { count: totalActive } = await admin
    .from("terra_connections")
    .select("id", { count: "exact", head: true })
    .eq("active", true);

  const work = (async () => {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const idx = offset + i + 1;
      try {
        const apiUrl = `https://api.tryterra.co/v2/activity?user_id=${c.terra_user_id}` +
          `&start_date=${startDate}&end_date=${endDate}` +
          `&to_webhook=false&with_samples=true`;
        const res = await fetch(apiUrl, {
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
        console.log(`[terra-tick-all] run=${runId} (${idx}/${totalActive ?? "?"}) user=${c.user_id} provider=${c.provider} http=${res.status} ingested=${ingested}${err ? ` err=${err}` : ""}`);
      } catch (e) {
        console.error(`[terra-tick-all] run=${runId} (${idx}/${totalActive ?? "?"}) fetch failed user=${c.user_id} provider=${c.provider}`, e);
      }
      if (i < list.length - 1) {
        await new Promise((r) => setTimeout(r, INTER_USER_DELAY_MS));
      }
    }

    // Chain to next chunk if there are more users.
    const nextOffset = offset + list.length;
    if (list.length === limit && (totalActive == null || nextOffset < totalActive)) {
      const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/terra-tick-all?offset=${nextOffset}&limit=${limit}&run_id=${encodeURIComponent(runId)}`;
      console.log(`[terra-tick-all] run=${runId} chaining next chunk offset=${nextOffset}`);
      try {
        // Fire-and-forget; the next invocation kicks off its own background work.
        await fetch(fnUrl, {
          method: "POST",
          headers: { "x-webhook-key": expected, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        console.error(`[terra-tick-all] run=${runId} failed to chain next chunk`, e);
      }
    } else {
      console.log(`[terra-tick-all] run=${runId} DONE total_processed_offset=${nextOffset}`);
    }
  })();

  // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
  try { EdgeRuntime.waitUntil(work); } catch { work.catch(() => {}); }

  return new Response(JSON.stringify({
    ok: true,
    run_id: runId,
    offset,
    limit,
    chunk: list.length,
    total_active: totalActive,
    startDate,
    endDate,
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});

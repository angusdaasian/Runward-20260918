// One-off tick: pops one pending row from terra_today_oneoff_queue and asks
// Terra for today's activity. Uses to_webhook=true so the existing webhook
// pipeline (with built-in dedup) ingests the payload. The cron schedule
// spaces calls (e.g. every 15s) to avoid hammering Terra and to let the
// webhook queue drain between requests. Self-unschedules pg_cron job
// "terra-today-oneoff" when queue is empty.

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

  // Pop oldest pending row
  const { data: row, error: selErr } = await admin
    .from("terra_today_oneoff_queue")
    .select("id, user_id, terra_user_id, provider, target_date")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    console.error("[terra-today-oneoff] select failed", selErr);
    return new Response(JSON.stringify({ error: selErr.message }), { status: 500, headers: cors });
  }

  if (!row) {
    // Empty: unschedule the cron job (idempotent)
    try {
      await admin.rpc("unschedule_terra_today_oneoff" as any);
    } catch (e) {
      console.log("[terra-today-oneoff] unschedule rpc not available, ignoring", e);
    }
    return new Response(JSON.stringify({ done: true, message: "queue empty" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Mark in-flight
  await admin
    .from("terra_today_oneoff_queue")
    .update({ status: "in_flight", attempted_at: new Date().toISOString() })
    .eq("id", row.id);

  try {
    const { devId, apiKey } = getTerraCreds("prod");
    const url = `https://api.tryterra.co/v2/activity?user_id=${row.terra_user_id}` +
      `&start_date=${row.target_date}&end_date=${row.target_date}` +
      `&to_webhook=false&with_samples=true`;

    const res = await fetch(url, { headers: { "dev-id": devId, "x-api-key": apiKey } });
    const ref = res.headers.get("terra-reference");
    const body = await res.text().catch(() => "");
    console.log(`[terra-today-oneoff] body_preview user=${row.user_id} len=${body.length} head=${body.slice(0, 400)}`);


    let ingestOk = false;
    let ingestErr: string | null = null;
    let ingestCount = 0;
    if (res.ok && body) {
      try {
        const r = await ingestTrustedTerraPayload(body, "prod");
        ingestOk = r.ok;
        ingestErr = r.error;
        ingestCount = r.count;
      } catch (e) {
        ingestErr = `ingest threw: ${String(e).slice(0, 500)}`;
      }
    }

    const finalStatus = res.ok && ingestOk ? "done" : "error";
    const resultMsg = res.ok
      ? (ingestOk ? `ingested ${ingestCount}` : `ingest_err: ${ingestErr ?? "unknown"}`)
      : `http_${res.status}: ${body.slice(0, 300)}`;

    await admin
      .from("terra_today_oneoff_queue")
      .update({
        status: finalStatus,
        http_status: res.status,
        terra_reference: ref,
        result: resultMsg.slice(0, 2000),
      })
      .eq("id", row.id);

    console.log(`[terra-today-oneoff] user=${row.user_id} provider=${row.provider} http=${res.status} ref=${ref} ingest=${ingestOk} count=${ingestCount}${ingestErr ? ` err=${ingestErr}` : ""}`);
    return new Response(JSON.stringify({ ok: finalStatus === "done", user_id: row.user_id, http_status: res.status, terra_reference: ref, ingest_count: ingestCount, ingest_error: ingestErr }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e) {
    await admin
      .from("terra_today_oneoff_queue")
      .update({ status: "error", result: String(e).slice(0, 2000) })
      .eq("id", row.id);
    console.error("[terra-today-oneoff] fetch failed", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});

// Terra reconciliation job.
// Compares Terra payload IDs written by Terra's Supabase destination
// (terra_data_payloads / terra_misc_payloads) against IDs we recorded from
// the live webhook (terra_webhook_events.payload_ids).
//
//   - If a payload exists in Supabase-destination but NOT in webhook events
//     → fetch it from Terra's API (to_webhook=true) and rely on the existing
//     webhook handler to ingest it.
//   - If a webhook event references a payload_id NOT present in the
//     Supabase-destination tables yet → log informationally (webhook already
//     delivered the data; no action).
//
// Runs prod-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleTerraWebhook } from "../_shared/terraWebhookHandler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const LOOKBACK_MINUTES = 60; // scan window for recent payloads
const MIN_AGE_SECONDS = 60;  // grace period: don't act before webhook has had a chance

type DestRow = {
  payload_id: string;
  user_id: string;
  data_type: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string | null;
};

async function fetchRecentDestRows(table: "terra_data_payloads" | "terra_misc_payloads"): Promise<DestRow[]> {
  const sinceIso = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();
  const cutoffIso = new Date(Date.now() - MIN_AGE_SECONDS * 1000).toISOString();
  const { data, error } = await supa
    .from(table)
    .select("payload_id, user_id, data_type, start_time, end_time, created_at")
    .gte("created_at", sinceIso)
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error(`[terra-reconcile] read ${table} failed`, error.message);
    return [];
  }
  return (data as any[]) ?? [];
}

async function fetchWebhookPayloadIds(): Promise<Set<string>> {
  const sinceIso = new Date(Date.now() - (LOOKBACK_MINUTES + 60) * 60_000).toISOString();
  const { data, error } = await supa
    .from("terra_webhook_events")
    .select("payload_ids")
    .gte("received_at", sinceIso)
    .not("payload_ids", "is", null)
    .limit(2000);
  if (error) {
    console.error("[terra-reconcile] read webhook events failed", error.message);
    return new Set();
  }
  const set = new Set<string>();
  for (const row of (data as any[]) ?? []) {
    for (const id of row.payload_ids ?? []) {
      if (typeof id === "string") set.add(id);
    }
  }
  return set;
}

async function fetchAlreadyRecovered(): Promise<Set<string>> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data } = await supa
    .from("terra_reconciliation_log")
    .select("payload_id")
    .eq("status", "recovered")
    .gte("created_at", sinceIso)
    .limit(2000);
  return new Set(((data as any[]) ?? []).map((r) => r.payload_id));
}

function endpointForDataType(dataType: string | null): "activity" | "daily" | "sleep" | "body" | "nutrition" | "menstruation" | null {
  if (!dataType) return null;
  const t = dataType.toLowerCase();
  if (t.includes("activity")) return "activity";
  if (t.includes("sleep")) return "sleep";
  if (t.includes("daily")) return "daily";
  if (t.includes("body")) return "body";
  if (t.includes("nutrition")) return "nutrition";
  if (t.includes("menstruation")) return "menstruation";
  return null;
}

async function refetchFromTerra(row: DestRow): Promise<{ ok: boolean; detail: string }> {
  const endpoint = endpointForDataType(row.data_type);
  if (!endpoint) return { ok: false, detail: `unsupported data_type ${row.data_type}` };

  const start = (row.start_time ?? row.created_at ?? new Date().toISOString()).slice(0, 10);
  const end = (row.end_time ?? row.created_at ?? new Date().toISOString()).slice(0, 10);

  const creds = getTerraCreds("prod");
  const url = `https://api.tryterra.co/v2/${endpoint}?user_id=${encodeURIComponent(row.user_id)}&start_date=${start}&end_date=${end}&to_webhook=true&with_samples=true`;

  const resp = await fetch(url, {
    headers: { "dev-id": creds.devId, "x-api-key": creds.apiKey },
  });
  return { ok: resp.ok, detail: `terra ${endpoint} ${resp.status}` };
}

async function runReconcile() {
  const [data, misc, webhookIds, recovered] = await Promise.all([
    fetchRecentDestRows("terra_data_payloads"),
    fetchRecentDestRows("terra_misc_payloads"),
    fetchWebhookPayloadIds(),
    fetchAlreadyRecovered(),
  ]);

  let recoveredCount = 0;
  let failedCount = 0;
  let inSyncCount = 0;

  const handle = async (row: DestRow, source: "terra_data_payloads" | "terra_misc_payloads") => {
    if (!row.payload_id) return;
    if (webhookIds.has(row.payload_id) || recovered.has(row.payload_id)) {
      inSyncCount++;
      return;
    }
    const res = await refetchFromTerra(row);
    if (res.ok) recoveredCount++; else failedCount++;
    await supa.from("terra_reconciliation_log").insert({
      payload_id: row.payload_id,
      terra_user_id: row.user_id,
      data_type: row.data_type,
      source_table: source,
      status: res.ok ? "recovered" : "fetch_failed",
      detail: res.detail,
    });
  };

  for (const r of data) await handle(r, "terra_data_payloads");
  for (const r of misc) await handle(r, "terra_misc_payloads");

  // Reverse check: webhook IDs missing from destination tables. Sample only
  // recent webhooks; one row per missing id, informational.
  const sinceIso = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();
  const cutoffIso = new Date(Date.now() - MIN_AGE_SECONDS * 1000).toISOString();
  const { data: recentWebhooks } = await supa
    .from("terra_webhook_events")
    .select("payload_ids, terra_user_id, type, received_at")
    .gte("received_at", sinceIso)
    .lte("received_at", cutoffIso)
    .not("payload_ids", "is", null)
    .limit(500);

  const destIds = new Set<string>([...data, ...misc].map((r) => r.payload_id));
  const { data: alreadyLogged } = await supa
    .from("terra_reconciliation_log")
    .select("payload_id")
    .eq("status", "webhook_missing_in_supabase")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
    .limit(2000);
  const loggedMissing = new Set(((alreadyLogged as any[]) ?? []).map((r) => r.payload_id));

  let missingDestCount = 0;
  for (const w of (recentWebhooks as any[]) ?? []) {
    for (const pid of (w.payload_ids ?? []) as string[]) {
      if (!destIds.has(pid) && !loggedMissing.has(pid)) {
        missingDestCount++;
        await supa.from("terra_reconciliation_log").insert({
          payload_id: pid,
          terra_user_id: w.terra_user_id,
          data_type: w.type,
          source_table: "terra_webhook_events",
          status: "webhook_missing_in_supabase",
          detail: `received_at ${w.received_at}`,
        });
      }
    }
  }

  return { recoveredCount, failedCount, inSyncCount, missingDestCount, scanned: data.length + misc.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const summary = await runReconcile();
    console.log("[terra-reconcile]", JSON.stringify(summary));
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[terra-reconcile] failed", e?.message ?? e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

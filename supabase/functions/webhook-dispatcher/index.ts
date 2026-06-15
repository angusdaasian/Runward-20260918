// Drains pending webhook_deliveries: HMAC-signs payload, POSTs to app webhook_url,
// retries with backoff, marks dead after 5 attempts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { hmacSha256Hex } from "../_shared/oauth-utils.ts";

const BACKOFF_MIN = [1, 5, 30, 120, 720]; // minutes per attempt
const BATCH = 20;
const TIMEOUT_MS = 10_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: due } = await admin
    .from("webhook_deliveries")
    .select("id,app_id,user_id,event_type,object_type,object_id,payload,attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ delivered: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Preload apps
  const appIds = [...new Set(due.map((d) => d.app_id))];
  const { data: apps } = await admin
    .from("oauth_apps")
    .select("id,webhook_url,webhook_signing_secret,status")
    .in("id", appIds);
  const appMap = new Map(apps?.map((a) => [a.id, a]) ?? []);

  let delivered = 0;
  await Promise.all(due.map(async (d) => {
    const app = appMap.get(d.app_id);
    if (!app || !app.webhook_url || app.status !== "active") {
      await admin.from("webhook_deliveries").update({ status: "dead", last_error: "app_inactive_or_no_url" }).eq("id", d.id);
      return;
    }
    const body = JSON.stringify({
      event: d.event_type,
      object_type: d.object_type,
      object_id: d.object_id,
      owner_id: d.user_id,
      app_id: d.app_id,
      delivered_at: new Date().toISOString(),
      data: d.payload,
    });
    let sig = "";
    try { sig = await hmacSha256Hex(app.webhook_signing_secret ?? "", body); } catch (_) { /* ignore */ }

    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(app.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Runward-Signature": `sha256=${sig}` },
        body,
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        await admin.from("webhook_deliveries").update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          attempts: d.attempts + 1,
          last_response_code: res.status,
          last_error: null,
        }).eq("id", d.id);
        delivered++;
      } else {
        await scheduleRetry(admin, d, `http_${res.status}`, res.status);
      }
    } catch (e) {
      clearTimeout(t);
      await scheduleRetry(admin, d, String((e as Error)?.message ?? e), null);
    }
  }));

  return new Response(JSON.stringify({ delivered, total: due.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function scheduleRetry(admin: any, d: any, error: string, code: number | null) {
  const nextAttempt = d.attempts + 1;
  if (nextAttempt >= BACKOFF_MIN.length) {
    await admin.from("webhook_deliveries").update({
      status: "dead",
      attempts: nextAttempt,
      last_response_code: code,
      last_error: error,
    }).eq("id", d.id);
    return;
  }
  const nextAt = new Date(Date.now() + BACKOFF_MIN[nextAttempt] * 60_000).toISOString();
  await admin.from("webhook_deliveries").update({
    attempts: nextAttempt,
    next_attempt_at: nextAt,
    last_response_code: code,
    last_error: error,
  }).eq("id", d.id);
}

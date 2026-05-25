// terra-webhook-worker: drains terra_webhook_queue. Called by pg_cron every
// minute and also kicked best-effort by terra-webhook on each enqueue so the
// common case feels near-realtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { processQueuedTerraWebhook } from "../_shared/terraWebhookHandler.ts";
import type { TerraEnv } from "../_shared/terraEnv.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

const BATCH_SIZE = 3;
const MAX_ITERATIONS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const expected = Deno.env.get("WEBHOOK_AUTH_KEY");
  if (!expected || req.headers.get("x-webhook-key") !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { data: claimed, error: claimErr } = await admin.rpc(
      "claim_terra_webhook_queue",
      { batch_size: BATCH_SIZE },
    );
    if (claimErr) {
      console.error("[terra-webhook-worker] claim failed", claimErr);
      return new Response(JSON.stringify({ error: claimErr.message, processed, errors }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const rows = (claimed ?? []) as Array<{
      id: string;
      env: string;
      raw_body: string;
      signature_header: string | null;
      attempts: number;
    }>;
    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const env: TerraEnv = row.env === "test" ? "test" : "prod";
        const result = await processQueuedTerraWebhook(row.raw_body, row.signature_header, env);
        if (result.ok) {
          await admin
            .from("terra_webhook_queue")
            .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
            .eq("id", row.id);
          processed++;
        } else {
          await admin
            .from("terra_webhook_queue")
            .update({ status: "pending", last_error: result.error, claimed_at: null })
            .eq("id", row.id);
          errors++;
        }
      } catch (e) {
        console.error("[terra-webhook-worker] processing error", e);
        await admin
          .from("terra_webhook_queue")
          .update({ status: "pending", last_error: String(e), claimed_at: null })
          .eq("id", row.id);
        errors++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, errors }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { processQueuedTerraWebhook } from "../_shared/terraWebhookHandler.ts";
import type { TerraEnv } from "../_shared/terraEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { data: claimed, error: claimErr } = await supa.rpc("claim_terra_webhook_queue", {
    batch_size: BATCH_SIZE,
  });
  if (claimErr) {
    console.error("[process-terra-queue] claim failed", claimErr);
    return new Response(JSON.stringify({ ok: false, error: claimErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (claimed ?? []) as Array<{
    id: string;
    env: string;
    raw_body: string;
    signature_header: string | null;
    attempts: number;
  }>;

  let done = 0;
  let failed = 0;
  let retried = 0;

  for (const row of rows) {
    try {
      const env: TerraEnv = row.env === "test" ? "test" : "prod";
      const result = await processQueuedTerraWebhook(row.raw_body, row.signature_header, env);
      if (result.ok) {
        await supa.from("terra_webhook_queue").update({
          status: "done",
          processed_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", row.id);
        done++;
      } else {
        const finalStatus = row.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
        await supa.from("terra_webhook_queue").update({
          status: finalStatus,
          last_error: result.error ?? "unknown",
        }).eq("id", row.id);
        if (finalStatus === "failed") failed++; else retried++;
      }
    } catch (e: any) {
      const finalStatus = row.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      console.error("[process-terra-queue] row threw", row.id, e?.message ?? e);
      await supa.from("terra_webhook_queue").update({
        status: finalStatus,
        last_error: String(e?.message ?? e),
      }).eq("id", row.id);
      if (finalStatus === "failed") failed++; else retried++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, claimed: rows.length, done, failed, retried }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

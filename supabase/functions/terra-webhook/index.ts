// Enqueue-only Terra webhook entry. Keep this file tiny: no imports from
// _shared/terraWebhookHandler.ts. Cold-start cost dominates Terra's
// "response time" metric, so we depend on nothing beyond the Supabase
// client and inline everything else.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, terra-signature",
};

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const raw = await req.text();
  const sigHeader = req.headers.get("terra-signature");

  const enqueue = supa.from("terra_webhook_queue").insert({
    env: "prod",
    raw_body: raw,
    signature_header: sigHeader,
  }).then(({ error }) => {
    if (error) console.error("[terra-webhook] enqueue failed", error);
  }, (e) => {
    console.error("[terra-webhook] enqueue threw", e);
  });

  // @ts-ignore EdgeRuntime is provided by the Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any)?.waitUntil) {
    // @ts-ignore
    (EdgeRuntime as any).waitUntil(enqueue);
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

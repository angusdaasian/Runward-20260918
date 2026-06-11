import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const raw = Deno.env.get("WHATSAPP_BUSINESS_NUMBER") ?? "";
  const number = raw.replace(/[^\d]/g, "");
  return new Response(JSON.stringify({ number }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});

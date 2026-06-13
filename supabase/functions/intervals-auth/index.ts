import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { redirect_uri } = await req.json();
    if (!redirect_uri) {
      return new Response(JSON.stringify({ error: "redirect_uri is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("INTERVALS_CLIENT_ID");
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "INTERVALS_CLIENT_ID not configured", code: "NOT_CONFIGURED" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url =
      `https://intervals.icu/oauth/authorize?` +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri,
        response_type: "code",
        scope: "ACTIVITY:READ,WELLNESS:READ",
      }).toString();

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

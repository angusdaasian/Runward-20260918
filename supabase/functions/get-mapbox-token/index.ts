// Returns the Mapbox public access token for use in the client.
// Token is publishable (pk.*) so safe to expose; stored as a secret for rotation.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const token = Deno.env.get("MAPBOX_PUBLIC_TOKEN") ?? "";
  return new Response(JSON.stringify({ token }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

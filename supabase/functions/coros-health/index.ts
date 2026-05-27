// COROS Service Status Check endpoint.
// COROS sends a GET to this URL; if it returns HTTP 200, the service is "up".
// No auth, no body, must be reachable over HTTPS.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response("ok", {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
});

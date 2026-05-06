import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED = new Set(["GARMIN", "POLAR", "SUUNTO", "COROS"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user }, error: uerr } = await supa.auth.getUser();
    if (uerr || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider ?? "").toUpperCase();
    if (!ALLOWED.has(provider)) {
      return new Response(JSON.stringify({ error: "invalid provider" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const env = pickEnvFromRequest(req, [body.success_url, body.failure_url]);
    const { devId, apiKey } = getTerraCreds(env);
    console.log(`[terra-auth-init] env=${env} provider=${provider}`);

    const baseHost = env === "test" ? "https://angustest.site" : "https://pacecalculator.fun";
    const DEFAULT_SUCCESS = `${baseHost}/terra-return?status=success&native=true`;
    const DEFAULT_FAILURE = `${baseHost}/terra-return?status=failure&native=true`;
    const successUrl = (typeof body.success_url === "string" && body.success_url.trim()) ? body.success_url.trim() : DEFAULT_SUCCESS;
    const failureUrl = (typeof body.failure_url === "string" && body.failure_url.trim()) ? body.failure_url.trim() : DEFAULT_FAILURE;

    const tres = await fetch(`https://api.tryterra.co/v2/auth/authenticateUser?resource=${provider}`, {
      method: "POST",
      headers: {
        "dev-id": devId,
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: "en",
        reference_id: user.id,
        auth_success_redirect_url: successUrl,
        auth_failure_redirect_url: failureUrl,
      }),
    });
    const tjson = await tres.json();
    if (!tres.ok) {
      console.error("Terra auth init failed", tjson);
      return new Response(JSON.stringify({ error: "terra error", details: tjson }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ auth_url: tjson.auth_url, user_id: tjson.user_id, status: tjson.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GARMIN_RAILWAY_URL = Deno.env.get("GARMIN_RAILWAY_URL");

    if (!GARMIN_RAILWAY_URL) {
      return new Response(JSON.stringify({ error: "Garmin service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { ticket, callback, serviceUrl } = body;
    const exchangeServiceUrl = typeof serviceUrl === "string" && serviceUrl.trim()
      ? serviceUrl.trim()
      : (typeof callback === "string" && callback.trim() ? callback.trim() : null);

    if (!ticket || typeof ticket !== "string") {
      return new Response(JSON.stringify({ error: "ticket required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Block if a fitness app is already connected
    const { data: stravaConn } = await supabase
      .from("strava_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (stravaConn) {
      return new Response(JSON.stringify({ error: "Please disconnect Strava before connecting Garmin" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exchangeRes = await fetch(`${GARMIN_RAILWAY_URL}/garmin-exchange-ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket, callback: exchangeServiceUrl, serviceUrl: exchangeServiceUrl }),
    });

    if (!exchangeRes.ok) {
      const errData = await exchangeRes.json().catch(() => ({}));
      console.error("Garmin ticket exchange failed:", errData);
      return new Response(JSON.stringify({ error: errData.detail || errData.error || "Garmin ticket exchange failed" }), {
        status: exchangeRes.status === 429 ? 429 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exchangeData = await exchangeRes.json();
    const garminEmail = exchangeData.email || null;
    const displayName = exchangeData.display_name || garminEmail || "Garmin user";

    // Store a placeholder access_token (the Garmin email) so Railway can locate the
    // user's token folder on subsequent /garmin-activities calls. No password is stored.
    await supabase.from("garmin_connections").upsert({
      user_id: user.id,
      access_token: garminEmail ?? user.id,
      refresh_token: null,
      expires_at: null,
      garmin_display_name: displayName,
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ success: true, display_name: displayName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("garmin-sso-exchange error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

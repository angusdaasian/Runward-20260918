import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // 1. Initial Request Logging (Visible in Supabase Logs tab)
  const url = new URL(req.url);
  console.log(`[garmin-auth] Incoming: ${req.method} ${url.pathname}`);

  // 2. Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 3. Verify JWT / User Identity
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[garmin-auth] Error: Missing Authorization header");
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("[garmin-auth] Error: Invalid token", userError);
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Parse Garmin Credentials
    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Proxy to Railway API
    const railwayUrl = Deno.env.get("GARMIN_RAILWAY_URL");
    if (!railwayUrl) {
      console.error("[garmin-auth] Error: GARMIN_RAILWAY_URL secret not set");
      return new Response(JSON.stringify({ error: "Garmin service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[garmin-auth] Attempting login for ${email} via ${railwayUrl}/auth`);

    const railwayRes = await fetch(`${railwayUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await railwayRes.json();

    if (!railwayRes.ok || !data.success) {
      const msg = data.error || data.message || "Garmin login failed";
      console.warn(`[garmin-auth] Railway rejected login: ${msg}`);
      return new Response(JSON.stringify({ error: msg }), {
        status: railwayRes.status >= 400 ? railwayRes.status : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Store Session in Database
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const displayName = data.display_name || email.split("@")[0];

    const { error: dbError } = await supabaseAdmin.from("garmin_connections").upsert(
      {
        user_id: user.id,
        access_token: JSON.stringify(data.session_data),
        garmin_display_name: displayName,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (dbError) {
      console.error("[garmin-auth] Database Upsert Error:", dbError);
      return new Response(JSON.stringify({ error: "Failed to save Garmin connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[garmin-auth] Successfully connected Garmin for user: ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        display_name: displayName,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[garmin-auth] Unexpected Crash:", err.message);
    return new Response(JSON.stringify({ error: "Internal server error", details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

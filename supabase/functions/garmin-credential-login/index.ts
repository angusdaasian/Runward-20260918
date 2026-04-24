import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptString } from "../_shared/garminCrypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("garmin-credential-login: invoked");
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
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (email.length > 254 || password.length > 256) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Railway /garmin-login. May block up to ~15s while Railway either
    // completes login or detects an MFA prompt.
    const loginRes = await fetch(`${GARMIN_RAILWAY_URL}/garmin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const loginData = await loginRes.json().catch(() => ({} as any));

    if (!loginRes.ok) {
      const detail = typeof loginData?.detail === "string" ? loginData.detail : "Garmin login failed";
      return new Response(JSON.stringify({ error: detail }), {
        status: loginRes.status === 401 ? 401 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Case 1: MFA needed — pass the session_id back to the client. We do NOT
    // store the email yet; we'll store it after MFA succeeds.
    if (loginData?.needs_mfa) {
      const sessionId = loginData.session_id;
      if (!sessionId) {
        return new Response(JSON.stringify({ error: "Garmin returned MFA requirement without a session id" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // We need the email later when MFA completes. Encrypt and stash it
      // briefly on the client — it'll come back with the MFA submit.
      const emailEncrypted = await encryptString(email);
      return new Response(JSON.stringify({
        success: true,
        mfa_required: true,
        session_id: sessionId,
        email_encrypted: emailEncrypted,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Case 2: full login succeeded. Persist the encrypted email.
    const emailEncrypted = await encryptString(email);
    const { error: upsertError } = await supabase
      .from("garmin_connections")
      .upsert({
        user_id: user.id,
        garmin_email_encrypted: emailEncrypted,
        garmin_display_name: email,
        needs_reauth: false,
        // Legacy column kept for backwards compat — no longer used.
        access_token: email,
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("garmin_connections upsert error:", upsertError);
      return new Response(JSON.stringify({ error: "Failed to save Garmin connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      mfa_required: false,
      display_name: email,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("garmin-credential-login error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

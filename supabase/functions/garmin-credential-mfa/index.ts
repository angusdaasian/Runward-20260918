import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptString } from "../_shared/garminCrypto.ts";

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
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    const mfaCode = typeof body.mfa_code === "string" ? body.mfa_code.trim() : "";
    const emailEncrypted = typeof body.email_encrypted === "string" ? body.email_encrypted : "";

    if (!sessionId || !mfaCode || !emailEncrypted) {
      return new Response(JSON.stringify({ error: "session_id, mfa_code and email_encrypted are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mfaCode.length > 12) {
      return new Response(JSON.stringify({ error: "Invalid MFA code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decrypt the email so we can persist it after MFA succeeds.
    let email: string;
    try {
      email = await decryptString(emailEncrypted);
    } catch (e) {
      console.error("Failed to decrypt email_encrypted:", e);
      return new Response(JSON.stringify({ error: "Invalid session — please start over" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mfaRes = await fetch(`${GARMIN_RAILWAY_URL}/garmin-login-mfa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, mfa_code: mfaCode }),
    });

    const mfaData = await mfaRes.json().catch(() => ({} as any));
    if (!mfaRes.ok || !mfaData?.success) {
      const detail = typeof mfaData?.detail === "string" ? mfaData.detail : "MFA verification failed";
      return new Response(JSON.stringify({ error: detail }), {
        status: mfaRes.status >= 400 && mfaRes.status < 500 ? mfaRes.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Railway returns oauth1_token and oauth2_token JSON strings after MFA succeeds.
    const oauth1 = typeof mfaData?.oauth1_token === "string" ? mfaData.oauth1_token : null;
    const oauth2 = typeof mfaData?.oauth2_token === "string" ? mfaData.oauth2_token : null;
    if (!oauth1 || !oauth2) {
      console.error("Railway MFA succeeded but did not return tokens", mfaData);
      return new Response(JSON.stringify({ error: "Garmin service did not return tokens" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { encryptString } = await import("../_shared/garminCrypto.ts");
    const oauth1Encrypted = await encryptString(oauth1);
    const oauth2Encrypted = await encryptString(oauth2);

    // Persist the connection with tokens.
    const { error: upsertError } = await supabase
      .from("garmin_connections")
      .upsert({
        user_id: user.id,
        garmin_email_encrypted: emailEncrypted,
        garmin_display_name: email,
        oauth1_token_encrypted: oauth1Encrypted,
        oauth2_token_encrypted: oauth2Encrypted,
        needs_reauth: false,
        access_token: email, // legacy column, kept in sync
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("garmin_connections upsert error:", upsertError);
      return new Response(JSON.stringify({ error: "Failed to save Garmin connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, display_name: email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("garmin-credential-mfa error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

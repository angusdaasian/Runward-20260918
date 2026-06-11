import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { POLAR_API_BASE, POLAR_TOKEN_URL } from "../_shared/polar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const clientId = Deno.env.get("POLAR_CLIENT_ID");
    const clientSecret = Deno.env.get("POLAR_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Polar not configured", code: "NOT_CONFIGURED" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, ANON);
    const { data: { user }, error: userError } =
      await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, redirect_uri } = await req.json();
    if (!code || !redirect_uri) {
      return new Response(JSON.stringify({ error: "code and redirect_uri required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const basic = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch(POLAR_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json;charset=UTF-8",
        "Authorization": `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("polar token exchange failed", tokenData);
      throw new Error(`Polar token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    const accessToken: string = tokenData.access_token;
    const polarUserId = Number(tokenData.x_user_id);
    if (!accessToken || !polarUserId) {
      throw new Error("Missing access_token or x_user_id from Polar");
    }
    // expires_in may be very large (years). Default 1 year if missing.
    const expiresAt = Math.floor(Date.now() / 1000) + Number(tokenData.expires_in || 31536000);

    // Register the user with AccessLink. member-id must be unique per partner.
    const memberId = `runward-${user.id}`;
    const regRes = await fetch(`${POLAR_API_BASE}/users`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ "member-id": memberId }),
    });
    if (!regRes.ok && regRes.status !== 409) {
      const txt = await regRes.text();
      console.error("polar user register failed", regRes.status, txt);
      // 409 = already registered (re-auth flow). Anything else is fatal.
      throw new Error(`Polar register user failed (${regRes.status}): ${txt}`);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE);

    // Clean up stale rows pointing to the same Polar user on a different account
    await supabase
      .from("polar_connections")
      .delete()
      .eq("polar_user_id", polarUserId)
      .neq("user_id", user.id);

    const { error: dbError } = await supabase
      .from("polar_connections")
      .upsert({
        user_id: user.id,
        polar_user_id: polarUserId,
        member_id: memberId,
        access_token: accessToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    // Kick off an initial backfill of the last 7 days.
    // Fire-and-forget so the callback stays snappy; surface any error in logs.
    let initialSync: { count?: number; error?: string } = {};
    try {
      const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/polar-sync`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ since_days: 7 }),
      });
      initialSync = await syncRes.json().catch(() => ({}));
    } catch (e) {
      console.warn("[polar-callback] initial sync failed", e);
      initialSync = { error: e instanceof Error ? e.message : String(e) };
    }

    return new Response(JSON.stringify({ success: true, polar_user_id: polarUserId, initial_sync: initialSync }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("polar-callback error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

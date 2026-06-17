import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);

    const { data: { user }, error: userError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, redirect_uri } = await req.json();
    if (!code || !redirect_uri) {
      return new Response(JSON.stringify({ error: "code and redirect_uri required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("INTERVALS_CLIENT_ID")!;
    const clientSecret = Deno.env.get("INTERVALS_CLIENT_SECRET")!;
    if (!clientId || !clientSecret) {
      throw new Error("INTERVALS_CLIENT_ID/SECRET not configured");
    }

    const tokenRes = await fetch("https://intervals.icu/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`intervals.icu token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    // intervals.icu returns access_token, scope and the athlete nested as athlete.id.
    // Keep top-level fallbacks for older/alternate payloads.
    const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600);
    const extractAthleteId = (payload: unknown): string => {
      const data = payload as Record<string, unknown> | null;
      const athlete = data?.athlete as Record<string, unknown> | null;
      const raw = data?.athlete_id ?? data?.athleteId ?? athlete?.id ?? data?.id ?? null;
      return raw != null ? String(raw) : "";
    };
    const rawAthleteId = extractAthleteId(tokenData);
    let athleteId = rawAthleteId != null ? String(rawAthleteId) : "";

    if (!athleteId) {
      // Fall back to the authenticated athlete endpoint. intervals.icu supports id "0"
      // to mean the athlete belonging to the bearer token.
      console.log(
        "intervals-callback: athlete_id missing from token response, keys=",
        Object.keys(tokenData),
      );
      try {
        const meRes = await fetch("https://intervals.icu/api/v1/athlete/0", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const me = await meRes.json();
        athleteId = meRes.ok ? extractAthleteId(me) : "";
        if (!athleteId) console.log("intervals-callback: /athlete/0 fallback failed", meRes.status, me);
      } catch (e) {
        console.log("intervals-callback: /athlete/0 fallback threw", e);
      }
    }
    if (!athleteId) {
      throw new Error(
        `intervals.icu token response missing athlete_id (keys: ${Object.keys(tokenData).join(",")})`,
      );
    }

    // Drop stale rows for this athlete owned by other users.
    await supabase
      .from("intervals_connections")
      .delete()
      .eq("athlete_id", athleteId)
      .neq("user_id", user.id);

    const { error: dbError } = await supabase
      .from("intervals_connections")
      .upsert(
        {
          user_id: user.id,
          athlete_id: athleteId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: expiresAt,
          scope: tokenData.scope ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    return new Response(JSON.stringify({ success: true, athlete_id: athleteId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("intervals-callback error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

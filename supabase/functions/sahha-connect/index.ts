// Sahha.ai test integration — server-side connector + data fetcher
//
// Actions:
//   - connect          : exchange clientId/secret for an account token, then
//                        register the current user as a Sahha "profile"
//                        (externalId = supabase user.id) and persist the
//                        returned profile/refresh tokens.
//   - fetch_scores     : pull scores from /profile/score/{externalId}
//   - fetch_biomarkers : pull biomarkers from /profile/biomarker/{externalId}
//                        for the last 7 days
//   - disconnect       : delete the user's sahha_connections row
//
// NOTE: profile_token / refresh_token are stored in plaintext for the test
// phase. Before promoting to production we should encrypt them at rest the
// same way Garmin tokens are (see _shared/garminCrypto.ts).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SAHHA_BASE_URL = "https://sandbox-api.sahha.ai";

// In-memory cache for the account token across warm invocations
let cachedAccountToken: { token: string; expiresAt: number } | null = null;

async function getAccountToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccountToken && cachedAccountToken.expiresAt > now + 60_000) {
    return cachedAccountToken.token;
  }

  const clientId = Deno.env.get("SAHHA_CLIENT_ID");
  const clientSecret = Deno.env.get("SAHHA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Sahha credentials not configured");
  }

  const res = await fetch(`${SAHHA_BASE_URL}/api/v1/oauth/account/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sahha account-token failed [${res.status}]: ${text}`);
  }
  const data = JSON.parse(text) as { accountToken: string; expiresIn: number };
  cachedAccountToken = {
    token: data.accountToken,
    expiresAt: now + data.expiresIn * 1000,
  };
  return data.accountToken;
}

async function sahhaGet(path: string, accountToken: string) {
  const res = await fetch(`${SAHHA_BASE_URL}${path}`, {
    headers: { Authorization: `account ${accountToken}` },
  });
  // 204 = no data yet (valid for new profiles)
  if (res.status === 204) return { _empty: true };
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sahha GET ${path} failed [${res.status}]: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT and derive user from token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Service-role client for DB writes
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "connect") {
      const accountToken = await getAccountToken();
      const externalId = userId;

      // Try to register the profile. If it already exists Sahha returns 400 —
      // in that case fall back to /oauth/profile/token to fetch a fresh token.
      let profileToken: string | null = null;
      let refreshToken: string | null = null;

      const regRes = await fetch(
        `${SAHHA_BASE_URL}/api/v1/oauth/profile/register`,
        {
          method: "POST",
          headers: {
            Authorization: `account ${accountToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ externalId }),
        },
      );
      const regText = await regRes.text();

      if (regRes.ok) {
        const reg = JSON.parse(regText) as {
          profileToken: string;
          refreshToken: string;
        };
        profileToken = reg.profileToken;
        refreshToken = reg.refreshToken;
      } else {
        // Likely already-registered. Try to fetch token for existing profile.
        console.log(
          `Sahha register returned ${regRes.status}, trying token endpoint: ${regText}`,
        );
        const tokRes = await fetch(
          `${SAHHA_BASE_URL}/api/v1/oauth/profile/token`,
          {
            method: "POST",
            headers: {
              Authorization: `account ${accountToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ externalId }),
          },
        );
        const tokText = await tokRes.text();
        if (!tokRes.ok) {
          throw new Error(
            `Sahha register+token both failed. register=[${regRes.status}] ${regText} token=[${tokRes.status}] ${tokText}`,
          );
        }
        const tok = JSON.parse(tokText) as {
          profileToken: string;
          refreshToken: string;
        };
        profileToken = tok.profileToken;
        refreshToken = tok.refreshToken;
      }

      const { error: upsertErr } = await admin
        .from("sahha_connections")
        .upsert(
          {
            user_id: userId,
            external_id: externalId,
            profile_token: profileToken,
            refresh_token: refreshToken,
            connected_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (upsertErr) {
        throw new Error(`DB upsert failed: ${upsertErr.message}`);
      }

      return new Response(
        JSON.stringify({ success: true, external_id: externalId }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "fetch_scores") {
      const { data: conn } = await admin
        .from("sahha_connections")
        .select("external_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!conn) {
        return new Response(
          JSON.stringify({ error: "Not connected to Sahha" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const accountToken = await getAccountToken();
      const types = "activity,sleep,wellbeing,readiness,mental_wellbeing";
      const scores = await sahhaGet(
        `/api/v1/profile/score/${encodeURIComponent(conn.external_id)}?types=${types}`,
        accountToken,
      );

      await admin
        .from("sahha_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("user_id", userId);

      return new Response(JSON.stringify({ success: true, data: scores }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fetch_biomarkers") {
      const { data: conn } = await admin
        .from("sahha_connections")
        .select("external_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!conn) {
        return new Response(
          JSON.stringify({ error: "Not connected to Sahha" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const accountToken = await getAccountToken();
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 7);
      const qs = new URLSearchParams({
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        categories: "activity,sleep,vitals,body,characteristic",
      });
      const biomarkers = await sahhaGet(
        `/api/v1/profile/biomarker/${encodeURIComponent(conn.external_id)}?${qs.toString()}`,
        accountToken,
      );

      return new Response(
        JSON.stringify({ success: true, data: biomarkers }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "disconnect") {
      const { error } = await admin
        .from("sahha_connections")
        .delete()
        .eq("user_id", userId);
      if (error) throw new Error(`DB delete failed: ${error.message}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sahha-connect error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

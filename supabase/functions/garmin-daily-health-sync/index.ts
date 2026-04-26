// Garmin daily health sync.
// - Cron mode (no JWT): triggered by pg_cron at 02:00 UTC (10:00 HKT) every day.
//   Authenticated by header `x-webhook-key` matching WEBHOOK_AUTH_KEY.
//   Iterates all healthy garmin_connections, fetches today's stats, upserts.
// - User mode (JWT present): manual refresh from the UI for the calling user.
//
// This sync also exercises the OAuth2 auto-refresh path via callRailway,
// which keeps the user's tokens alive.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptString } from "../_shared/garminCrypto.ts";
import { callRailway } from "../_shared/garminRailway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Today in HKT (UTC+8) as YYYY-MM-DD.
function todayHKT(): string {
  const now = new Date();
  const hkt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = hkt.getUTCFullYear();
  const m = String(hkt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(hkt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface HealthStats {
  date: string;
  vo2max: number | null;
  resting_hr: number | null;
  sleep_seconds: number | null;
  sleep_score: number | null;
}

async function syncOneUser(
  supabase: any,
  railwayUrl: string,
  userId: string,
  date: string,
): Promise<{ ok: boolean; reason?: string; stats?: HealthStats }> {
  const { data: conn } = await supabase
    .from("garmin_connections")
    .select(
      "garmin_email_encrypted, access_token, oauth1_token_encrypted, oauth2_token_encrypted, needs_reauth",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn) return { ok: false, reason: "no_connection" };
  if (conn.needs_reauth) return { ok: false, reason: "needs_reauth" };

  let email: string | null = null;
  let oauth1: string | null = null;
  let oauth2: string | null = null;

  if (conn.garmin_email_encrypted) {
    try {
      email = await decryptString(conn.garmin_email_encrypted);
    } catch (e) {
      console.error(`[health-sync] decrypt email failed user=${userId}:`, e);
    }
  }
  if (!email) email = conn.access_token;

  if (conn.oauth1_token_encrypted) {
    try {
      oauth1 = await decryptString(conn.oauth1_token_encrypted);
    } catch (e) {
      console.error(`[health-sync] decrypt oauth1 failed user=${userId}:`, e);
    }
  }
  if (conn.oauth2_token_encrypted) {
    try {
      oauth2 = await decryptString(conn.oauth2_token_encrypted);
    } catch (e) {
      console.error(`[health-sync] decrypt oauth2 failed user=${userId}:`, e);
    }
  }

  if (!email || !oauth1 || !oauth2) {
    await supabase
      .from("garmin_connections")
      .update({ needs_reauth: true })
      .eq("user_id", userId);
    return { ok: false, reason: "missing_tokens" };
  }

  const result = await callRailway<HealthStats>({
    supabase,
    userId,
    railwayUrl,
    path: "/garmin-health-stats",
    email,
    oauth1Token: oauth1,
    oauth2Token: oauth2,
    extraBody: { date },
  });

  if (!result.ok) {
    if (result.reauthRequired) return { ok: false, reason: "reauth_required" };
    return { ok: false, reason: `railway_${result.status}: ${result.errorText ?? ""}` };
  }

  const stats = result.data;
  if (!stats || typeof stats !== "object") {
    return { ok: false, reason: "empty_payload" };
  }

  const row = {
    user_id: userId,
    date,
    vo2max: stats.vo2max ?? null,
    resting_hr: stats.resting_hr ?? null,
    sleep_seconds: stats.sleep_seconds ?? null,
    sleep_score: stats.sleep_score ?? null,
    fetched_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("garmin_daily_health")
    .upsert(row, { onConflict: "user_id,date" });

  if (upErr) {
    console.error(`[health-sync] upsert failed user=${userId}:`, upErr);
    return { ok: false, reason: `upsert_${upErr.message}` };
  }

  return { ok: true, stats: { ...row } as HealthStats };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GARMIN_RAILWAY_URL = Deno.env.get("GARMIN_RAILWAY_URL");
    const WEBHOOK_AUTH_KEY = Deno.env.get("WEBHOOK_AUTH_KEY");

    if (!GARMIN_RAILWAY_URL) {
      return new Response(JSON.stringify({ error: "Garmin service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Decide mode: cron vs user.
    const authHeader = req.headers.get("Authorization");
    const webhookKey = req.headers.get("x-webhook-key");

    let userId: string | null = null;
    if (authHeader) {
      const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (!error && user) userId = user.id;
    }

    const date = todayHKT();

    if (userId) {
      // Manual user-triggered refresh.
      const result = await syncOneUser(supabase, GARMIN_RAILWAY_URL, userId, date);
      if (!result.ok) {
        const reauth = result.reason === "reauth_required" || result.reason === "needs_reauth";
        return new Response(
          JSON.stringify({ success: false, error: result.reason, reauth_required: reauth }),
          {
            status: reauth ? 401 : 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ success: true, stats: result.stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron / unauthenticated — require webhook key.
    if (!WEBHOOK_AUTH_KEY || webhookKey !== WEBHOOK_AUTH_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Iterate every healthy Garmin connection.
    const { data: connections, error: connErr } = await supabase
      .from("garmin_connections")
      .select("user_id")
      .eq("needs_reauth", false);

    if (connErr) {
      return new Response(JSON.stringify({ error: connErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const total = connections?.length ?? 0;
    let success = 0;
    let failed = 0;
    const failures: Array<{ user_id: string; reason?: string }> = [];

    for (const c of connections ?? []) {
      const r = await syncOneUser(supabase, GARMIN_RAILWAY_URL, c.user_id, date);
      if (r.ok) success++;
      else {
        failed++;
        failures.push({ user_id: c.user_id, reason: r.reason });
      }
    }

    console.log(
      `[health-sync] cron done date=${date} total=${total} success=${success} failed=${failed}`,
    );

    return new Response(
      JSON.stringify({ success: true, date, total, synced: success, failed, failures }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[health-sync] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

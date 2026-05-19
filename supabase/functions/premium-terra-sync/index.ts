// Premium-only Terra historical sync.
// Fetches all activities from 2026-01-01 onward for every Terra connection
// the user has, and upserts them into terra_activities.
//
// Gating:
//   - User must be signed in
//   - User must be premium AND NOT on trial (checked via premium_subscriptions
//     which is kept fresh by the check-revenuecat-status function / RC webhook)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const START_DATE = "2026-01-01";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function secondsBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const s = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  return Number.isFinite(s) && s > 0 ? s : null;
}

async function upsertActivity(admin: any, conn: any, a: any) {
  const meta = a?.metadata ?? {};
  const dist = a?.distance_data?.summary ?? {};
  const hr = a?.heart_rate_data?.summary ?? {};
  const cal = a?.calories_data ?? {};
  const distanceMeters = toNum(dist?.distance_meters);
  const durationSeconds =
    toNum(a?.active_durations_data?.activity_seconds) ??
    toNum(a?.active_durations_data?.duration_activity_seconds) ??
    toNum(meta?.active_duration_seconds) ??
    secondsBetween(meta?.start_time, meta?.end_time);

  const aid =
    String(meta?.upload_type ?? "") +
    ":" +
    String(meta?.summary_id ?? meta?.id ?? meta?.start_time ?? crypto.randomUUID());

  await admin.from("terra_activities").upsert(
    {
      user_id: conn.user_id,
      provider: conn.provider,
      terra_activity_id: aid,
      activity_name: meta?.name ?? null,
      activity_type: meta?.type ?? null,
      start_time: meta?.start_time ?? null,
      duration_seconds: durationSeconds ? Math.round(durationSeconds) : null,
      distance_meters: distanceMeters,
      calories: cal?.total_burned_calories ? Math.round(cal.total_burned_calories) : null,
      average_hr: hr?.avg_hr_bpm ? Math.round(hr.avg_hr_bpm) : null,
      max_hr: hr?.max_hr_bpm ? Math.round(hr.max_hr_bpm) : null,
      elevation_gain: dist?.elevation?.gain_actual_meters ?? null,
      average_speed: a?.movement_data?.avg_speed_meters_per_second ?? null,
    },
    { onConflict: "user_id,terra_activity_id" },
  );

  return aid;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const userId = userData.user.id;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Premium + non-trial gate ---
    const { data: sub } = await admin
      .from("premium_subscriptions")
      .select("expires_at, is_trial")
      .eq("user_id", userId)
      .maybeSingle();

    const now = new Date();
    const isPremium = !!sub && new Date(sub.expires_at) > now;
    const isTrial = !!sub?.is_trial;

    if (!isPremium) {
      return json({ error: "premium_required", message: "Premium subscription required." }, 403);
    }
    if (isTrial) {
      return json(
        { error: "trial_not_allowed", message: "Historical sync is only available on a paid plan, not during the 7-day trial." },
        403,
      );
    }

    // --- Terra creds (try prod first, fall back to test) ---
    const prodCreds = getTerraCreds("prod");
    const testCreds = getTerraCreds("test");
    if (!prodCreds.apiKey && !testCreds.apiKey) {
      return json({ error: "terra_not_configured" }, 500);
    }

    // --- Terra connections ---
    const { data: connections, error: connErr } = await admin
      .from("terra_connections")
      .select("user_id, provider, terra_user_id, reference_id, active")
      .eq("user_id", userId)
      .eq("active", true);

    if (connErr) return json({ error: "db_error", details: connErr.message }, 500);
    if (!connections || connections.length === 0) {
      return json({ error: "no_terra_connection", message: "No active Terra connection found." }, 404);
    }

    const tryFetch = async (creds: { apiKey: string; devId: string }, terraUserId: string) => {
      const qs = new URLSearchParams({
        user_id: terraUserId,
        start_date: START_DATE,
        with_samples: "true",
      });
      const url = `https://api.tryterra.co/v2/activity?${qs.toString()}`;
      const resp = await fetch(url, {
        headers: {
          "x-api-key": creds.apiKey,
          "dev-id": creds.devId,
          Accept: "application/json",
        },
      });
      const terraReference = resp.headers.get("terra-reference");
      const body = await resp.json().catch(() => null);
      return { url, resp, body, terraReference };
    };

    const results: any[] = [];
    for (const conn of connections) {
      const attempts: Array<{ env: "prod" | "test"; creds: typeof prodCreds }> = [];
      if (prodCreds.apiKey && prodCreds.devId) attempts.push({ env: "prod", creds: prodCreds });
      if (testCreds.apiKey && testCreds.devId) attempts.push({ env: "test", creds: testCreds });

      let chosen: { env: "prod" | "test"; resp: Response; body: any; terraReference: string | null } | null = null;
      let lastError: { env: "prod" | "test"; status: number; body: any; terraReference: string | null } | null = null;

      for (const { env, creds } of attempts) {
        const { url, resp, body, terraReference } = await tryFetch(creds, conn.terra_user_id);
        console.log(`[premium-terra-sync] ${conn.provider} try=${env} status=${resp.status} url=${url}`);
        if (resp.ok) {
          chosen = { env, resp, body, terraReference };
          break;
        }
        lastError = { env, status: resp.status, body, terraReference };
        if (resp.status !== 404) {
          // non-404 error: don't bother retrying with the other env
          break;
        }
        console.log(`[premium-terra-sync] ${conn.provider} try=${env} 404 -> retry other env`);
      }

      if (!chosen) {
        console.error(`[premium-terra-sync] ${conn.provider} all envs failed`, lastError);
        results.push({
          provider: conn.provider,
          env: lastError?.env,
          status: lastError?.status,
          error: lastError?.body?.message ?? lastError?.body?.detail ?? "terra_error",
          terraReference: lastError?.terraReference,
        });
        continue;
      }

      const activities: any[] = Array.isArray(chosen.body?.data) ? chosen.body.data : [];
      let upserted = 0;
      for (const a of activities) {
        try {
          await upsertActivity(admin, conn, a);
          upserted++;
        } catch (e) {
          console.error(`[premium-terra-sync] upsert error`, e);
        }
      }

      results.push({
        provider: conn.provider,
        env: chosen.env,
        status: chosen.resp.status,
        terraReference: chosen.terraReference,
        fetched: activities.length,
        upserted,
      });
    }

    return json({ success: true, startDate: START_DATE, results });
  } catch (err) {
    console.error("[premium-terra-sync] fatal", err);
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});

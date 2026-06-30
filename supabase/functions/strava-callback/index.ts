import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStravaAppById, pickAvailableApp, StravaAppsError } from "../_shared/strava-apps.ts";
import { maybeTrainCoachOnce } from "../_shared/trainCoachOnce.ts";

async function backfillStravaSevenDays(
  supabase: any,
  userId: string,
  accessToken: string,
) {
  try {
    const after = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      console.error("[strava-callback] backfill fetch failed", res.status, await res.text());
      return;
    }
    const activities = await res.json();
    if (!Array.isArray(activities)) return;
    for (const act of activities) {
      await supabase.from("strava_activities").upsert(
        {
          user_id: userId,
          strava_id: act.id,
          name: act.name,
          sport_type: act.sport_type || act.type || "Run",
          distance: act.distance,
          moving_time: act.moving_time,
          elapsed_time: act.elapsed_time,
          total_elevation_gain: act.total_elevation_gain,
          start_date: act.start_date,
          average_speed: act.average_speed,
          max_speed: act.max_speed,
          average_heartrate: act.average_heartrate || null,
          max_heartrate: act.max_heartrate || null,
          summary_polyline: act.map?.summary_polyline || null,
          environment: "prod",
        },
        { onConflict: "strava_id" },
      );
    }
    console.log(`[strava-callback] backfilled ${activities.length} activities user=${userId}`);
    await maybeTrainCoachOnce(supabase, userId);
  } catch (e) {
    console.error("[strava-callback] backfill error", e);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { code, state } = await req.json();
    if (!code) {
      return new Response(JSON.stringify({ error: 'Authorization code required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let app;
    try {
      const parsed = state ? JSON.parse(state) : {};
      if (parsed.app_id) {
        app = await getStravaAppById(supabase, parsed.app_id);
      }
    } catch (_e) { /* ignore parse errors */ }
    if (!app) app = await pickAvailableApp(supabase);

    if (!app.client_secret) {
      throw new StravaAppsError('APP_SECRET_MISSING', `Strava app ${app.client_id} missing client_secret`);
    }

    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: app.client_id,
        client_secret: app.client_secret,
        code,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`Strava token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    // Remove any stale connection rows for this athlete that belong to other users
    await supabase
      .from('strava_connections')
      .delete()
      .eq('strava_athlete_id', tokenData.athlete.id)
      .neq('user_id', user.id);

    const { error: dbError } = await supabase
      .from('strava_connections')
      .upsert({
        user_id: user.id,
        strava_athlete_id: tokenData.athlete.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        strava_app_id: app.id,
        environment: 'prod',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (dbError) {
      throw new Error(`DB error: ${dbError.message}`);
    }

    // Fire-and-forget 7-day activity backfill + coach training.
    const backfillTask = backfillStravaSevenDays(supabase, user.id, tokenData.access_token);
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(backfillTask); } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({ success: true, athlete: tokenData.athlete }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('strava-callback error:', error);
    if (error instanceof StravaAppsError) {
      return new Response(JSON.stringify({ error: error.message, code: error.code }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

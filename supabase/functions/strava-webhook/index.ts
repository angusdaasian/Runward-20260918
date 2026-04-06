import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// VDOT calculation (Daniel's Running Formula)
function percentVO2(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes);
}

function vo2Cost(velocity: number): number {
  return -4.60 + 0.182258 * velocity + 0.000104 * velocity * velocity;
}

function calculateVdot(distanceMeters: number, timeSeconds: number): number {
  const minutes = timeSeconds / 60;
  const velocity = distanceMeters / minutes;
  const vo2 = vo2Cost(velocity);
  const pct = percentVO2(minutes);
  return vo2 / pct;
}

const runningSportTypes = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill"]);

async function refreshTokenIfNeeded(
  connection: any,
  supabase: any,
  clientId: string,
  clientSecret: string
) {
  const now = Math.floor(Date.now() / 1000);
  if (connection.expires_at > now + 60) {
    return connection.access_token;
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  await supabase
    .from('strava_connections')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', connection.user_id);

  return data.access_token;
}

async function computeTrainingScore(supabase: any, userId: string, env: string) {
  const { data: rows } = await supabase
    .from('strava_activities')
    .select('moving_time, distance, sport_type')
    .eq('user_id', userId)
    .eq('environment', env)
    .order('start_date', { ascending: false })
    .limit(50);

  if (!rows || rows.length === 0) {
    await supabase.from('profiles').update({ training_score: 0 }).eq('user_id', userId);
    return 0;
  }

  const vdotScores: number[] = [];
  for (const act of rows) {
    if (runningSportTypes.has(act.sport_type) && act.distance >= 400 && act.moving_time >= 60) {
      const vdot = calculateVdot(act.distance, act.moving_time);
      if (vdot >= 5 && vdot <= 100 && isFinite(vdot)) {
        vdotScores.push(vdot);
      }
    }
    if (vdotScores.length >= 20) break;
  }

  const avgScore = vdotScores.length > 0
    ? Math.round((vdotScores.reduce((a, b) => a + b, 0) / vdotScores.length) * 10) / 10
    : 0;

  await supabase.from('profiles').update({ training_score: Math.round(avgScore) }).eq('user_id', userId);
  return avgScore;
}

async function awardActivityXP(supabase: any, userId: string, distanceMeters: number, movingTimeSeconds: number) {
  const km = distanceMeters / 1000;
  const minutes = movingTimeSeconds / 60;
  const xp = Math.round(km * 10) + Math.round(minutes * 5);
  if (xp <= 0) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('monthly_xp, lifetime_xp')
    .eq('user_id', userId)
    .single();

  if (profile) {
    await supabase
      .from('profiles')
      .update({
        monthly_xp: profile.monthly_xp + xp,
        lifetime_xp: profile.lifetime_xp + xp,
      })
      .eq('user_id', userId);
    console.log(`Awarded ${xp} XP to user ${userId} (${km.toFixed(1)}km, ${minutes.toFixed(0)}min)`);
  }
}

async function sendActivityNotification(
  supabase: any,
  userId: string,
  distanceMeters: number,
  movingTimeSeconds: number,
  xpGained: number,
  trainingScore: number
) {
  try {
    // Check if user has notifications enabled
    const { data: profile } = await supabase
      .from('profiles')
      .select('activity_notifications')
      .eq('user_id', userId)
      .single();

    if (!profile?.activity_notifications) {
      console.log(`Notifications disabled for user ${userId}, skipping`);
      return;
    }

    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!onesignalAppId || !onesignalApiKey) {
      console.log("OneSignal not configured, skipping notification");
      return;
    }

    const km = (distanceMeters / 1000).toFixed(2);
    const totalMin = Math.floor(movingTimeSeconds / 60);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const secs = movingTimeSeconds % 60;
    const timeStr = hours > 0
      ? `${hours}h${String(mins).padStart(2, '0')}m${String(secs).padStart(2, '0')}s`
      : `${mins}m${String(secs).padStart(2, '0')}s`;

    const message = `You ran ${km}km in ${timeStr}. You earned ${xpGained} XP! Your Training Score: ${trainingScore}.`;

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${onesignalApiKey}`,
      },
      body: JSON.stringify({
        app_id: onesignalAppId,
        include_external_user_ids: [userId],
        headings: { en: "Run Completed! 🏃‍♂️" },
        contents: { en: message },
      }),
    });

    const result = await res.json();
    console.log(`[push-notification] sent to ${userId}:`, JSON.stringify(result));
  } catch (err) {
    console.error("[push-notification] Error:", err);
  }
}

async function syncActivityById(
  supabase: any,
  accessToken: string,
  activityId: number,
  userId: string,
  env: string
) {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error(`Failed to fetch activity ${activityId}: ${res.status}`);
    return;
  }

  const act = await res.json();

  // Check if activity already exists (avoid double XP on updates)
  const { data: existing } = await supabase
    .from('strava_activities')
    .select('id')
    .eq('strava_id', act.id)
    .single();

  await supabase
    .from('strava_activities')
    .upsert({
      user_id: userId,
      strava_id: act.id,
      name: act.name,
      sport_type: act.sport_type || act.type || 'Run',
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
      environment: env,
    }, { onConflict: 'strava_id' });

  // Award XP only for new activities (not updates)
  const distance = act.distance || 0;
  const movingTime = act.moving_time || 0;
  if (!existing) {
    await awardActivityXP(supabase, userId, distance, movingTime);
  }

  const trainingScore = await computeTrainingScore(supabase, userId, env);

  // Send push notification for new activities
  if (!existing) {
    const km = distance / 1000;
    const minutes = movingTime / 60;
    const xpGained = Math.round(km * 10) + Math.round(minutes * 5);
    await sendActivityNotification(supabase, userId, distance, movingTime, xpGained, Math.round(trainingScore));
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const VERIFY_TOKEN_DEV = Deno.env.get('STRAVA_WEBHOOK_VERIFY_TOKEN')!;
  const VERIFY_TOKEN_PROD = Deno.env.get('STRAVA_WEBHOOK_VERIFY_TOKEN_PROD')!;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const matchesDev = token === VERIFY_TOKEN_DEV;
    const matchesProd = token === VERIFY_TOKEN_PROD;

    console.log("Verification attempt:", {
      mode,
      receivedToken: token,
      matchesDev,
      matchesProd,
      challenge,
    });

    if (mode === 'subscribe' && (matchesDev || matchesProd)) {
      const detectedEnv = matchesProd ? 'prod' : 'dev';
      console.log(`Webhook validated (env: ${detectedEnv})`);
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }

  if (req.method === 'POST') {
    try {
      const event = await req.json();
      console.log('Strava webhook event:', JSON.stringify(event));

      if (event.object_type !== 'activity') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Find the connection to determine which environment this athlete belongs to
      const { data: connection } = await supabase
        .from('strava_connections')
        .select('*')
        .eq('strava_athlete_id', event.owner_id)
        .single();

      if (!connection) {
        console.log('No connection found for athlete:', event.owner_id);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Use the environment from the connection record (set during OAuth)
      const connEnv = connection.environment || 'dev';
      const STRAVA_CLIENT_ID = connEnv === 'prod'
        ? Deno.env.get('STRAVA_CLIENT_ID_PROD')!
        : Deno.env.get('STRAVA_CLIENT_ID')!;
      const STRAVA_CLIENT_SECRET = connEnv === 'prod'
        ? Deno.env.get('STRAVA_CLIENT_SECRET_PROD')!
        : Deno.env.get('STRAVA_CLIENT_SECRET')!;

      if (event.aspect_type === 'delete') {
        await supabase
          .from('strava_activities')
          .delete()
          .eq('strava_id', event.object_id);
        await computeTrainingScore(supabase, connection.user_id, connEnv);
      } else {
        const accessToken = await refreshTokenIfNeeded(
          connection, supabase, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
        );
        await syncActivityById(supabase, accessToken, event.object_id, connection.user_id, connEnv);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error: unknown) {
      console.error('Webhook error:', error);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});

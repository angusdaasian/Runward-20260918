import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getActiveApps, getAppForConnection } from "../_shared/strava-apps.ts";
import { maybeSendTelegramActivityPrompt } from "../_shared/telegramActivityPrompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const runningSportTypes = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill", "Workout"]);

const RANK_TIERS = ["Bronze", "Silver", "Gold", "Diamond"];
const DIVISIONS_LIST = ["V", "IV", "III", "II", "I"];
const XP_PER_DIVISION = 2000;

function computeRankFromXP(monthlyXp: number) {
  const divisionIndex = Math.min(
    Math.floor(monthlyXp / XP_PER_DIVISION),
    RANK_TIERS.length * DIVISIONS_LIST.length - 1
  );
  const tierIndex = Math.min(Math.floor(divisionIndex / DIVISIONS_LIST.length), RANK_TIERS.length - 1);
  const divIndex = divisionIndex % DIVISIONS_LIST.length;
  return { tier: RANK_TIERS[tierIndex], division: DIVISIONS_LIST[divIndex] };
}

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

async function computeTrainingScore(supabase: any, userId: string) {
  const [stravaRes, ahRes] = await Promise.all([
    supabase
      .from('strava_activities')
      .select('moving_time, distance, sport_type, start_date')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(50),
    supabase
      .from('apple_health_activities')
      .select('moving_time, distance, sport_type, start_date')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(50),
  ]);

  const all = [...(stravaRes.data || []), ...(ahRes.data || [])];
  all.sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  if (all.length === 0) {
    await supabase.from('profiles').update({ training_score: 0 }).eq('user_id', userId);
    return 0;
  }

  const vdotScores: number[] = [];
  for (const act of all) {
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

async function awardActivityXP(supabase: any, userId: string, distanceMeters: number, movingTimeSeconds: number, trainingScore: number) {
  const km = distanceMeters / 1000;
  const minutes = movingTimeSeconds / 60;
  const xp = Math.round(km * 20) + Math.round(minutes * 10) + Math.round(trainingScore * 5);
  if (xp <= 0) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('monthly_xp, lifetime_xp')
    .eq('user_id', userId)
    .single();

  if (profile) {
    const newMonthlyXp = (profile.monthly_xp || 0) + xp;
    const rank = computeRankFromXP(newMonthlyXp);
    await supabase
      .from('profiles')
      .update({
        monthly_xp: newMonthlyXp,
        lifetime_xp: (profile.lifetime_xp || 0) + xp,
        rank_tier: rank.tier,
        division: rank.division,
      })
      .eq('user_id', userId);
    console.log(`Awarded ${xp} XP to user ${userId} (${km.toFixed(1)}km, ${minutes.toFixed(0)}min) → ${rank.tier} ${rank.division}`);
  }
}

async function sendActivityNotification(
  supabase: any,
  userId: string,
  activityKey: string,
) {
  try {
    // Idempotency guard
    const { data: claim, error: claimErr } = await supabase
      .from("activity_push_log")
      .insert({ user_id: userId, activity_key: activityKey })
      .select("id")
      .maybeSingle();
    if (claimErr || !claim) {
      console.log(`[strava-webhook] push already sent for ${userId} ${activityKey}, skipping`);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('activity_notifications')
      .eq('user_id', userId)
      .single();

    if (!profile?.activity_notifications) return;

    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!onesignalAppId || !onesignalApiKey) return;

    let lang: "zh" | "en" = "en";
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      const meta: any = (data?.user as any)?.user_metadata ?? {};
      const raw = String(meta.lang ?? meta.language ?? meta.locale ?? "").toLowerCase();
      if (raw.startsWith("zh")) lang = "zh";
    } catch (_) { /* default en */ }

    const title = lang === "zh" ? "新活動已同步" : "New activity synced";
    const message = lang === "zh"
      ? "你的最新活動已上傳。"
      : "Your latest activity has been uploaded.";

    await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${onesignalApiKey}`,
      },
      body: JSON.stringify({
        app_id: onesignalAppId,
        include_external_user_ids: [userId],
        headings: { en: title },
        contents: { en: message },
      }),
    });
  } catch (err) {
    console.error("[push-notification] Error:", err);
  }
}

async function syncActivityById(
  supabase: any,
  accessToken: string,
  activityId: number,
  userId: string
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
      environment: 'prod',
    }, { onConflict: 'strava_id' });

  const distance = act.distance || 0;
  const movingTime = act.moving_time || 0;
  const trainingScore = await computeTrainingScore(supabase, userId);

  if (!existing) {
    await awardActivityXP(supabase, userId, distance, movingTime, Math.round(trainingScore));
    await sendActivityNotification(supabase, userId, `strava:${act.id}`);
    await maybeSendTelegramActivityPrompt({
      userId,
      source: "strava",
      activityKey: String(act.id),
      distanceMeters: distance,
      durationSeconds: movingTime,
      sportType: act.sport_type || act.type || "Run",
    });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const apps = await getActiveApps(supabase);
    const matched = apps.find((a) => a.verify_token && a.verify_token === token);

    console.log('Webhook verification attempt:', { mode, matched: !!matched, client_id: matched?.client_id });

    if (matched) {
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

      const { data: connections } = await supabase
        .from('strava_connections')
        .select('*')
        .eq('strava_athlete_id', event.owner_id)
        .order('updated_at', { ascending: false })
        .limit(1);

      const connection = connections?.[0];
      if (!connection) {
        console.log('No connection found for athlete:', event.owner_id);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const app = await getAppForConnection(supabase, connection);
      if (!app.client_secret) throw new Error(`Strava app ${app.client_id} missing client_secret`);

      if (event.aspect_type === 'delete') {
        await supabase
          .from('strava_activities')
          .delete()
          .eq('strava_id', event.object_id);
        await computeTrainingScore(supabase, connection.user_id);
      } else {
        const accessToken = await refreshTokenIfNeeded(
          connection, supabase, app.client_id, app.client_secret
        );
        await syncActivityById(supabase, accessToken, event.object_id, connection.user_id);
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

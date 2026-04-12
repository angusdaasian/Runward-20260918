import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// VDOT calculation (Daniel's Running Formula)
function percentVO2(minutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  );
}

function vo2Cost(velocity: number): number {
  return -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
}

function calculateVdot(distanceMeters: number, timeSeconds: number): number {
  const minutes = timeSeconds / 60;
  const velocity = distanceMeters / minutes;
  return vo2Cost(velocity) / percentVO2(minutes);
}

const runningSportTypes = new Set([
  "Run",
  "TrailRun",
  "VirtualRun",
  "Treadmill",
]);

async function computeTrainingScore(
  supabase: any,
  userId: string,
  env: string
) {
  // Fetch from both Strava and Apple Health
  const [stravaRes, ahRes] = await Promise.all([
    supabase
      .from("strava_activities")
      .select("moving_time, distance, sport_type, start_date")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("start_date", { ascending: false })
      .limit(50),
    supabase
      .from("apple_health_activities")
      .select("moving_time, distance, sport_type, start_date")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(50),
  ]);

  const all = [...(stravaRes.data || []), ...(ahRes.data || [])];
  all.sort(
    (a: any, b: any) =>
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  const vdotScores: number[] = [];
  for (const act of all) {
    if (
      runningSportTypes.has(act.sport_type) &&
      act.distance >= 400 &&
      act.moving_time >= 60
    ) {
      const vdot = calculateVdot(act.distance, act.moving_time);
      if (vdot >= 5 && vdot <= 100 && isFinite(vdot)) {
        vdotScores.push(vdot);
      }
    }
    if (vdotScores.length >= 20) break;
  }

  const avgScore =
    vdotScores.length > 0
      ? Math.round(
          (vdotScores.reduce((a, b) => a + b, 0) / vdotScores.length) * 10
        ) / 10
      : 0;

  await supabase
    .from("profiles")
    .update({ training_score: Math.round(avgScore) })
    .eq("user_id", userId);
  return Math.round(avgScore);
}

async function awardActivityXP(
  supabase: any,
  userId: string,
  distanceMeters: number,
  movingTimeSeconds: number,
  trainingScore: number
) {
  const km = distanceMeters / 1000;
  const minutes = movingTimeSeconds / 60;
  const xp =
    Math.round(km * 20) +
    Math.round(minutes * 10) +
    Math.round(trainingScore * 5);
  if (xp <= 0) return 0;

  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_xp, lifetime_xp")
    .eq("user_id", userId)
    .single();

  if (profile) {
    await supabase
      .from("profiles")
      .update({
        monthly_xp: (profile.monthly_xp || 0) + xp,
        lifetime_xp: (profile.lifetime_xp || 0) + xp,
      })
      .eq("user_id", userId);
    console.log(
      `Awarded ${xp} XP to user ${userId} (${km.toFixed(1)}km, ${minutes.toFixed(0)}min)`
    );
  }
  return xp;
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("activity_notifications")
      .eq("user_id", userId)
      .single();

    if (!profile?.activity_notifications) return;

    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!onesignalAppId || !onesignalApiKey) return;

    const km = (distanceMeters / 1000).toFixed(2);
    const totalMin = Math.floor(movingTimeSeconds / 60);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const secs = movingTimeSeconds % 60;
    const timeStr =
      hours > 0
        ? `${hours}h${String(mins).padStart(2, "0")}m${String(secs).padStart(2, "0")}s`
        : `${mins}m${String(secs).padStart(2, "0")}s`;

    const message = `You ran ${km}km in ${timeStr}. You earned ${xpGained} XP! Your Training Score: ${trainingScore}.`;

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${onesignalApiKey}`,
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

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { newActivities } = body;
    // newActivities: Array<{ distance: number, moving_time: number, sport_type: string }>

    if (!Array.isArray(newActivities) || newActivities.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No new activities" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine environment from strava connection or default
    const { data: stravaConn } = await supabase
      .from("strava_connections")
      .select("environment")
      .eq("user_id", user.id)
      .maybeSingle();
    const env = stravaConn?.environment || Deno.env.get("APP_ENVIRONMENT") || "dev";

    // 1) Compute training score (from both Strava + Apple Health)
    const trainingScore = await computeTrainingScore(supabase, user.id, env);

    // 2) Award XP and send notification for each new activity
    let totalXp = 0;
    for (const act of newActivities) {
      const xp = await awardActivityXP(
        supabase,
        user.id,
        act.distance || 0,
        act.moving_time || 0,
        trainingScore
      );
      totalXp += xp;

      // Send notification for each new running activity
      if (runningSportTypes.has(act.sport_type)) {
        await sendActivityNotification(
          supabase,
          user.id,
          act.distance || 0,
          act.moving_time || 0,
          xp,
          trainingScore
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        training_score: trainingScore,
        total_xp: totalXp,
        activities_processed: newActivities.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("apple-health-post-sync error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

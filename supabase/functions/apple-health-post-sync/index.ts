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

const RANK_TIERS = ["Bronze", "Silver", "Gold", "Diamond"];
const DIVISIONS = ["V", "IV", "III", "II", "I"];
const XP_PER_DIVISION = 2000;

function computeRankFromXP(monthlyXp: number) {
  const divisionIndex = Math.min(
    Math.floor(monthlyXp / XP_PER_DIVISION),
    RANK_TIERS.length * DIVISIONS.length - 1
  );
  const tierIndex = Math.min(Math.floor(divisionIndex / DIVISIONS.length), RANK_TIERS.length - 1);
  const divIndex = divisionIndex % DIVISIONS.length;
  return { tier: RANK_TIERS[tierIndex], division: DIVISIONS[divIndex] };
}

function isCurrentMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

const runningSportTypes = new Set([
  "Run",
  "TrailRun",
  "VirtualRun",
  "Treadmill",
  "Workout",
]);

async function computeTrainingScore(
  supabase: any,
  userId: string,
  source: "apple_health" | "strava" | "garmin"
) {
  let query;
  if (source === "apple_health") {
    query = supabase
      .from("apple_health_activities")
      .select("moving_time, distance, sport_type, start_date")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(50);
  } else if (source === "garmin") {
    query = supabase
      .from("garmin_activities")
      .select("duration_seconds, distance_meters, activity_type, start_time")
      .eq("user_id", userId)
      .order("start_time", { ascending: false })
      .limit(50);
  } else {
    const env = Deno.env.get("APP_ENVIRONMENT") || "dev";
    query = supabase
      .from("strava_activities")
      .select("moving_time, distance, sport_type, start_date")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("start_date", { ascending: false })
      .limit(50);
  }

  const { data } = await query;
  const all = (data || []).map((a: any) => ({
    moving_time: a.moving_time ?? a.duration_seconds ?? 0,
    distance: a.distance ?? a.distance_meters ?? 0,
    sport_type: a.sport_type ?? a.activity_type ?? "Run",
  }));

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

async function recalculateMonthlyXP(
  supabase: any,
  userId: string,
  trainingScore: number,
  source: "apple_health" | "strava" | "garmin"
) {
  // Get current month boundaries in UTC
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  // Only fetch from the connected source
  let query;
  if (source === "apple_health") {
    query = supabase
      .from("apple_health_activities")
      .select("distance, moving_time, sport_type")
      .eq("user_id", userId)
      .gte("start_date", monthStart)
      .lt("start_date", monthEnd);
  } else if (source === "garmin") {
    query = supabase
      .from("garmin_activities")
      .select("distance_meters, duration_seconds, activity_type")
      .eq("user_id", userId)
      .gte("start_time", monthStart)
      .lt("start_time", monthEnd);
  } else {
    const env = Deno.env.get("APP_ENVIRONMENT") || "dev";
    query = supabase
      .from("strava_activities")
      .select("distance, moving_time, sport_type")
      .eq("user_id", userId)
      .eq("environment", env)
      .gte("start_date", monthStart)
      .lt("start_date", monthEnd);
  }

  const { data } = await query;
  const allActivities = (data || []).map((a: any) => ({
    distance: a.distance ?? a.distance_meters ?? 0,
    moving_time: a.moving_time ?? a.duration_seconds ?? 0,
  }));

  let totalMonthlyXp = 0;
  for (const act of allActivities) {
    const km = (act.distance || 0) / 1000;
    const minutes = (act.moving_time || 0) / 60;
    const xp =
      Math.round(km * 20) +
      Math.round(minutes * 10) +
      Math.round(trainingScore * 5);
    if (xp > 0) totalMonthlyXp += xp;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_xp, lifetime_xp")
    .eq("user_id", userId)
    .single();

  if (profile) {
    const oldMonthlyXp = profile.monthly_xp || 0;
    const xpDelta = totalMonthlyXp - oldMonthlyXp;
    const newLifetimeXp = Math.max(0, (profile.lifetime_xp || 0) + xpDelta);
    const rank = computeRankFromXP(totalMonthlyXp);

    await supabase
      .from("profiles")
      .update({
        monthly_xp: totalMonthlyXp,
        lifetime_xp: newLifetimeXp,
        rank_tier: rank.tier,
        division: rank.division,
      })
      .eq("user_id", userId);

    console.log(
      `Recalculated monthly XP for ${userId}: ${oldMonthlyXp} → ${totalMonthlyXp} (${allActivities.length} activities) → ${rank.tier} ${rank.division}`
    );
  }

  return totalMonthlyXp;
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

    // This is the Apple Health post-sync — use apple_health as the single source
    const source = "apple_health" as const;

    // 1) Compute training score from Apple Health only
    const trainingScore = await computeTrainingScore(supabase, user.id, source);

    // 2) Recalculate monthly XP from Apple Health current-month activities only
    const totalXp = await recalculateMonthlyXP(supabase, user.id, trainingScore, source);

    // 3) Send notifications for new running activities
    for (const act of newActivities) {
      if (runningSportTypes.has(act.sport_type) && isCurrentMonth(act.start_date || "")) {
        const km = (act.distance || 0) / 1000;
        const minutes = (act.moving_time || 0) / 60;
        const xp = Math.round(km * 20) + Math.round(minutes * 10) + Math.round(trainingScore * 5);
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

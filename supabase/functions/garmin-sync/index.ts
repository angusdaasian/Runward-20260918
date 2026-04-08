import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DOMAIN = "garmin.com";
const IOS_USER_AGENT = "GCM-iOS-5.12.24";

interface GarminActivity {
  activityId: number;
  activityName: string;
  startTimeLocal: string;
  startTimeGMT: string;
  activityType: { typeKey: string; typeId: number };
  distance?: number;
  duration: number;
  elapsedDuration?: number;
  movingDuration?: number;
  averageHR?: number;
  maxHR?: number;
  calories?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  steps?: number;
  elevationGain?: number;
  elevationLoss?: number;
  averageRunningCadenceInStepsPerMinute?: number;
  maxRunningCadenceInStepsPerMinute?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  activityTrainingLoad?: number;
  avgStrideLength?: number;
  vO2MaxValue?: number;
  hasPolyline?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get stored Garmin connection
    const { data: connection, error: connErr } = await supabase
      .from("garmin_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connErr || !connection) {
      return new Response(JSON.stringify({ error: "Garmin not connected" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check token expiry
    if (new Date(connection.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Garmin token expired. Please reconnect." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 20;
    const start = body.start || 0;

    // Fetch activities from Garmin
    const activitiesUrl = `https://connectapi.${DOMAIN}/activitylist-service/activities/search/activities?limit=${limit}&start=${start}`;
    const activitiesResp = await fetch(activitiesUrl, {
      headers: {
        "User-Agent": IOS_USER_AGENT,
        Authorization: `Bearer ${connection.access_token}`,
      },
    });

    if (!activitiesResp.ok) {
      const errText = await activitiesResp.text();
      console.error("[garmin-sync] Garmin API error:", activitiesResp.status, errText);
      return new Response(JSON.stringify({ error: `Garmin API error: ${activitiesResp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const activities: GarminActivity[] = await activitiesResp.json();

    // Store activities in garmin_activities table
    if (activities.length > 0) {
      const rows = activities.map((a) => ({
        user_id: user.id,
        garmin_activity_id: a.activityId.toString(),
        activity_name: a.activityName || "",
        activity_type: a.activityType?.typeKey || "unknown",
        start_time: a.startTimeGMT || a.startTimeLocal,
        duration_seconds: Math.round(a.duration || 0),
        distance_meters: a.distance ? Math.round(a.distance * 100) / 100 : null,
        calories: a.calories || null,
        average_hr: a.averageHR || null,
        max_hr: a.maxHR || null,
        elevation_gain: a.elevationGain || null,
        average_speed: a.averageSpeed || null,
        avg_cadence: a.averageRunningCadenceInStepsPerMinute || null,
        aerobic_te: a.aerobicTrainingEffect || null,
        anaerobic_te: a.anaerobicTrainingEffect || null,
        training_load: a.activityTrainingLoad || null,
        vo2max: a.vO2MaxValue || null,
        has_gps: a.hasPolyline || false,
        raw_json: a,
      }));

      const { error: insertErr } = await supabase
        .from("garmin_activities")
        .upsert(rows, { onConflict: "user_id,garmin_activity_id" });

      if (insertErr) {
        console.error("[garmin-sync] DB insert error:", insertErr);
      }
    }

    // Update last sync time
    await supabase.from("garmin_connections").update({ updated_at: new Date().toISOString() }).eq("user_id", user.id);

    return new Response(
      JSON.stringify({
        success: true,
        count: activities.length,
        activities: activities.map((a) => ({
          id: a.activityId,
          name: a.activityName,
          type: a.activityType?.typeKey,
          date: a.startTimeLocal,
          duration: a.duration,
          distance: a.distance,
          avgHR: a.averageHR,
          calories: a.calories,
        })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[garmin-sync] Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

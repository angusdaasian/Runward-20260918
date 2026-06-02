const serve = (handler: (req: Request) => Response | Promise<Response>) => Deno.serve(handler);
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAppForConnection } from "../_shared/strava-apps.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// VDOT calculation (Daniel's Running Formula)
function percentVO2(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}

function vo2Cost(velocity: number): number {
  return -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
}

function calculateVdot(distanceMeters: number, timeSeconds: number): number {
  const minutes = timeSeconds / 60;
  const velocity = distanceMeters / minutes;
  const vo2 = vo2Cost(velocity);
  const pct = percentVO2(minutes);
  return vo2 / pct;
}

async function refreshTokenIfNeeded(connection: any, supabase: any, clientId: string, clientSecret: string) {
  const now = Math.floor(Date.now() / 1000);
  if (connection.expires_at > now + 60) {
    return connection.access_token;
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  await supabase
    .from("strava_connections")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", connection.user_id);

  return data.access_token;
}

const runningSportTypes = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: connection, error: connError } = await supabase
      .from("strava_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: "No Strava connection found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const app = await getAppForConnection(supabase, connection);
    if (!app.client_secret) throw new Error(`Strava app ${app.client_id} missing client_secret`);

    const accessToken = await refreshTokenIfNeeded(connection, supabase, app.client_id, app.client_secret);

    const activitiesRes = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!activitiesRes.ok) {
      throw new Error(`Strava API error [${activitiesRes.status}]: ${await activitiesRes.text()}`);
    }

    const activities = await activitiesRes.json();

    for (const act of activities) {
      await supabase.from("strava_activities").upsert(
        {
          user_id: user.id,
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

    const [stravaRecent, ahRecent] = await Promise.all([
      supabase
        .from("strava_activities")
        .select("moving_time, distance, sport_type, start_date")
        .eq("user_id", user.id)
        .order("start_date", { ascending: false })
        .limit(50),
      supabase
        .from("apple_health_activities")
        .select("moving_time, distance, sport_type, start_date")
        .eq("user_id", user.id)
        .order("start_date", { ascending: false })
        .limit(50),
    ]);

    const allRecent = [...(stravaRecent.data || []), ...(ahRecent.data || [])];
    allRecent.sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

    if (allRecent.length > 0) {
      const vdotScores: number[] = [];
      for (const act of allRecent) {
        if (runningSportTypes.has(act.sport_type) && act.distance >= 400 && act.moving_time >= 60) {
          const vdot = calculateVdot(act.distance, act.moving_time);
          if (vdot >= 5 && vdot <= 100 && isFinite(vdot)) {
            vdotScores.push(vdot);
          }
        }
        if (vdotScores.length >= 20) break;
      }

      const avgScore =
        vdotScores.length > 0 ? Math.round((vdotScores.reduce((a, b) => a + b, 0) / vdotScores.length) * 10) / 10 : 0;

      await supabase
        .from("profiles")
        .update({ training_score: Math.round(avgScore) })
        .eq("user_id", user.id);
    }

    return new Response(JSON.stringify({ success: true, count: activities.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("strava-sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

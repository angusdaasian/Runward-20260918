import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function percentVO2(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
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
  const divisionIndex = Math.min(Math.floor(monthlyXp / XP_PER_DIVISION), RANK_TIERS.length * DIVISIONS.length - 1);
  const tierIndex = Math.min(Math.floor(divisionIndex / DIVISIONS.length), RANK_TIERS.length - 1);
  const divIndex = divisionIndex % DIVISIONS.length;
  return { tier: RANK_TIERS[tierIndex], division: DIVISIONS[divIndex] };
}

const runningSportTypes = new Set([
  "Run",
  "TrailRun",
  "VirtualRun",
  "Treadmill",
  "Workout",
  "running",
  "trail_running",
  "treadmill_running",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const GARMIN_RAILWAY_URL = Deno.env.get("GARMIN_RAILWAY_URL");

    if (!GARMIN_RAILWAY_URL) {
      return new Response(JSON.stringify({ error: "Garmin service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const { action } = body;

    // ── LOGIN ──
    // Calls Railway /garmin-login → receives session_token.
    // We store ONLY the session_token (in access_token col) — never email/password.
    if (action === "login") {
      const { email, password } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: stravaConn } = await supabase
        .from("strava_connections")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (stravaConn) {
        return new Response(JSON.stringify({ error: "Please disconnect Strava before connecting Garmin" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const loginRes = await fetch(`${GARMIN_RAILWAY_URL}/garmin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!loginRes.ok) {
        const errData = await loginRes.json().catch(() => ({}));
        console.error("Garmin login failed:", errData);
        return new Response(JSON.stringify({ error: errData.detail || "Garmin authentication failed" }), {
          status: loginRes.status === 429 ? 429 : 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const loginData = await loginRes.json();
      const sessionToken: string = loginData.session_token;
      // Default to 365-day expiry if Railway doesn't return one
      const expiresAt: string = loginData.expires_at || new Date(Date.now() + 365 * 86400000).toISOString();
      const displayName: string = loginData.display_name || email;

      if (!sessionToken) {
        return new Response(JSON.stringify({ error: "No session token returned by Garmin service" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("garmin_connections").upsert(
        {
          user_id: user.id,
          access_token: sessionToken, // session token (NOT email)
          refresh_token: null, // password no longer stored
          expires_at: expiresAt,
          garmin_display_name: displayName,
        },
        { onConflict: "user_id" },
      );

      return new Response(JSON.stringify({ success: true, display_name: displayName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper: call Railway with Bearer session token
    async function callRailway(path: string, sessionToken: string, payload: any) {
      return await fetch(`${GARMIN_RAILWAY_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(payload),
      });
    }

    // ── SYNC ──
    if (action === "sync") {
      const { data: conn } = await supabase
        .from("garmin_connections")
        .select("access_token, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!conn || !conn.access_token) {
        return new Response(JSON.stringify({ error: "No Garmin connection found. Please reconnect." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check session expiry
      if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Garmin session expired. Please reconnect." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sessionToken = conn.access_token;

      // ── Phase 1: Fetch basic activity list ──
      const actRes = await callRailway("/garmin-activities", sessionToken, {
        days: body.days || 30,
        detail_limit: 0,
      });

      if (!actRes.ok) {
        const errData = await actRes.json().catch(() => ({}));
        console.error("Garmin activity fetch failed:", errData);
        // 401 from Railway = invalid/expired session
        if (actRes.status === 401) {
          return new Response(JSON.stringify({ error: "Garmin session expired. Please reconnect." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: errData.detail || "Failed to fetch Garmin activities" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const activities = await actRes.json();
      if (!Array.isArray(activities) || activities.length === 0) {
        return new Response(JSON.stringify({ success: true, synced: 0, details_fetched: 0, training_score: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Garmin returns local time labelled as UTC; subtract 8h for HKT.
      function adjustGarminTime(dateStr: string | undefined | null): string | null {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        d.setUTCHours(d.getUTCHours() - 8);
        return d.toISOString();
      }

      // Build candidate rows from Garmin response
      const candidateRows = activities.map((a: any) => ({
        user_id: user.id,
        garmin_activity_id: String(a.garmin_activity_id ?? a.activity_id ?? crypto.randomUUID()),
        activity_name: a.name ?? a.activity_name ?? "Garmin Activity",
        activity_type: a.sport_type ?? a.activity_type ?? "Run",
        start_time: adjustGarminTime(a.start_date ?? a.start_time),
        duration_seconds: a.moving_time ?? a.duration_seconds ?? 0,
        distance_meters: a.distance ?? a.distance_meters ?? 0,
        calories: a.calories ?? null,
        average_hr: a.average_heartrate ?? a.average_hr ?? null,
        max_hr: a.max_heartrate ?? a.max_hr ?? null,
        elevation_gain: a.total_elevation_gain ?? a.elevation_gain ?? null,
        average_speed: a.average_speed ?? null,
        average_pace: a.average_pace ?? null,
        avg_cadence: a.avg_cadence ?? null,
        aerobic_te: a.aerobic_te ?? null,
        anaerobic_te: a.anaerobic_te ?? null,
        vo2max: a.vo2max ?? null,
        training_load: a.training_load ?? null,
        has_gps: a.has_gps ?? false,
        raw_json: a,
      }));

      // Find which activity IDs already exist for this user — only insert new ones
      const candidateIds = candidateRows.map((r) => r.garmin_activity_id);
      const { data: existing } = await supabase
        .from("garmin_activities")
        .select("garmin_activity_id")
        .eq("user_id", user.id)
        .in("garmin_activity_id", candidateIds);

      const existingIds = new Set((existing || []).map((e: any) => e.garmin_activity_id));
      const newRows = candidateRows.filter((r) => !existingIds.has(r.garmin_activity_id));

      if (newRows.length > 0) {
        const { error: insertError } = await supabase.from("garmin_activities").insert(newRows);
        if (insertError) {
          console.error("Garmin insert error:", insertError);
        }
      }

      // Helper: fetch details for a list of activity IDs in batches of 5
      let detailsFetched = 0;
      async function fetchDetailsForIds(ids: string[]): Promise<boolean> {
        const BATCH_SIZE = 5;
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const batchIds = ids.slice(i, i + BATCH_SIZE);
          try {
            const detailRes = await callRailway("/garmin-activity-details", sessionToken, {
              activity_ids: batchIds.join(","),
            });

            if (!detailRes.ok) {
              console.error("Detail fetch failed batch", i, ":", await detailRes.text());
              return false;
            }

            const detailsData = await detailRes.json();
            for (const actId of batchIds) {
              const detail = detailsData[actId];
              if (detail) {
                await supabase
                  .from("garmin_activities")
                  .update({
                    laps: Array.isArray(detail.laps) ? detail.laps : [],
                    weather: detail.weather ?? null,
                    summary_polyline: detail.map_polyline ?? null,
                    has_details: true,
                  })
                  .eq("user_id", user.id)
                  .eq("garmin_activity_id", actId);
                detailsFetched++;
              } else {
                await supabase
                  .from("garmin_activities")
                  .update({ has_details: true })
                  .eq("user_id", user.id)
                  .eq("garmin_activity_id", actId);
              }
            }
          } catch (detailErr) {
            console.error("Detail fetch error batch", i, ":", detailErr);
            return false;
          }
        }
        return true;
      }

      // ── Phase 2a: Fetch details for newly inserted activities ──
      const newActivityIds = newRows.map((r) => r.garmin_activity_id);
      if (newActivityIds.length > 0) {
        await fetchDetailsForIds(newActivityIds);
      }

      // ── Phase 2b: Backfill details for older activities still missing them ──
      // Cap at 15 per sync so we don't hammer Garmin or time out
      const BACKFILL_LIMIT = 15;
      const { data: missingDetails } = await supabase
        .from("garmin_activities")
        .select("garmin_activity_id")
        .eq("user_id", user.id)
        .eq("has_details", false)
        .order("start_time", { ascending: false })
        .limit(BACKFILL_LIMIT);

      if (missingDetails && missingDetails.length > 0) {
        const backfillIds = missingDetails.map((m: any) => m.garmin_activity_id);
        await fetchDetailsForIds(backfillIds);
      }

      // Compute training score
      const { data: recentActivities } = await supabase
        .from("garmin_activities")
        .select("duration_seconds, distance_meters, activity_type, start_time")
        .eq("user_id", user.id)
        .order("start_time", { ascending: false })
        .limit(50);

      const vdotScores: number[] = [];
      for (const act of recentActivities || []) {
        const st = act.activity_type || "";
        if (runningSportTypes.has(st) && (act.distance_meters || 0) >= 400 && (act.duration_seconds || 0) >= 60) {
          const vdot = calculateVdot(act.distance_meters || 0, act.duration_seconds || 0);
          if (vdot >= 5 && vdot <= 100 && isFinite(vdot)) vdotScores.push(vdot);
        }
        if (vdotScores.length >= 20) break;
      }

      const trainingScore =
        vdotScores.length > 0 ? Math.round(vdotScores.reduce((a, b) => a + b, 0) / vdotScores.length) : 0;

      await supabase.from("profiles").update({ training_score: trainingScore }).eq("user_id", user.id);

      // Recalculate monthly XP
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

      const { data: monthActivities } = await supabase
        .from("garmin_activities")
        .select("distance_meters, duration_seconds")
        .eq("user_id", user.id)
        .gte("start_time", monthStart)
        .lt("start_time", monthEnd);

      let totalMonthlyXp = 0;
      for (const act of monthActivities || []) {
        const km = (act.distance_meters || 0) / 1000;
        const minutes = (act.duration_seconds || 0) / 60;
        const xp = Math.round(km * 20) + Math.round(minutes * 10) + Math.round(trainingScore * 5);
        if (xp > 0) totalMonthlyXp += xp;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("monthly_xp, lifetime_xp")
        .eq("user_id", user.id)
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
          .eq("user_id", user.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          synced: newRows.length,
          details_fetched: detailsFetched,
          details_remaining: 0,
          training_score: trainingScore,
          total_xp: totalMonthlyXp,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── DISCONNECT ──
    if (action === "disconnect") {
      // Tell Railway to revoke the session
      const { data: conn } = await supabase
        .from("garmin_connections")
        .select("access_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (conn?.access_token) {
        try {
          await fetch(`${GARMIN_RAILWAY_URL}/garmin-logout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${conn.access_token}` },
          });
        } catch (e) {
          console.error("Garmin logout error (non-fatal):", e);
        }
      }

      await Promise.all([
        supabase.from("garmin_connections").delete().eq("user_id", user.id),
        supabase.from("garmin_activities").delete().eq("user_id", user.id),
      ]);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("garmin-sync error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─────────────────────────────────────────────────────────
// AES-GCM encryption helpers (app-level encryption for Garmin creds)
// Storage format: "v1:<base64(iv)>:<base64(ciphertext+tag)>"
// Key: GARMIN_ENC_KEY env var, base64-encoded 32 bytes (256-bit)
// ─────────────────────────────────────────────────────────
let _cachedKey: CryptoKey | null = null;
async function getEncKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  const raw = Deno.env.get("GARMIN_ENC_KEY");
  if (!raw) throw new Error("GARMIN_ENC_KEY not configured");
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error("GARMIN_ENC_KEY must be base64 of 32 bytes");
  }
  _cachedKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return _cachedKey;
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function encryptString(plaintext: string): Promise<string> {
  const key = await getEncKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return `v1:${b64encode(iv)}:${b64encode(ct)}`;
}

async function decryptString(stored: string): Promise<string> {
  // Backwards compat: legacy plaintext rows have no "v1:" prefix
  if (!stored.startsWith("v1:")) return stored;
  const [, ivB64, ctB64] = stored.split(":");
  if (!ivB64 || !ctB64) throw new Error("Malformed encrypted value");
  const key = await getEncKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) },
    key,
    b64decode(ctB64),
  );
  return new TextDecoder().decode(pt);
}

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

function isCurrentMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

const runningSportTypes = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill", "Workout", "running", "trail_running", "treadmill_running"]);

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
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ── LOGIN ──
    if (action === "login") {
      const { email, password } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [stravaConn, ahConn] = await Promise.all([
        supabase.from("strava_connections").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("apple_health_connections").select("id").eq("user_id", user.id).maybeSingle(),
      ]);
      if (stravaConn.data || ahConn.data) {
        return new Response(JSON.stringify({ error: "Please disconnect the current app before connecting a new one" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const loginRes = await fetch(`${GARMIN_RAILWAY_URL}/garmin-activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, days: 1 }),
      });

      if (!loginRes.ok) {
        const errData = await loginRes.json().catch(() => ({}));
        console.error("Garmin login failed:", errData);
        return new Response(JSON.stringify({ error: errData.detail || "Garmin authentication failed" }), {
          status: loginRes.status === 429 ? 429 : 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await loginRes.json();

      // Encrypt credentials before storing
      const encEmail = await encryptString(email);
      const encPassword = await encryptString(password);

      await supabase.from("garmin_connections").upsert({
        user_id: user.id,
        access_token: encEmail,
        refresh_token: encPassword,
        expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
        garmin_display_name: null,
      }, { onConflict: "user_id" });

      return new Response(JSON.stringify({ success: true, display_name: email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SYNC ──
    if (action === "sync") {
      const { data: conn } = await supabase
        .from("garmin_connections")
        .select("access_token, refresh_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!conn) {
        return new Response(JSON.stringify({ error: "No Garmin connection found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Decrypt credentials (handles both v1 ciphertext and legacy plaintext)
      let garminEmail: string;
      let garminPassword: string;
      try {
        garminEmail = await decryptString(conn.access_token);
        garminPassword = conn.refresh_token ? await decryptString(conn.refresh_token) : "";
      } catch (decErr) {
        console.error("Credential decryption failed:", decErr);
        return new Response(JSON.stringify({ error: "Stored credentials are unreadable. Please reconnect Garmin." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Lazy migration: if either field was legacy plaintext, re-store encrypted
      const wasPlaintext =
        !conn.access_token.startsWith("v1:") ||
        (conn.refresh_token && !conn.refresh_token.startsWith("v1:"));
      if (wasPlaintext) {
        try {
          const encEmail = await encryptString(garminEmail);
          const encPassword = await encryptString(garminPassword);
          await supabase
            .from("garmin_connections")
            .update({ access_token: encEmail, refresh_token: encPassword })
            .eq("user_id", user.id);
        } catch (migErr) {
          console.error("Lazy credential migration failed:", migErr);
        }
      }

      // ── Phase 1: Fetch basic activity list (no detail_limit) ──
      const actRes = await fetch(`${GARMIN_RAILWAY_URL}/garmin-activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: garminEmail,
          password: garminPassword || "",
          days: body.days || 30,
          detail_limit: 0,
        }),
      });

      if (!actRes.ok) {
        const errData = await actRes.json().catch(() => ({}));
        console.error("Garmin activity fetch failed:", errData);
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

      // Upsert basic activities (has_details stays false for new ones)
      // Garmin API returns times in local time (HKT UTC+8) but labels them as UTC,
      // so we subtract 8 hours to get the real UTC time.
      function adjustGarminTime(dateStr: string | undefined | null): string | null {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        d.setUTCHours(d.getUTCHours() - 8);
        return d.toISOString();
      }

      const rows = activities.map((a: any) => ({
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

      const { error: upsertError } = await supabase
        .from("garmin_activities")
        .upsert(rows, { onConflict: "garmin_activity_id,user_id", ignoreDuplicates: false });

      if (upsertError) {
        console.error("Garmin upsert error:", upsertError);
      }

      // ── Phase 2: Loop through all missing details (up to 3 batches of 5) ──
      let detailsFetched = 0;
      const MAX_BATCHES = 3;

      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const { data: missingDetails } = await supabase
          .from("garmin_activities")
          .select("id, garmin_activity_id")
          .eq("user_id", user.id)
          .eq("has_details", false)
          .order("start_time", { ascending: false })
          .limit(5);

        if (!missingDetails || missingDetails.length === 0) break;

        const activityIds = missingDetails.map((a) => a.garmin_activity_id).join(",");
        try {
          const detailRes = await fetch(`${GARMIN_RAILWAY_URL}/garmin-activity-details`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: garminEmail,
              password: garminPassword || "",
              activity_ids: activityIds,
            }),
          });

          if (detailRes.ok) {
            const detailsData = await detailRes.json();
            for (const item of missingDetails) {
              const detail = detailsData[item.garmin_activity_id];
              if (detail) {
                await supabase
                  .from("garmin_activities")
                  .update({
                    laps: Array.isArray(detail.laps) ? detail.laps : [],
                    weather: detail.weather ?? null,
                    summary_polyline: detail.map_polyline ?? null,
                    has_details: true,
                  })
                  .eq("id", item.id);
                detailsFetched++;
              } else {
                await supabase
                  .from("garmin_activities")
                  .update({ has_details: true })
                  .eq("id", item.id);
              }
            }
          } else {
            console.error("Detail fetch failed batch", batch, ":", await detailRes.text());
            break; // stop on error (likely rate limit)
          }
        } catch (detailErr) {
          console.error("Detail fetch error batch", batch, ":", detailErr);
          break;
        }
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

      const trainingScore = vdotScores.length > 0
        ? Math.round(vdotScores.reduce((a, b) => a + b, 0) / vdotScores.length)
        : 0;

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

        await supabase.from("profiles").update({
          monthly_xp: totalMonthlyXp,
          lifetime_xp: newLifetimeXp,
          rank_tier: rank.tier,
          division: rank.division,
        }).eq("user_id", user.id);
      }

      return new Response(JSON.stringify({
        success: true,
        synced: rows.length,
        details_fetched: detailsFetched,
        details_remaining: 0,
        training_score: trainingScore,
        total_xp: totalMonthlyXp,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DISCONNECT ──
    if (action === "disconnect") {
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

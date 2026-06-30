// Admin-only: export all 2026 running activities into a Llama 3.1 chat-formatted JSONL
// training dataset, upload it to GCS, and return the gs:// URI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { uploadToGcs, getVertexAccessToken } from "../_shared/vertex-auth.ts";

const TRAINING_SA = "GOOGLE_VERTEX_TRAINING_SA_JSON";

interface Profile {
  user_id: string;
  age: number | null;
  sex: string | null;
  runs_per_week: number | null;
  max_heartrate: number | null;
  resting_heartrate: number | null;
}

interface NormalizedActivity {
  user_id: string;
  source: string;
  start_date: string;
  sport_type: string;
  distance_meters: number;
  moving_seconds: number;
  avg_pace_min_per_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_meters: number | null;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function normalizeActivities(rows: any[], source: string, dateCol: string): NormalizedActivity[] {
  return rows.map((r) => {
    const distance = Number(r.distance ?? r.distance_meters ?? 0);
    const movingSeconds = Number(r.moving_time ?? r.duration_seconds ?? r.elapsed_time ?? 0);
    const avgSpeed = Number(r.average_speed ?? 0);
    const avgPace = avgSpeed > 0 ? (1000 / avgSpeed) / 60 : null;
    const elevation = Number(r.total_elevation_gain ?? r.elevation_gain ?? 0) || null;
    return {
      user_id: r.user_id,
      source,
      start_date: r[dateCol],
      sport_type: String(r.sport_type || r.activity_type || r.name || "Run").trim(),
      distance_meters: distance,
      moving_seconds: movingSeconds,
      avg_pace_min_per_km: avgPace,
      avg_hr: r.average_heartrate != null ? Number(r.average_heartrate) : r.average_hr != null ? Number(r.average_hr) : null,
      max_hr: r.max_heartrate != null ? Number(r.max_heartrate) : r.max_hr != null ? Number(r.max_hr) : null,
      elevation_meters: elevation,
    };
  });
}

function hrZone(maxHr: number | null, avgHr: number | null): string | null {
  if (!avgHr || !maxHr || maxHr <= 0) return null;
  const pct = avgHr / maxHr;
  if (pct < 0.6) return "Recovery (Z1)";
  if (pct < 0.7) return "Aerobic base (Z2)";
  if (pct < 0.8) return "Tempo (Z3)";
  if (pct < 0.9) return "Threshold (Z4)";
  return "VO2max/Neuromuscular (Z5)";
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.floor((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function buildAssessment(row: NormalizedActivity, profile: Profile): string {
  const distanceKm = row.distance_meters / 1000;
  const duration = formatDuration(row.moving_seconds);
  const pace = row.avg_pace_min_per_km ? formatPace(row.avg_pace_min_per_km) : "unknown pace";
  const zone = hrZone(profile.max_heartrate ?? row.max_hr, row.avg_hr);
  const volume = distanceKm < 5 ? "short" : distanceKm < 10 ? "medium" : distanceKm < 21.1 ? "long" : "very long";
  const ageNote = profile.age ? `for a ${profile.age}-year-old ${profile.sex || "runner"}` : "for this runner";

  let raceEstimate = "";
  if (row.avg_pace_min_per_km && row.distance_meters >= 3000) {
    const km = distanceKm;
    // Very crude race estimate: assume they can hold ~5% faster for 5K, 10% for 10K, 15% for HM
    const p = row.avg_pace_min_per_km;
    if (km >= 5) {
      const est5 = formatPace(p * 0.95);
      raceEstimate += ` Estimated 5K time: ~${formatDuration((p * 0.95 * 5) * 60)}. Current 5K pace ~${est5}.`;
    }
    if (km >= 10) {
      const est10 = formatPace(p * 0.92);
      raceEstimate += ` Estimated 10K time: ~${formatDuration((p * 0.92 * 10) * 60)}. Current 10K pace ~${est10}.`;
    }
    if (km >= 21.1) {
      const estHM = formatPace(p * 0.88);
      raceEstimate += ` Estimated half-marathon time: ~${formatDuration((p * 0.88 * 21.1) * 60)}. Current HM pace ~${estHM}.`;
    }
  }

  return `This is a ${volume} ${zone ? zone.toLowerCase() : "aerobic"} run ${ageNote}. Distance: ${distanceKm.toFixed(2)}km in ${duration} at ${pace}, avg HR ${row.avg_hr ?? "unknown"}${row.elevation_meters ? `, elevation gain ${row.elevation_meters.toFixed(0)}m` : ""}. The effort looks sustainable and aligned with base building.${raceEstimate}`;
}

function buildProfileSummary(p: Profile): string {
  const parts = [];
  if (p.age) parts.push(`age ${p.age}`);
  if (p.sex) parts.push(`sex ${p.sex}`);
  if (p.runs_per_week) parts.push(`runs per week ${p.runs_per_week}`);
  if (p.max_heartrate) parts.push(`max HR ${p.max_heartrate}`);
  if (p.resting_heartrate) parts.push(`resting HR ${p.resting_heartrate}`);
  return parts.length ? parts.join(", ") : "runner profile not fully known";
}

function buildActivitySummary(row: NormalizedActivity): string {
  const parts = [
    `${row.sport_type} on ${new Date(row.start_date).toLocaleDateString()}`,
    `${(row.distance_meters / 1000).toFixed(2)}km`,
    `duration ${formatDuration(row.moving_seconds)}`,
  ];
  if (row.avg_pace_min_per_km) parts.push(`avg pace ${formatPace(row.avg_pace_min_per_km)}`);
  if (row.avg_hr) parts.push(`avg HR ${row.avg_hr}`);
  if (row.max_hr) parts.push(`max HR ${row.max_hr}`);
  if (row.elevation_meters) parts.push(`elevation gain ${row.elevation_meters.toFixed(0)}m`);
  return parts.join(", ");
}

function buildExample(row: NormalizedActivity, profile: Profile): string {
  const system =
    "You are a running performance analyst. Given a runner profile and a recent activity, assess the activity, estimate intensity zones, and predict short race times if the data supports it.";
  const user = `Runner: ${buildProfileSummary(profile)}. Activity: ${buildActivitySummary(row)}. What does this activity say about their current fitness?`;
  const model = buildAssessment(row, profile);
  return JSON.stringify({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "model", content: model },
    ],
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!auth) return json(401, { error: "unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${auth}` } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return json(403, { error: "forbidden" });

    // Verify training service account is configured before doing heavy work.
    try {
      await getVertexAccessToken(TRAINING_SA);
    } catch (e) {
      return json(400, { error: `Training service account not configured: ${(e as Error).message}` });
    }

    const bucket = Deno.env.get("GOOGLE_VERTEX_TRAINING_BUCKET")!;
    const location = Deno.env.get("GOOGLE_VERTEX_TRAINING_LOCATION") || "us-central1";

    const year = "2026";
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31T23:59:59Z`;

    const sources: { table: string; dateCol: string; source: string }[] = [
      { table: "strava_activities", dateCol: "start_date", source: "strava" },
      { table: "garmin_activities", dateCol: "start_time", source: "garmin" },
      { table: "intervals_activities", dateCol: "start_date", source: "intervals" },
      { table: "polar_activities", dateCol: "start_date", source: "polar" },
      { table: "suunto_activities", dateCol: "start_date", source: "suunto" },
      { table: "terra_activities", dateCol: "start_time", source: "terra" },
      { table: "apple_health_activities", dateCol: "start_date", source: "apple_health" },
    ];

    let all: NormalizedActivity[] = [];
    for (const s of sources) {
      const { data, error } = await admin
        .from(s.table)
        .select(`user_id, ${s.dateCol}, sport_type, activity_type, name, distance, distance_meters, moving_time, duration_seconds, elapsed_time, average_speed, total_elevation_gain, elevation_gain, average_heartrate, average_hr, max_heartrate, max_hr`)
        .gte(s.dateCol, startDate)
        .lte(s.dateCol, endDate);
      if (error) {
        console.error(`[export-coach-training-data] ${s.table} error:`, error);
        continue;
      }
      const normalized = normalizeActivities(data || [], s.source, s.dateCol);
      all = all.concat(normalized);
    }

    // Filter to running-like activities.
    const runningTypes = new Set(["run", "running", "trail running", "trail_run", "track", "treadmill", "outdoor run", "indoor run", "jogging"]);
    all = all.filter((a) => {
      const type = a.sport_type.toLowerCase();
      return runningTypes.has(type) || type.includes("run") || a.distance_meters >= 1000;
    });

    // Fetch profiles for users in the dataset.
    const userIds = [...new Set(all.map((a) => a.user_id))];
    const profileMap = new Map<string, Profile>();
    const BATCH = 1000;
    for (let i = 0; i < userIds.length; i += BATCH) {
      const batch = userIds.slice(i, i + BATCH);
      const { data, error } = await admin
        .from("profiles")
        .select("user_id, age, sex, runs_per_week, max_heartrate, resting_heartrate")
        .in("user_id", batch);
      if (error) {
        console.error("[export-coach-training-data] profiles error:", error);
        continue;
      }
      (data || []).forEach((p) => profileMap.set(p.user_id, p));
    }

    // Shuffle to break source ordering.
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }

    const lines: string[] = [];
    for (const row of all) {
      const profile = profileMap.get(row.user_id) || {
        user_id: row.user_id,
        age: null,
        sex: null,
        runs_per_week: null,
        max_heartrate: null,
        resting_heartrate: null,
      };
      lines.push(buildExample(row, profile));
    }

    const content = new TextEncoder().encode(lines.join("\n"));
    const objectName = `llama-training/runner-coach-${year}-${Date.now()}.jsonl`;
    const { uri, size } = await uploadToGcs(bucket, objectName, content, "application/jsonl", TRAINING_SA);

    return json(200, {
      success: true,
      year,
      activities: all.length,
      users: userIds.length,
      gcs_uri: uri,
      size_bytes: size,
      location,
      bucket,
    });
  } catch (e) {
    console.error("[export-coach-training-data]", e);
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});

import { supabase } from "@/integrations/supabase/client";

const TIME_WINDOW_MS = 10 * 60 * 1000; // ±10 minutes
const DISTANCE_TOLERANCE = 0.05; // ±5%
const MIN_DISTANCE_TOLERANCE_M = 100; // at least 100m tolerance

/**
 * Check if a similar activity already exists for the user across all sources
 * (strava, apple_health, garmin/coros). Considers it a duplicate if there's
 * another activity within ±10 minutes of start time AND within ±5% distance
 * (or 100m, whichever is larger).
 */
export async function findSimilarActivity(params: {
  userId: string;
  startDate: string; // ISO
  distanceMeters: number;
}): Promise<{ source: string; name: string | null } | null> {
  const startMs = new Date(params.startDate).getTime();
  if (!isFinite(startMs)) return null;

  const fromIso = new Date(startMs - TIME_WINDOW_MS).toISOString();
  const toIso = new Date(startMs + TIME_WINDOW_MS).toISOString();
  const distTolerance = Math.max(
    params.distanceMeters * DISTANCE_TOLERANCE,
    MIN_DISTANCE_TOLERANCE_M,
  );
  const minDist = params.distanceMeters - distTolerance;
  const maxDist = params.distanceMeters + distTolerance;

  // Run all three queries in parallel
  const [stravaRes, ahRes, garminRes] = await Promise.all([
    supabase
      .from("strava_activities")
      .select("name, distance, start_date")
      .eq("user_id", params.userId)
      .gte("start_date", fromIso)
      .lte("start_date", toIso)
      .gte("distance", minDist)
      .lte("distance", maxDist)
      .limit(1),
    supabase
      .from("apple_health_activities")
      .select("name, distance, start_date")
      .eq("user_id", params.userId)
      .gte("start_date", fromIso)
      .lte("start_date", toIso)
      .gte("distance", minDist)
      .lte("distance", maxDist)
      .limit(1),
    supabase
      .from("garmin_activities")
      .select("activity_name, distance_meters, start_time, garmin_activity_id")
      .eq("user_id", params.userId)
      .gte("start_time", fromIso)
      .lte("start_time", toIso)
      .gte("distance_meters", minDist)
      .lte("distance_meters", maxDist)
      .limit(1),
  ]);

  if (stravaRes.data && stravaRes.data[0]) {
    return { source: "Strava", name: stravaRes.data[0].name };
  }
  if (ahRes.data && ahRes.data[0]) {
    return { source: "Apple Health", name: ahRes.data[0].name };
  }
  if (garminRes.data && garminRes.data[0]) {
    const row: any = garminRes.data[0];
    const isCoros = typeof row.garmin_activity_id === "string"
      && row.garmin_activity_id.startsWith("coros-");
    return { source: isCoros ? "COROS" : "Garmin", name: row.activity_name };
  }
  return null;
}

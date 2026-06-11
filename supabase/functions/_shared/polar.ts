// Shared helpers for Polar AccessLink API integration.
// OAuth: https://flow.polar.com/oauth2/authorization
// Token: https://polarremote.com/v2/oauth2/token
// API base: https://www.polaraccesslink.com/v3

export const POLAR_OAUTH_BASE = "https://flow.polar.com/oauth2";
export const POLAR_TOKEN_URL = "https://polarremote.com/v2/oauth2/token";
export const POLAR_API_BASE = "https://www.polaraccesslink.com/v3";

const RUN_SPORTS = new Set([
  "RUNNING", "TREADMILL_RUNNING", "JOGGING", "ROAD_RUNNING", "TRAIL_RUNNING",
  "TRACK_AND_FIELD_RUNNING", "ULTRARUNNING_RUNNING", "VERTICAL_SPORTS_RUNNING",
]);
const CYCLE_SPORTS = new Set([
  "CYCLING", "ROAD_BIKING", "INDOOR_CYCLING", "MOUNTAIN_BIKING", "BMX",
  "CYCLO_CROSS", "TRACK_CYCLING", "GRAVEL_CYCLING",
]);
const SWIM_SPORTS = new Set(["SWIMMING", "OPEN_WATER_SWIMMING", "POOL_SWIMMING"]);
const WALK_SPORTS = new Set(["WALKING", "NORDIC_WALKING"]);
const HIKE_SPORTS = new Set(["HIKING", "TREKKING", "MOUNTAINEERING"]);

export function mapPolarSport(sport: string | null | undefined): string {
  if (!sport) return "Workout";
  const s = sport.toUpperCase();
  if (RUN_SPORTS.has(s) || s.includes("RUNNING")) return "Run";
  if (CYCLE_SPORTS.has(s) || s.includes("CYCLING") || s.includes("BIKING")) return "Ride";
  if (SWIM_SPORTS.has(s) || s.includes("SWIMMING")) return "Swim";
  if (WALK_SPORTS.has(s) || s.includes("WALKING")) return "Walk";
  if (HIKE_SPORTS.has(s) || s.includes("HIKING") || s.includes("TREKKING")) return "Hike";
  return "Workout";
}

// Parses ISO-8601 duration like "PT1H30M15.500S" -> seconds
export function parseIsoDurationSeconds(iso: string | null | undefined): number {
  if (!iso) return 0;
  const m = /P(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?)?/.exec(iso);
  if (!m) return 0;
  const d = parseFloat(m[1] ?? "0");
  const h = parseFloat(m[2] ?? "0");
  const min = parseFloat(m[3] ?? "0");
  const s = parseFloat(m[4] ?? "0");
  return Math.round(d * 86400 + h * 3600 + min * 60 + s);
}

export type PolarExercise = {
  id: string | number;
  "upload-time"?: string;
  "polar-user"?: string;
  "transaction-id"?: number;
  device?: string;
  "start-time"?: string;
  "start-time-utc-offset"?: number;
  duration?: string;
  distance?: number;
  "heart-rate"?: { average?: number; maximum?: number };
  "training-load"?: number;
  sport?: string;
  "has-route"?: boolean;
  "club-id"?: number;
  "club-name"?: string;
  "detailed-sport-info"?: string;
  calories?: number;
};

export function exerciseRow(userId: string, e: PolarExercise) {
  const startIso = e["start-time"]
    ? new Date(e["start-time"]).toISOString()
    : new Date().toISOString();
  return {
    user_id: userId,
    polar_exercise_id: String(e.id),
    upload_time: e["upload-time"] ? new Date(e["upload-time"]).toISOString() : null,
    start_date: startIso,
    duration: parseIsoDurationSeconds(e.duration),
    distance: e.distance ?? null,
    sport_type: mapPolarSport(e.sport),
    detailed_sport_type: e["detailed-sport-info"] ?? e.sport ?? null,
    calories: e.calories ?? null,
    average_heart_rate: e["heart-rate"]?.average ?? null,
    maximum_heart_rate: e["heart-rate"]?.maximum ?? null,
    training_load: e["training-load"] ?? null,
    has_route: !!e["has-route"],
    club_id: e["club-id"] ?? null,
    club_name: e["club-name"] ?? null,
    raw: e as any,
  };
}

import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAppEnvironment } from "@/lib/environment";
import { subscribePlanChanged } from "@/lib/planEvents";

export interface ActivityWeather {
  temp: number | null;
  apparent_temp: number | null;
  humidity: number | null;
  wind_speed: number | null;
  wind_direction: string | null;
  weather_type: string | null;
  condition: string | null;
}

export interface StravaActivity {
  id: string;
  strava_id: number;
  name: string;
  sport_type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  average_speed: number;
  max_speed: number;
  average_heartrate: number | null;
  max_heartrate: number | null;
  summary_polyline: string | null;
  source?: string;
  calories?: number | null;
  weather?: ActivityWeather | null;
  laps?: any[] | null;
  map_screenshot_url?: string | null;
  garmin_training_load?: number | null;
  hr_samples?: Array<{ t: number; bpm: number }> | null;
  distance_samples?: Array<{ t: number; d: number }> | null;
  elevation_samples?: Array<{ t: number; e: number }> | null;
  cadence_samples?: Array<{ t: number; rpm: number }> | null;
  avg_cadence?: number | null;
  provenance?: "strava" | "apple_health" | "garmin" | "terra";
}

export interface PlannedWorkout {
  date: string;
  type: string;
  distance_km: number | null;
  color: string;
  title?: string | null;
  description?: string | null;
  pace?: string | null;
  elevation_m?: number | null;
  eph?: number | null;
}

export interface UserRace {
  id: string;
  race_name: string;
  race_name_zh: string | null;
  race_date: string;
  city: string | null;
  country: string | null;
  category: string;
  priority: string;
  source: string;
  website_url: string | null;
  notes: string | null;
  finish_time_seconds: number | null;
  finish_time_source: string | null;
  finish_activity_id: string | null;
}

const appEnv = getAppEnvironment();

async function fetchActivities(userId: string, limit?: number): Promise<StravaActivity[]> {
  let q = supabase
    .from("strava_activities")
    .select("*")
    .eq("user_id", userId)
    .eq("environment", appEnv)
    .order("start_date", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return ((data as any[]) || []).map((a) => ({ ...a, source: "strava", provenance: "strava" as const }));
}

async function fetchAppleHealthActivities(userId: string, limit?: number): Promise<StravaActivity[]> {
  let q = supabase
    .from("apple_health_activities")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return ((data as any[]) || []).map((a) => ({
    ...a,
    strava_id: 0,
    summary_polyline: null,
    source: a.source || "Apple Health",
    calories: a.calories ?? null,
    provenance: "apple_health" as const,
  }));
}

async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("training_score, display_name, age, sex, avatar_url, max_heartrate, resting_heartrate, custom_hr_zones")
    .eq("user_id", userId)
    .single();
  return data as any;
}

async function fetchGarminActivities(userId: string, limit?: number): Promise<StravaActivity[]> {
  let q = supabase
    .from("garmin_activities")
    .select("*")
    .eq("user_id", userId)
    .order("start_time", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return ((data as any[]) || []).map((a) => {
    const isCoros = typeof a.garmin_activity_id === "string" && a.garmin_activity_id.startsWith("coros-");
    return {
      id: a.id,
      strava_id: 0,
      name: a.activity_name || (isCoros ? "COROS Activity" : "Garmin Activity"),
      sport_type: a.activity_type || "Run",
      distance: a.distance_meters || 0,
      moving_time: a.duration_seconds || 0,
      elapsed_time: a.duration_seconds || 0,
      total_elevation_gain: a.elevation_gain || 0,
      start_date: a.start_time,
      average_speed: (a.average_speed && a.average_speed > 0)
        ? a.average_speed
        : (a.distance_meters && a.duration_seconds && a.duration_seconds > 0)
          ? a.distance_meters / a.duration_seconds
          : 0,
      average_pace: a.average_pace || null,
      max_speed: 0,
      average_heartrate: a.average_hr || null,
      max_heartrate: a.max_hr || null,
      summary_polyline: a.summary_polyline ?? null,
      source: isCoros ? "COROS" : "Garmin",
      calories: a.calories ?? null,
      laps: a.laps || [],
      weather: a.weather ?? null,
      map_screenshot_url: a.raw_json?.map_screenshot_url ?? null,
      garmin_training_load: a.training_load ?? null,
      avg_cadence: a.avg_cadence ?? null,
      provenance: "garmin" as const,
    };
  });
}

// Terra activity_type numeric codes -> readable sport
// Reference: https://docs.tryterra.co/reference/health-and-fitness-api/data-models
// Verified against terra_activities table on 2026-05-06.
const TERRA_ACTIVITY_TYPE_MAP: Record<string, string> = {
  // Running family
  "8": "Run",        // outdoor running (incl. trail/track variants)
  "0": "Run",
  "16": "Ride",      // road cycling — was incorrectly Run
  "37": "Run",
  "44": "Run",
  "58": "Treadmill", // indoor / treadmill running
  "59": "Run",
  "63": "Run",
  "64": "Run",
  "8.0": "Run",
  // Cycling
  "1": "Ride",       // outdoor cycling
  "18": "Ride",      // indoor cycling
  "20": "Ride",
  "30": "Ride",
  // Swimming
  "32": "Swim",
  "83": "Swim",      // pool swim
  // Walking / hiking
  "7": "Walk",
  "10": "Other",     // observed: badminton (not Hike)
  "130": "Hike",     // mountain hike
  // Strength / other (explicitly non-cardio for analytics)
  "80": "Strength",
  "78": "Other",     // stair climber
  "122": "Other",    // mindfulness / breathing
  "123": "Cardio",   // generic cardio (not running)
  "35": "Other",
  "49": "Other",
  "84": "Other",
  "87": "Other",
  "100": "Other",
  "108": "Other",
};

// Normalize common readable variants to the canonical sport types
// the rest of the app (training load, pace, charts) recognises.
const TERRA_LABEL_NORMALISE: Record<string, string> = {
  running: "Run",
  run: "Run",
  trail_running: "TrailRun",
  trailrun: "TrailRun",
  treadmill_running: "Treadmill",
  treadmill: "Treadmill",
  cycling: "Ride",
  ride: "Ride",
  biking: "Ride",
  swimming: "Swim",
  swim: "Swim",
  walking: "Walk",
  walk: "Walk",
  hiking: "Hike",
  hike: "Hike",
};

function mapTerraSportType(rawType: any): string {
  if (rawType === null || rawType === undefined || rawType === "") return "Other";
  const key = String(rawType).trim();
  if (TERRA_ACTIVITY_TYPE_MAP[key]) return TERRA_ACTIVITY_TYPE_MAP[key];
  // Numeric but unmapped → Other (do NOT default to Run, that contaminates analytics)
  if (/^-?\d+(\.\d+)?$/.test(key)) return "Other";
  const normalised = TERRA_LABEL_NORMALISE[key.toLowerCase()];
  if (normalised) return normalised;
  // Pass through readable strings already in canonical form
  return key;
}

function mapTerraProviderLabel(provider: string): string {
  const p = (provider || "").toUpperCase();
  if (p === "GARMIN") return "Garmin";
  if (p === "COROS") return "COROS";
  if (p === "POLAR") return "Polar";
  if (p === "SUUNTO") return "Suunto";
  if (!provider) return "Garmin";
  return provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
}

async function fetchTerraActivities(userId: string, limit?: number): Promise<StravaActivity[]> {
  let q = supabase
    .from("terra_activities")
    .select("*")
    .eq("user_id", userId)
    .order("start_time", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return ((data as any[]) || []).map((a) => {
    const sourceLabel = mapTerraProviderLabel(a.provider);
    const sportType = mapTerraSportType(a.activity_type);
    const durationSeconds = a.duration_seconds && a.duration_seconds > 0
      ? a.duration_seconds
      : a.distance_meters && a.average_speed && a.average_speed > 0
        ? Math.round(a.distance_meters / a.average_speed)
        : 0;
    return {
      id: a.id,
      strava_id: 0,
      name: a.activity_name || `${sourceLabel} Activity`,
      sport_type: sportType,
      distance: a.distance_meters || 0,
      moving_time: durationSeconds,
      elapsed_time: durationSeconds,
      total_elevation_gain: a.elevation_gain || 0,
      start_date: a.start_time,
      average_speed: (a.average_speed && a.average_speed > 0)
        ? a.average_speed
        : (a.distance_meters && durationSeconds > 0)
          ? a.distance_meters / durationSeconds
          : 0,
      max_speed: 0,
      average_heartrate: a.average_hr || null,
      max_heartrate: a.max_hr || null,
      summary_polyline: a.summary_polyline ?? null,
      source: sourceLabel,
      calories: a.calories ?? null,
      laps: a.laps || [],
      hr_samples: a.hr_samples || null,
      distance_samples: a.distance_samples || null,
      elevation_samples: (a as any).elevation_samples || null,
      cadence_samples: (a as any).cadence_samples || null,
      avg_cadence: a.avg_cadence ?? null,
      garmin_training_load: a.training_load ?? null,
      provenance: "terra" as const,
    } as StravaActivity;
  });
}

async function fetchSuuntoActivities(userId: string, limit?: number): Promise<StravaActivity[]> {
  let q = supabase
    .from("suunto_activities")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return ((data as any[]) || []).map((a) => ({
    id: a.id,
    strava_id: 0,
    name: a.name || "Suunto Activity",
    sport_type: a.sport_type || "Run",
    distance: a.distance || 0,
    moving_time: a.moving_time || 0,
    elapsed_time: a.elapsed_time || a.moving_time || 0,
    total_elevation_gain: a.total_elevation_gain || 0,
    start_date: a.start_date,
    average_speed: a.average_speed || ((a.distance && a.moving_time) ? a.distance / a.moving_time : 0),
    max_speed: a.max_speed || 0,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    summary_polyline: a.summary_polyline ?? null,
    source: "Suunto",
    provenance: "terra" as const, // reuse existing literal; UI just reads `source`
  }));
}

async function fetchConnection(userId: string) {
  const [stravaRes, ahRes, garminRes, terraRes, suuntoRes] = await Promise.all([
    supabase.from("strava_connections").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("apple_health_connections").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("garmin_connections").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("terra_connections").select("id").eq("user_id", userId).eq("active", true).limit(1).maybeSingle(),
    supabase.from("suunto_connections").select("id").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    any: !!(stravaRes.data || ahRes.data || garminRes.data || terraRes.data || suuntoRes.data),
    fitnessApp: !!(stravaRes.data || garminRes.data || terraRes.data || suuntoRes.data),
  };
}

async function fetchPlannedWorkouts(userId: string): Promise<PlannedWorkout[]> {
  const { data: plans } = await supabase
    .from("training_plans")
    .select("plan_data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!plans || plans.length === 0) return [];
  const planData = (plans[0] as any).plan_data || [];
  const workouts: PlannedWorkout[] = [];
  for (const week of planData) {
    for (const day of week.days || []) {
      if (day.date && day.type !== "Rest") {
        workouts.push({
          date: day.date,
          type: day.type,
          distance_km: day.distance_km,
          color: day.color || "#94a3b8",
          title: day.title || null,
          description: day.description || null,
          pace: day.pace || null,
          elevation_m: day.elevation_m ?? null,
          eph: day.eph ?? null,
        });
      }
    }
  }
  return workouts;
}

async function fetchUserRaces(userId: string): Promise<UserRace[]> {
  const { data } = await supabase
    .from("user_races")
    .select("*")
    .eq("user_id", userId)
    .order("race_date", { ascending: true });
  return ((data as any[]) || []).map((r) => ({
    id: r.id,
    race_name: r.race_name,
    race_name_zh: r.race_name_zh,
    race_date: r.race_date,
    city: r.city,
    country: r.country,
    category: r.category,
    priority: r.priority || "none",
    source: r.source,
    website_url: r.website_url,
    notes: r.notes,
    finish_time_seconds: r.finish_time_seconds ?? null,
    finish_time_source: r.finish_time_source ?? null,
    finish_activity_id: r.finish_activity_id ?? null,
  }));
}

export function useActivities(options?: { limit?: number; enabled?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const limit = options?.limit;
  const activityQueriesEnabled = !!user && (options?.enabled ?? true);

  // Terra is the highest-priority source: load it first, then gate Strava /
  // Apple Health / Garmin (Railway) until Terra's first fetch settles.
  // This avoids painting a Garmin/Railway row first that later gets de-duped
  // away when the matching Terra activity arrives.
  const terraQuery = useQuery({
    queryKey: ["terra-activities", user?.id, limit ?? "all"],
    queryFn: () => fetchTerraActivities(user!.id, limit),
    enabled: activityQueriesEnabled,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Wait until Terra's CURRENT fetch settles (not just any prior fetch from
  // cache). On a stale refetch isFetched is already true from the previous
  // run, which would let Garmin/Railway return first and briefly replace the
  // Terra row at the top of the list.
  const hasTerraForLatestView = !!limit && (terraQuery.data?.length ?? 0) > 0;
  const secondaryEnabled =
    activityQueriesEnabled && terraQuery.isFetched && !terraQuery.isFetching && !hasTerraForLatestView;

  const activitiesQuery = useQuery({
    queryKey: ["strava-activities", user?.id, limit ?? "all"],
    queryFn: () => fetchActivities(user!.id, limit),
    enabled: secondaryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const appleHealthQuery = useQuery({
    queryKey: ["apple-health-activities", user?.id, limit ?? "all"],
    queryFn: () => fetchAppleHealthActivities(user!.id, limit),
    enabled: secondaryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const garminQuery = useQuery({
    queryKey: ["garmin-activities", user?.id, limit ?? "all"],
    queryFn: () => fetchGarminActivities(user!.id, limit),
    enabled: secondaryEnabled,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const suuntoQuery = useQuery({
    queryKey: ["suunto-activities", user?.id, limit ?? "all"],
    queryFn: () => fetchSuuntoActivities(user!.id, limit),
    enabled: activityQueriesEnabled,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });


  const profileQuery = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const connectionQuery = useQuery({
    queryKey: ["fitness-connection", user?.id],
    queryFn: () => fetchConnection(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const workoutsQuery = useQuery({
    queryKey: ["planned-workouts", user?.id],
    queryFn: () => fetchPlannedWorkouts(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Instantly refresh planned workouts whenever the user changes their
  // AI / free / custom training plan elsewhere in the app.
  useEffect(() => {
    if (!user) return;
    return subscribePlanChanged(() => {
      queryClient.invalidateQueries({ queryKey: ["planned-workouts", user.id] });
    });
  }, [user?.id, queryClient]);

  const userRacesQuery = useQuery({
    queryKey: ["user-races", user?.id],
    queryFn: () => fetchUserRaces(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const activitiesReady = !activityQueriesEnabled || (
    terraQuery.isFetched &&
    !terraQuery.isFetching &&
    (hasTerraForLatestView || (
      activitiesQuery.isFetched &&
      !activitiesQuery.isFetching &&
      appleHealthQuery.isFetched &&
      !appleHealthQuery.isFetching &&
      garminQuery.isFetched &&
      !garminQuery.isFetching
    ))
  );

  // Merge Strava + Apple Health + Garmin + Terra activities (prefer Terra over duplicate Garmin imports)
  // Wait until BOTH garmin and terra queries have completed at least once before
  // running dedup. Otherwise on refocus one query may briefly return empty/stale
  // data while the other has fresh data, causing activities to flicker/disappear.
  const mergedActivities = useMemo(() => {
    const tr = terraQuery.data || [];
    const terraReady = terraQuery.isFetched && !terraQuery.isFetching;
    if (!terraReady) {
      return [...tr].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    }
    const terraOnlyLatestView = !!limit && tr.length > 0;
    const strava = terraOnlyLatestView ? [] : (activitiesQuery.data || []);
    const ah = terraOnlyLatestView ? [] : (appleHealthQuery.data || []);
    const gm = terraOnlyLatestView ? [] : (garminQuery.data || []);

    // Wait for BOTH garmin and terra current fetches to settle before
    // running dedup. isFetched alone is true from prior cached runs, so we
    // also require !isFetching to avoid showing a stale garmin row that
    // hasn't yet been deduped against the still-loading terra response.
    const bothSettled =
      terraReady && garminQuery.isFetched && !garminQuery.isFetching;

    let filteredGarmin: StravaActivity[];
    if (bothSettled) {
      filteredGarmin = gm.filter((g) => !tr.some((t) => {
        const timeDiff = Math.abs(new Date(g.start_date).getTime() - new Date(t.start_date).getTime());
        const distanceDiff = Math.abs((g.distance || 0) - (t.distance || 0));
        const distanceTolerance = Math.max(250, Math.min(g.distance || 0, t.distance || 0) * 0.03);
        return timeDiff < 10 * 60 * 1000 && distanceDiff < distanceTolerance;
      }));
    } else if (terraQuery.isFetching && tr.length > 0) {
      // Terra still loading: hide any garmin row newer-or-equal to the newest
      // terra row we have, since it's likely a duplicate that will be deduped
      // once terra finishes. This prevents garmin/railway from briefly
      // replacing the latest terra activity at the top of the list.
      const newestTerraTs = new Date(tr[0].start_date).getTime();
      filteredGarmin = gm.filter((g) => new Date(g.start_date).getTime() < newestTerraTs);
    } else {
      filteredGarmin = gm;
    }
    const su = suuntoQuery.data || [];
    const all = [...strava, ...ah, ...filteredGarmin, ...tr, ...su];
    all.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    return all;
  }, [
    activitiesQuery.data,
    appleHealthQuery.data,
    garminQuery.data,
    terraQuery.data,
    suuntoQuery.data,
    garminQuery.isFetching,
    garminQuery.isFetched,
    limit,
    terraQuery.isFetching,
    terraQuery.isFetched,
  ]);

  // Auto-link races to activities: when an activity exists on a race day and
  // the race has no finish time yet, fill it from the activity's elapsed_time.
  const autoLinkedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const races = userRacesQuery.data || [];
    if (!races.length || !mergedActivities.length) return;

    const toLink: Array<{ raceId: string; seconds: number; activityId: string }> = [];
    for (const race of races) {
      if (race.finish_time_seconds && race.finish_time_seconds > 0) continue;
      if (autoLinkedRef.current.has(race.id)) continue;
      // Find an activity (Run-ish) on this race date
      const match = mergedActivities.find((a) => {
        const sport = (a.sport_type || "").toLowerCase();
        if (!sport.includes("run")) return false;
        const d = new Date(a.start_date);
        const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 10);
        return localDate === race.race_date;
      });
      if (match) {
        const secs = match.elapsed_time || match.moving_time || 0;
        if (secs > 0) {
          toLink.push({ raceId: race.id, seconds: Math.round(secs), activityId: match.id });
          autoLinkedRef.current.add(race.id);
        }
      }
    }

    if (toLink.length) {
      (async () => {
        for (const item of toLink) {
          await supabase
            .from("user_races")
            .update({
              finish_time_seconds: item.seconds,
              finish_time_source: "auto",
              finish_activity_id: item.activityId,
            } as any)
            .eq("id", item.raceId)
            .eq("user_id", user.id);
        }
        queryClient.invalidateQueries({ queryKey: ["user-races", user.id] });
      })();
    }
  }, [user, userRacesQuery.data, mergedActivities, queryClient]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["strava-activities", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["apple-health-activities", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["garmin-activities", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["terra-activities", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["user-profile", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["planned-workouts", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["fitness-connection", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["user-races", user?.id] });
  };

  return {
    activities: mergedActivities,
    profile: profileQuery.data,
    connected: connectionQuery.data?.any ?? false,
    fitnessAppConnected: connectionQuery.data?.fitnessApp ?? false,
    plannedWorkouts: workoutsQuery.data || [],
    userRaces: userRacesQuery.data || [],
    activitiesReady,
    loading: activitiesQuery.isLoading || appleHealthQuery.isLoading || garminQuery.isLoading || terraQuery.isLoading || profileQuery.isLoading || connectionQuery.isLoading,
    invalidateAll,
  };
}

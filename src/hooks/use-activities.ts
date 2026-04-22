import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAppEnvironment } from "@/lib/environment";

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
}

export interface PlannedWorkout {
  date: string;
  type: string;
  distance_km: number | null;
  color: string;
  title?: string | null;
  description?: string | null;
  pace?: string | null;
}

const appEnv = getAppEnvironment();

async function fetchActivities(userId: string): Promise<StravaActivity[]> {
  const { data } = await supabase
    .from("strava_activities")
    .select("*")
    .eq("user_id", userId)
    .eq("environment", appEnv)
    .order("start_date", { ascending: false });
  return ((data as any[]) || []).map((a) => ({ ...a, source: "strava" }));
}

async function fetchAppleHealthActivities(userId: string): Promise<StravaActivity[]> {
  const { data } = await supabase
    .from("apple_health_activities")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });
  return ((data as any[]) || []).map((a) => ({
    ...a,
    strava_id: 0,
    summary_polyline: null,
    source: a.source || "Apple Health",
    calories: a.calories ?? null,
  }));
}

async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("training_score, display_name, age, sex, avatar_url")
    .eq("user_id", userId)
    .single();
  return data as any;
}

async function fetchGarminActivities(userId: string): Promise<StravaActivity[]> {
  const { data } = await supabase
    .from("garmin_activities")
    .select("*")
    .eq("user_id", userId)
    .order("start_time", { ascending: false });
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
    };
  });
}

async function fetchConnection(userId: string) {
  const [stravaRes, ahRes, garminRes] = await Promise.all([
    supabase.from("strava_connections").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("apple_health_connections").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("garmin_connections").select("id").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    any: !!(stravaRes.data || ahRes.data || garminRes.data),
    fitnessApp: !!(stravaRes.data || garminRes.data),
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
        workouts.push({ date: day.date, type: day.type, distance_km: day.distance_km, color: day.color || "#94a3b8" });
      }
    }
  }
  return workouts;
}

export function useActivities() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const activitiesQuery = useQuery({
    queryKey: ["strava-activities", user?.id],
    queryFn: () => fetchActivities(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const appleHealthQuery = useQuery({
    queryKey: ["apple-health-activities", user?.id],
    queryFn: () => fetchAppleHealthActivities(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const garminQuery = useQuery({
    queryKey: ["garmin-activities", user?.id],
    queryFn: () => fetchGarminActivities(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
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

  // Merge Strava + Apple Health + Garmin activities
  const mergedActivities = useMemo(() => {
    const strava = activitiesQuery.data || [];
    const ah = appleHealthQuery.data || [];
    const gm = garminQuery.data || [];
    const all = [...strava, ...ah, ...gm];
    all.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    return all;
  }, [activitiesQuery.data, appleHealthQuery.data, garminQuery.data]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["strava-activities", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["apple-health-activities", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["garmin-activities", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["user-profile", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["planned-workouts", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["fitness-connection", user?.id] });
  };

  return {
    activities: mergedActivities,
    profile: profileQuery.data,
    connected: connectionQuery.data?.any ?? false,
    fitnessAppConnected: connectionQuery.data?.fitnessApp ?? false,
    plannedWorkouts: workoutsQuery.data || [],
    loading: activitiesQuery.isLoading || appleHealthQuery.isLoading || garminQuery.isLoading || profileQuery.isLoading || connectionQuery.isLoading,
    invalidateAll,
  };
}

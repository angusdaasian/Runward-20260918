import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAppEnvironment } from "@/lib/environment";

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
  source?: string; // "strava" | "apple_health" source app name
}

export interface PlannedWorkout {
  date: string;
  type: string;
  distance_km: number | null;
  color: string;
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

async function fetchConnection(userId: string) {
  const [stravaRes, ahRes] = await Promise.all([
    supabase.from("strava_connections").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("apple_health_connections").select("id").eq("user_id", userId).maybeSingle(),
  ]);
  return !!(stravaRes.data || ahRes.data);
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

  // Apple Health activities query removed - AH now provides health stats only, not workout activities

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

  // Only Strava activities (Apple Health no longer syncs workout activities)
  const mergedActivities = (activitiesQuery.data || [])
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["strava-activities", user?.id] });
    
    queryClient.invalidateQueries({ queryKey: ["user-profile", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["planned-workouts", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["fitness-connection", user?.id] });
  };

  return {
    activities: mergedActivities,
    profile: profileQuery.data,
    connected: connectionQuery.data ?? false,
    plannedWorkouts: workoutsQuery.data || [],
    loading: activitiesQuery.isLoading || profileQuery.isLoading || connectionQuery.isLoading,
    invalidateAll,
  };
}

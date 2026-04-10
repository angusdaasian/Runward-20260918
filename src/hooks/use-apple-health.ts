import { useState, useCallback } from "react";
import despia from "despia-native";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";

const HEALTHKIT_READ_TYPES = [
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKWorkoutTypeIdentifier",
].join(",");

export interface HealthStats {
  sleepMinutes: number;
  caloriesBurned: number;
  steps: number;
  walkRunDistanceKm: number;
}

function parseSleepMinutes(samples: any[]): number {
  if (!Array.isArray(samples) || samples.length === 0) return 0;
  let totalMinutes = 0;
  for (const sample of samples) {
    // Despia format: {date, value, unit} — value is minutes or hours of sleep
    // Or it may return start/end date pairs
    if (sample.startDate && sample.endDate) {
      const start = new Date(sample.startDate);
      const end = new Date(sample.endDate);
      const diffMin = (end.getTime() - start.getTime()) / 60000;
      if (diffMin > 0 && diffMin < 1440) totalMinutes += diffMin;
    } else if (sample.start && sample.end) {
      const start = new Date(sample.start);
      const end = new Date(sample.end);
      const diffMin = (end.getTime() - start.getTime()) / 60000;
      if (diffMin > 0 && diffMin < 1440) totalMinutes += diffMin;
    } else if (typeof sample.value === "number" && sample.value > 0) {
      // If Despia returns aggregated value (e.g. minutes)
      // Check unit to determine if it's minutes or hours
      if (sample.unit === "hr" || sample.unit === "hours") {
        totalMinutes += sample.value * 60;
      } else {
        // Assume minutes if value < 1440, otherwise treat as seconds
        totalMinutes += sample.value < 1440 ? sample.value : sample.value / 60;
      }
    }
  }
  return Math.round(totalMinutes);
}

function sumQuantitySamples(samples: any[]): number {
  if (!Array.isArray(samples) || samples.length === 0) return 0;
  return samples.reduce((sum: number, s: any) => sum + (s.value || s.quantity || 0), 0);
}

interface AppleHealthWorkout {
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
  source: string;
}

function mapWorkoutType(hkType: string): string {
  const map: Record<string, string> = {
    HKWorkoutActivityTypeRunning: "Run",
    HKWorkoutActivityTypeWalking: "Walk",
    HKWorkoutActivityTypeHiking: "Hike",
    HKWorkoutActivityTypeCycling: "Ride",
    HKWorkoutActivityTypeSwimming: "Swim",
    HKWorkoutActivityTypeTrailRunning: "TrailRun",
  };
  return map[hkType] || hkType?.replace("HKWorkoutActivityType", "") || "Run";
}

function parseWorkouts(samples: any[]): AppleHealthWorkout[] {
  if (!Array.isArray(samples) || samples.length === 0) return [];
  return samples
    .filter((w) => w && (w.startDate || w.start_date))
    .map((w) => {
      const distance = w.totalDistance || w.distance || 0;
      const duration = w.duration || w.moving_time || w.elapsed_time || 0;
      const avgSpeed = duration > 0 ? distance / duration : 0;
      return {
        name: w.workoutActivityType
          ? mapWorkoutType(w.workoutActivityType)
          : w.name || "Workout",
        sport_type: mapWorkoutType(w.workoutActivityType || w.sport_type || ""),
        distance: Math.round(distance),
        moving_time: Math.round(duration),
        elapsed_time: Math.round(w.elapsed_time || duration),
        total_elevation_gain: Math.round(w.totalElevationGain || w.total_elevation_gain || 0),
        start_date: w.startDate || w.start_date,
        average_speed: Math.round(avgSpeed * 100) / 100,
        max_speed: w.max_speed || 0,
        average_heartrate: w.averageHeartRate || w.average_heartrate || null,
        max_heartrate: w.maxHeartRate || w.max_heartrate || null,
        source: w.sourceName || w.source || "Apple Health",
      };
    });
}

// Module-level cache to persist across remounts (tab switches)
let _cachedStats: HealthStats | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useAppleHealth(lang: Lang) {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [healthStats, setHealthStats] = useState<HealthStats | null>(_cachedStats);

  const readHealthData = useCallback(async (days = 1): Promise<{ stats: HealthStats; workouts: AppleHealthWorkout[] }> => {
    try {
      const result = await despia(
        `healthkit://read?types=${HEALTHKIT_READ_TYPES}&days=${days}`,
        ["healthkitResponse"],
      );

      console.log("[AppleHealth] Raw response:", JSON.stringify(result));

      const data = result?.healthkitResponse || result || {};

      const sleepSamples = data.HKCategoryTypeIdentifierSleepAnalysis || data.sleepAnalysis || data.sleep || [];
      const calorieSamples = data.HKQuantityTypeIdentifierActiveEnergyBurned || [];
      const stepSamples = data.HKQuantityTypeIdentifierStepCount || [];
      const distanceSamples = data.HKQuantityTypeIdentifierDistanceWalkingRunning || [];
      const workoutSamples = data.HKWorkoutTypeIdentifier || data.workouts || [];

      const rawCalories = Array.isArray(calorieSamples) ? sumQuantitySamples(calorieSamples) : (typeof calorieSamples === "number" ? calorieSamples : 0);
      const rawSteps = Array.isArray(stepSamples) ? sumQuantitySamples(stepSamples) : (typeof stepSamples === "number" ? stepSamples : 0);
      const rawDistance = Array.isArray(distanceSamples) ? sumQuantitySamples(distanceSamples) : (typeof distanceSamples === "number" ? distanceSamples : 0);

      const distanceKm = Math.round((rawDistance / 1000) * 100) / 100;

      const stats: HealthStats = {
        sleepMinutes: parseSleepMinutes(sleepSamples),
        caloriesBurned: Math.round(rawCalories),
        steps: Math.round(rawSteps),
        walkRunDistanceKm: distanceKm,
      };

      const workouts = parseWorkouts(workoutSamples);

      console.log("[AppleHealth] Parsed stats:", stats, "workouts:", workouts.length);
      return { stats, workouts };
    } catch (err) {
      console.error("[AppleHealth] Read error:", err);
      return { stats: { sleepMinutes: 0, caloriesBurned: 0, steps: 0, walkRunDistanceKm: 0 }, workouts: [] };
    }
  }, []);

  const updateStats = useCallback((stats: HealthStats) => {
    _cachedStats = stats;
    _cachedAt = Date.now();
    setHealthStats(stats);
  }, []);

  const saveWorkoutsToDb = useCallback(async (workouts: AppleHealthWorkout[]) => {
    if (!user || workouts.length === 0) return;
    try {
      for (const w of workouts) {
        await supabase
          .from("apple_health_activities")
          .upsert(
            {
              user_id: user.id,
              name: w.name,
              sport_type: w.sport_type,
              distance: w.distance,
              moving_time: w.moving_time,
              elapsed_time: w.elapsed_time,
              total_elevation_gain: w.total_elevation_gain,
              start_date: w.start_date,
              average_speed: w.average_speed,
              max_speed: w.max_speed,
              average_heartrate: w.average_heartrate,
              max_heartrate: w.max_heartrate,
              source: w.source,
            },
            { onConflict: "user_id,start_date" },
          );
      }
      console.log(`[AppleHealth] Saved ${workouts.length} workouts to DB`);
    } catch (err) {
      console.error("[AppleHealth] Failed to save workouts:", err);
    }
  }, [user]);

  const connect = useCallback(async () => {
    if (!user) return false;
    setSyncing(true);
    try {
      const { stats, workouts } = await readHealthData(30);
      await supabase
        .from("apple_health_connections")
        .upsert({ user_id: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      updateStats(stats);
      await saveWorkoutsToDb(workouts);
      setSyncing(false);
      return true;
    } catch (err) {
      console.error("[AppleHealth] Connect error:", err);
      toast.error(lang === "zh" ? "請在設定中開啟健康資料存取權限" : "Please enable Health access in Settings");
      setSyncing(false);
      return false;
    }
  }, [user, lang, readHealthData, updateStats, saveWorkoutsToDb]);

  const syncHealthData = useCallback(async () => {
    if (!user) return;
    // Skip if cache is fresh
    if (_cachedStats && Date.now() - _cachedAt < CACHE_TTL) {
      setHealthStats(_cachedStats);
      return;
    }
    setSyncing(true);
    try {
      const { stats, workouts } = await readHealthData(7);
      updateStats(stats);
      await saveWorkoutsToDb(workouts);
    } catch {
      console.warn("[AppleHealth] Sync failed");
    }
    setSyncing(false);
  }, [user, readHealthData, updateStats, saveWorkoutsToDb]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    await supabase.from("apple_health_connections").delete().eq("user_id", user.id);
    _cachedStats = null;
    _cachedAt = 0;
    setHealthStats(null);
  }, [user]);

  return { connect, disconnect, syncHealthData, syncing, healthStats };
}

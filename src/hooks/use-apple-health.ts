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
  "HKQuantityTypeIdentifierHeartRate",
  "HKWorkoutTypeIdentifier",
].join(",");

const HEALTHKIT_WORKOUT_PERMISSION_TYPES = ["HKWorkoutTypeIdentifier", "HKQuantityTypeIdentifierHeartRate"].join(",");

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

function getNumericValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function getWorkoutWindow(workout: any) {
  const startRaw = workout.startDate || workout.start_date || workout.start;
  const endRaw = workout.endDate || workout.end_date || workout.end;

  const start = startRaw ? new Date(startRaw) : null;
  let end = endRaw ? new Date(endRaw) : null;

  const duration = getNumericValue(workout.duration, workout.moving_time, workout.elapsed_time);
  if (!end && start && duration && duration > 0) {
    end = new Date(start.getTime() + duration * 1000);
  }

  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  return { start, end };
}

function getHeartRateStatsForWorkout(workout: any, samples: any[]) {
  const window = getWorkoutWindow(workout);
  if (!window || !Array.isArray(samples) || samples.length === 0) {
    return { average: null, max: null };
  }

  const values = samples
    .map((sample) => {
      const timestamp = sample.date || sample.startDate || sample.start_date || sample.start;
      const value = getNumericValue(sample.value, sample.quantity);
      if (!timestamp || value === null || value <= 0) return null;

      const sampleTime = new Date(timestamp).getTime();
      if (Number.isNaN(sampleTime) || sampleTime < window.start.getTime() || sampleTime > window.end.getTime()) {
        return null;
      }

      return value;
    })
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return { average: null, max: null };
  }

  return {
    average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    max: Math.round(Math.max(...values)),
  };
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

function parseWorkouts(samples: any[], heartRateSamples: any[] = []): AppleHealthWorkout[] {
  if (!Array.isArray(samples) || samples.length === 0) return [];
  return samples
    .filter((w) => w && (w.startDate || w.start_date))
    .map((w) => {
      const distance = getNumericValue(w.totalDistance, w.distance, w.total_distance) || 0;
      const duration = getNumericValue(w.duration, w.moving_time, w.elapsed_time) || 0;
      const avgSpeed = duration > 0 ? distance / duration : 0;
      const heartRateStats = getHeartRateStatsForWorkout(w, heartRateSamples);
      const startDate = w.startDate || w.start_date || w.start;
      return {
        name: w.workoutActivityType ? mapWorkoutType(w.workoutActivityType) : w.name || "Workout",
        sport_type: mapWorkoutType(w.workoutActivityType || w.sport_type || ""),
        distance: Math.round(distance),
        moving_time: Math.round(duration),
        elapsed_time: Math.round(w.elapsed_time || duration),
        total_elevation_gain: Math.round(w.totalElevationGain || w.total_elevation_gain || 0),
        start_date: startDate,
        average_speed: Math.round(avgSpeed * 100) / 100,
        max_speed: w.max_speed || 0,
        average_heartrate:
          getNumericValue(w.averageHeartRate, w.average_heartrate, w.avgHeartRate) ?? heartRateStats.average,
        max_heartrate: getNumericValue(w.maxHeartRate, w.max_heartrate, w.maxHR) ?? heartRateStats.max,
        source: w.sourceName || w.source || w.device || "Apple Health",
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

  const readHealthData = useCallback(
    async (days = 1): Promise<{ stats: HealthStats; workouts: AppleHealthWorkout[] }> => {
      try {
        const result = await despia(`healthkit://read?types=${HEALTHKIT_READ_TYPES}&days=${days}`, [
          "healthkitResponse",
        ]);

        console.log("[AppleHealth] Raw response:", JSON.stringify(result));

        const data = result?.healthkitResponse || result || {};

        const sleepSamples = data.HKCategoryTypeIdentifierSleepAnalysis || data.sleepAnalysis || data.sleep || [];
        const calorieSamples = data.HKQuantityTypeIdentifierActiveEnergyBurned || [];
        const stepSamples = data.HKQuantityTypeIdentifierStepCount || [];
        const distanceSamples = data.HKQuantityTypeIdentifierDistanceWalkingRunning || [];
        const heartRateSamples = data.HKQuantityTypeIdentifierHeartRate || data.heartRate || [];
        const workoutSamples =
          data.HKWorkoutTypeIdentifier || data.HKWorkoutType || data.workouts || data.workoutSamples || [];

        const rawCalories = Array.isArray(calorieSamples)
          ? sumQuantitySamples(calorieSamples)
          : typeof calorieSamples === "number"
            ? calorieSamples
            : 0;
        const rawSteps = Array.isArray(stepSamples)
          ? sumQuantitySamples(stepSamples)
          : typeof stepSamples === "number"
            ? stepSamples
            : 0;
        const rawDistance = Array.isArray(distanceSamples)
          ? sumQuantitySamples(distanceSamples)
          : typeof distanceSamples === "number"
            ? distanceSamples
            : 0;

        const distanceKm = Math.round((rawDistance / 1000) * 100) / 100;

        const stats: HealthStats = {
          sleepMinutes: parseSleepMinutes(sleepSamples),
          caloriesBurned: Math.round(rawCalories),
          steps: Math.round(rawSteps),
          walkRunDistanceKm: distanceKm,
        };

        const workouts = parseWorkouts(workoutSamples, Array.isArray(heartRateSamples) ? heartRateSamples : []);

        console.log("[AppleHealth] Parsed stats:", stats, "workouts:", workouts.length);
        return { stats, workouts };
      } catch (err) {
        console.error("[AppleHealth] Read error:", err);
        return { stats: { sleepMinutes: 0, caloriesBurned: 0, steps: 0, walkRunDistanceKm: 0 }, workouts: [] };
      }
    },
    [],
  );

  const updateStats = useCallback((stats: HealthStats) => {
    _cachedStats = stats;
    _cachedAt = Date.now();
    setHealthStats(stats);
  }, []);

  const saveWorkoutsToDb = useCallback(
    async (workouts: AppleHealthWorkout[]) => {
      if (!user || workouts.length === 0) return 0;
      try {
        const normalizedWorkouts = Array.from(
          new Map(
            workouts.map((workout) => {
              const parsedStartDate = new Date(workout.start_date);
              const start_date = Number.isNaN(parsedStartDate.getTime())
                ? workout.start_date
                : parsedStartDate.toISOString();

              return [start_date, { ...workout, start_date }];
            }),
          ).values(),
        );

        const startDates = normalizedWorkouts.map((workout) => workout.start_date);
        const { data: existingRows, error: existingError } = await supabase
          .from("apple_health_activities")
          .select("start_date")
          .eq("user_id", user.id)
          .in("start_date", startDates);

        if (existingError) throw existingError;

        const existingStartDates = new Set(
          ((existingRows as Array<{ start_date: string }> | null) || []).map((row) => {
            const parsedStartDate = new Date(row.start_date);
            return Number.isNaN(parsedStartDate.getTime()) ? row.start_date : parsedStartDate.toISOString();
          }),
        );

        const rowsToInsert = normalizedWorkouts
          .filter((workout) => !existingStartDates.has(workout.start_date))
          .map((w) => ({
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
          }));

        if (rowsToInsert.length === 0) {
          console.log("[AppleHealth] No new workouts to save");
          return 0;
        }

        const { error } = await supabase.from("apple_health_activities").insert(rowsToInsert);
        if (error) throw error;

        console.log(`[AppleHealth] Saved ${rowsToInsert.length} workouts to DB`);
        return rowsToInsert.length;
      } catch (err) {
        console.error("[AppleHealth] Failed to save workouts:", err);
        return 0;
      }
    },
    [user],
  );

  const requestAuthorization = useCallback(async () => {
    try {
      const result = await despia(`healthkit://read?types=${HEALTHKIT_WORKOUT_PERMISSION_TYPES}&days=1`, [
        "healthkitResponse",
      ]);
      console.log("[AppleHealth] Authorization probe result:", JSON.stringify(result));
      return true;
    } catch (err) {
      console.error("[AppleHealth] Authorization error:", err);
      return false;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!user) return false;
    setSyncing(true);
    try {
      // Step 1: Explicitly request HealthKit permissions (including workouts)
      const authorized = await requestAuthorization();
      if (!authorized) {
        toast.error(lang === "zh" ? "請在設定中開啟健康資料存取權限" : "Please enable Health access in Settings");
        setSyncing(false);
        return false;
      }

      // Step 2: Read health data + workouts (30 days on initial connect)
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
  }, [user, lang, requestAuthorization, readHealthData, updateStats, saveWorkoutsToDb]);

  const syncHealthData = useCallback(async () => {
    if (!user) return;
    if (_cachedStats && Date.now() - _cachedAt < CACHE_TTL) {
      setHealthStats(_cachedStats);
    }
    setSyncing(true);
    try {
      const authorized = await requestAuthorization();
      if (!authorized) {
        setSyncing(false);
        return;
      }

      const { stats, workouts } = await readHealthData(7);
      updateStats(stats);
      await saveWorkoutsToDb(workouts);
    } catch {
      console.warn("[AppleHealth] Sync failed");
    }
    setSyncing(false);
  }, [user, requestAuthorization, readHealthData, updateStats, saveWorkoutsToDb]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    await supabase.from("apple_health_connections").delete().eq("user_id", user.id);
    _cachedStats = null;
    _cachedAt = 0;
    setHealthStats(null);
  }, [user]);

  return { connect, disconnect, syncHealthData, syncing, healthStats };
}

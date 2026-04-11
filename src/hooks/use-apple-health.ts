import { useState, useCallback } from "react";
import despia from "despia-native";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";

const HEALTHKIT_DAILY_TYPES = [
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
];

const HEALTHKIT_WORKOUT_TYPES = ["HKWorkoutType", "HKWorkoutTypeIdentifier", "HKQuantityTypeIdentifierHeartRate"].join(
  ",",
);

const HEALTHKIT_READ_TYPES = [...HEALTHKIT_DAILY_TYPES, HEALTHKIT_WORKOUT_TYPES].join(",");

const HEALTHKIT_WORKOUT_PERMISSION_REQUESTS = [
  ["HKWorkoutType", "HKQuantityTypeIdentifierHeartRate"],
  ["HKWorkoutTypeIdentifier", "HKQuantityTypeIdentifierHeartRate"],
];

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

function mergeSampleArrays(data: Record<string, any>, keys: string[]): any[] {
  const merged = keys.flatMap((key) => (Array.isArray(data[key]) ? data[key] : []));

  return Array.from(
    new Map(
      merged.map((sample, index) => {
        const sampleKey = JSON.stringify([
          sample?.id,
          sample?.uuid,
          sample?.startDate,
          sample?.start_date,
          sample?.start,
          sample?.endDate,
          sample?.end_date,
          sample?.end,
          sample?.date,
          sample?.workoutActivityType,
          sample?.activityType,
          sample?.value,
          sample?.quantity,
          index,
        ]);

        return [sampleKey, sample];
      }),
    ).values(),
  );
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

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }

    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      const parsed = getNumericValue(
        nested.value,
        nested.quantity,
        nested.doubleValue,
        nested.numericValue,
        nested.amount,
      );
      if (parsed !== null) return parsed;
    }
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

const WORKOUT_ACTIVITY_TYPE_MAP: Record<string, string> = {
  "13": "Ride",
  "24": "Hike",
  "37": "Run",
  "46": "Swim",
  "52": "Walk",
  "170": "Run", // Despia may return non-standard codes
  HKWorkoutActivityTypeCycling: "Ride",
  HKWorkoutActivityTypeHiking: "Hike",
  HKWorkoutActivityTypeRunning: "Run",
  HKWorkoutActivityTypeSwimming: "Swim",
  HKWorkoutActivityTypeTrailRunning: "TrailRun",
  HKWorkoutActivityTypeWalking: "Walk",
};

function mapWorkoutType(hkType: unknown, fallbackName?: string): string {
  const rawType = String(hkType ?? "").trim();
  const mapped = WORKOUT_ACTIVITY_TYPE_MAP[rawType];
  if (mapped) return mapped;

  const lower = `${rawType} ${fallbackName || ""}`.toLowerCase();
  if (lower.includes("trail") && lower.includes("run")) return "TrailRun";
  if (lower.includes("run")) return "Run";
  if (lower.includes("walk")) return "Walk";
  if (lower.includes("hike")) return "Hike";
  if (lower.includes("cycle") || lower.includes("bike")) return "Ride";
  if (lower.includes("swim")) return "Swim";

  return rawType.replace("HKWorkoutActivityType", "") || fallbackName || "Workout";
}

/**
 * Despia may return distance in km or meters depending on the HealthKit source.
 * Heuristic: if value < 200, it's likely km → convert to meters.
 * Real workouts rarely exceed 200 km but are often > 200 meters.
 */
function normalizeDistanceToMeters(raw: number): number {
  if (raw <= 0) return 0;
  // If the value looks like km (< 200), convert to meters
  if (raw < 200) return raw * 1000;
  return raw;
}

/**
 * Despia may return duration in seconds or minutes.
 * Heuristic: if value < 300 (~5 min in seconds but ~5 hours in minutes),
 * and the value seems too small for seconds, treat as minutes.
 * A more reliable check: if duration < 60 and distance > 500m, likely minutes.
 */
function normalizeDurationToSeconds(raw: number, distanceMeters: number): number {
  if (raw <= 0) return 0;
  // If duration looks like minutes (short value but meaningful distance),
  // convert to seconds. Typical run: 20-120 minutes.
  // If raw < 300 and distance > 500m, it's almost certainly minutes.
  if (raw < 300 && distanceMeters > 500) return raw * 60;
  // If raw is already > 300, it's likely already seconds (5+ minutes)
  return raw;
}

function extractQuantityValue(field: unknown): number | null {
  if (field === null || field === undefined) return null;
  if (typeof field === "number" && Number.isFinite(field)) return field;
  if (typeof field === "string") {
    const parsed = Number(field);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof field === "object" && field !== null) {
    const obj = field as Record<string, unknown>;
    // HKQuantity objects: {doubleValue, unit} or {value, unit} or {quantity}
    return getNumericValue(obj.doubleValue, obj.value, obj.quantity, obj.numericValue, obj.amount);
  }
  return null;
}

function parseWorkouts(samples: any[], heartRateSamples: any[] = []): AppleHealthWorkout[] {
  if (!Array.isArray(samples) || samples.length === 0) return [];

  return samples
    .filter((w) => w && (w.startDate || w.start_date || w.start))
    .map((w) => {
      // Log each raw workout for debugging
      console.log("[AppleHealth] Raw workout object:", JSON.stringify(w));

      const sportType = mapWorkoutType(
        w.workoutActivityType ?? w.activityType ?? w.workoutType ?? w.sport_type,
        w.name,
      );

      // Extract raw distance - try multiple field names including HKQuantity objects
      const rawDistance =
        extractQuantityValue(w.totalDistance) ??
        extractQuantityValue(w.total_distance) ??
        extractQuantityValue(w.distance) ??
        extractQuantityValue(w.totalDistanceMeters) ??
        extractQuantityValue(w.distanceInMeters) ??
        0;

      const distanceMeters = normalizeDistanceToMeters(rawDistance);

      // Extract raw duration
      const rawDuration =
        extractQuantityValue(w.duration) ??
        extractQuantityValue(w.durationInSeconds) ??
        extractQuantityValue(w.totalDuration) ??
        extractQuantityValue(w.totalDurationSeconds) ??
        extractQuantityValue(w.moving_time) ??
        extractQuantityValue(w.elapsed_time) ??
        0;

      // Also try computing from start/end if duration is 0
      let durationSeconds = rawDuration;
      if (durationSeconds <= 0) {
        const window = getWorkoutWindow(w);
        if (window) {
          durationSeconds = (window.end.getTime() - window.start.getTime()) / 1000;
        }
      }
      durationSeconds = normalizeDurationToSeconds(durationSeconds, distanceMeters);

      const avgSpeed =
        extractQuantityValue(w.averageSpeed) ??
        extractQuantityValue(w.average_speed) ??
        extractQuantityValue(w.avgSpeed) ??
        extractQuantityValue(w.meanSpeed) ??
        (durationSeconds > 0 ? distanceMeters / durationSeconds : 0);

      const heartRateStats = getHeartRateStatsForWorkout(w, heartRateSamples);
      const startDate = w.startDate || w.start_date || w.start;

      // Extract heart rate - also check nested statistics
      const avgHR =
        extractQuantityValue(w.averageHeartRate) ??
        extractQuantityValue(w.average_heartrate) ??
        extractQuantityValue(w.avgHeartRate) ??
        extractQuantityValue(w.averageHeartRateBpm) ??
        extractQuantityValue(w?.statistics?.HKQuantityTypeIdentifierHeartRate?.average) ??
        heartRateStats.average;

      const maxHR =
        extractQuantityValue(w.maxHeartRate) ??
        extractQuantityValue(w.max_heartrate) ??
        extractQuantityValue(w.maxHR) ??
        extractQuantityValue(w.maxHeartRateBpm) ??
        extractQuantityValue(w?.statistics?.HKQuantityTypeIdentifierHeartRate?.maximum) ??
        heartRateStats.max;

      const workout: AppleHealthWorkout = {
        name: w.name || w.workoutName || `${sportType} Workout`,
        sport_type: sportType,
        distance: Math.round(distanceMeters),
        moving_time: Math.round(durationSeconds),
        elapsed_time: Math.round(durationSeconds),
        total_elevation_gain: Math.round(
          extractQuantityValue(w.totalElevationGain) ??
            extractQuantityValue(w.total_elevation_gain) ??
            extractQuantityValue(w.elevationGain) ??
            extractQuantityValue(w.elevation_gain) ??
            0,
        ),
        start_date: startDate,
        average_speed: Math.round(avgSpeed * 100) / 100,
        max_speed: extractQuantityValue(w.maxSpeed) ?? extractQuantityValue(w.max_speed) ?? 0,
        average_heartrate: avgHR,
        max_heartrate: maxHR,
        source: w.sourceName || w.source || w.device || w.bundleIdentifier || "Apple Health",
      };

      console.log("[AppleHealth] Parsed workout:", JSON.stringify(workout));
      return workout;
    })
    .filter((workout) => !!workout.start_date);
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
        const heartRateSamples = mergeSampleArrays(data, ["HKQuantityTypeIdentifierHeartRate", "heartRate"]);
        const workoutSamples = mergeSampleArrays(data, [
          "HKWorkoutType",
          "HKWorkoutTypeIdentifier",
          "workouts",
          "workoutSamples",
        ]);

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
          .select("id, start_date")
          .eq("user_id", user.id)
          .in("start_date", startDates);

        if (existingError) throw existingError;

        const existingRowsByStartDate = new Map(
          ((existingRows as Array<{ id: string; start_date: string }> | null) || []).map((row) => {
            const parsedStartDate = new Date(row.start_date);
            const normalizedStartDate = Number.isNaN(parsedStartDate.getTime())
              ? row.start_date
              : parsedStartDate.toISOString();

            return [normalizedStartDate, row.id] as const;
          }),
        );

        const rows = normalizedWorkouts.map((w) => ({
          id: existingRowsByStartDate.get(w.start_date),
          start_date: w.start_date,
          row: {
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
        }));

        const rowsToInsert = rows.filter((entry) => !entry.id).map((entry) => entry.row);
        const rowsToUpdate = rows.filter((entry) => !!entry.id) as Array<{
          id: string;
          start_date: string;
          row: {
            user_id: string;
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
          };
        }>;

        if (rowsToInsert.length > 0) {
          const { error } = await supabase.from("apple_health_activities").insert(rowsToInsert);
          if (error) throw error;
        }

        if (rowsToUpdate.length > 0) {
          const updateResults = await Promise.all(
            rowsToUpdate.map(({ id, row }) =>
              supabase.from("apple_health_activities").update(row).eq("id", id).eq("user_id", user.id),
            ),
          );

          const updateError = updateResults.find((result) => result.error)?.error;
          if (updateError) throw updateError;
        }

        if (rowsToInsert.length === 0 && rowsToUpdate.length === 0) {
          console.log("[AppleHealth] No workouts to sync");
          return 0;
        }

        console.log(
          `[AppleHealth] Synced ${rowsToInsert.length} new workouts and refreshed ${rowsToUpdate.length} existing workouts`,
        );
        return rowsToInsert.length + rowsToUpdate.length;
      } catch (err) {
        console.error("[AppleHealth] Failed to save workouts:", err);
        return 0;
      }
    },
    [user],
  );

  const requestAuthorization = useCallback(async () => {
    let requested = false;

    for (const requestTypes of HEALTHKIT_WORKOUT_PERMISSION_REQUESTS) {
      try {
        const result = await despia(`healthkit://read?types=${requestTypes.join(",")}&days=30`, ["healthkitResponse"]);
        console.log(`[AppleHealth] Authorization probe (${requestTypes.join(",")}) result:`, JSON.stringify(result));
        requested = true;
      } catch (err) {
        console.warn(`[AppleHealth] Authorization probe failed for ${requestTypes.join(",")}:`, err);
      }
    }

    return requested;
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

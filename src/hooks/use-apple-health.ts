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
      if (sample.unit === "hr" || sample.unit === "hours") {
        totalMinutes += sample.value * 60;
      } else {
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

interface QuantityMeasurement {
  value: number | null;
  unit: string | null;
}

const MEASUREMENT_VALUE_KEYS = ["value", "qty", "quantity", "doubleValue", "numericValue", "amount", "average", "avg", "maximum", "minimum", "sum"];
const MEASUREMENT_UNIT_KEYS = ["unit", "units", "measurementUnit"];

function parseNumericString(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const direct = Number(trimmed);
  if (Number.isFinite(direct)) return direct;
  const match = trimmed.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function extractMeasurement(field: unknown, depth = 0): QuantityMeasurement {
  if (depth > 5 || field === null || field === undefined) return { value: null, unit: null };
  if (typeof field === "number" && Number.isFinite(field)) return { value: field, unit: null };
  if (typeof field === "string") return { value: parseNumericString(field), unit: null };
  if (typeof field !== "object") return { value: null, unit: null };

  const obj = field as Record<string, unknown>;
  const unit = MEASUREMENT_UNIT_KEYS.map((key) => obj[key]).find((value): value is string => typeof value === "string") || null;

  for (const key of MEASUREMENT_VALUE_KEYS) {
    if (!(key in obj)) continue;
    const nested = extractMeasurement(obj[key], depth + 1);
    if (nested.value !== null) return { value: nested.value, unit: unit || nested.unit };
  }
  return { value: null, unit };
}

function getPathValue(source: unknown, path: string[]): unknown {
  let current = source;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function extractMeasurementFromPaths(source: unknown, paths: string[][]): QuantityMeasurement {
  for (const path of paths) {
    const measurement = extractMeasurement(getPathValue(source, path));
    if (measurement.value !== null) return measurement;
  }
  return { value: null, unit: null };
}

function extractTextFromPaths(source: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getPathValue(source, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function extractDateStringFromPaths(source: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getPathValue(source, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  }
  return null;
}

function normalizeUnitToken(unit: string | null | undefined): string {
  return (unit || "").trim().toLowerCase().replace(/\s+/g, "");
}

// Path constants
const WORKOUT_NAME_PATHS = [["name"], ["workoutName"], ["summary", "name"]];
const WORKOUT_ACTIVITY_TYPE_PATHS = [["workoutActivityType"], ["activityType"], ["sport_type"]];
const WORKOUT_START_DATE_PATHS = [["startDate"], ["start_date"], ["start"]];
const WORKOUT_END_DATE_PATHS = [["endDate"], ["end_date"], ["end"], ["date"]];
const WORKOUT_DISTANCE_PATHS = [["totalDistance"], ["total_distance"], ["distance"]];
const WORKOUT_DURATION_PATHS = [["duration"], ["moving_time"], ["elapsed_time"]];
const WORKOUT_AVG_SPEED_PATHS = [["averageSpeed"], ["average_speed"]];
const WORKOUT_MAX_SPEED_PATHS = [["maxSpeed"], ["max_speed"]];
const WORKOUT_AVG_HEART_RATE_PATHS = [["averageHeartRate"], ["average_heartrate"], ["statistics", "HKQuantityTypeIdentifierHeartRate", "average"]];
const WORKOUT_MAX_HEART_RATE_PATHS = [["maxHeartRate"], ["max_heartrate"], ["statistics", "HKQuantityTypeIdentifierHeartRate", "maximum"]];
const WORKOUT_ELEVATION_PATHS = [["totalElevationGain"], ["total_elevation_gain"]];
const WORKOUT_SOURCE_PATHS = [["sourceName"], ["source", "name"], ["bundleIdentifier"]];

function getWorkoutWindow(workout: any) {
  const startRaw = extractDateStringFromPaths(workout, WORKOUT_START_DATE_PATHS);
  const endRaw = extractDateStringFromPaths(workout, WORKOUT_END_DATE_PATHS);
  const start = startRaw ? new Date(startRaw) : null;
  let end = endRaw ? new Date(endRaw) : null;

  if (!start || Number.isNaN(start.getTime())) return null;
  if (!end || Number.isNaN(end.getTime()) || end <= start) return null;

  return { start, end };
}

function getHeartRateStatsForWorkout(workout: any, samples: any[]) {
  const window = getWorkoutWindow(workout);
  if (!window || !Array.isArray(samples) || samples.length === 0) {
    return { average: null, max: null };
  }

  const values = samples
    .map((sample) => {
      const timestamp = sample.date || sample.startDate || sample.start;
      const value = extractMeasurement(sample).value;
      if (!timestamp || value === null || value <= 0) return null;

      const sampleTime = new Date(timestamp).getTime();
      if (Number.isNaN(sampleTime) || sampleTime < window.start.getTime() || sampleTime > window.end.getTime()) {
        return null;
      }
      return value;
    })
    .filter((value): value is number => value !== null);

  if (values.length === 0) return { average: null, max: null };

  return {
    average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    max: Math.round(Math.max(...values)),
  };
}

const WORKOUT_ACTIVITY_TYPE_MAP: Record<string, string> = {
  "13": "Ride", "24": "Hike", "37": "Run", "46": "Swim", "52": "Walk", "170": "Run",
  HKWorkoutActivityTypeCycling: "Ride", HKWorkoutActivityTypeHiking: "Hike",
  HKWorkoutActivityTypeRunning: "Run", HKWorkoutActivityTypeSwimming: "Swim",
  HKWorkoutActivityTypeTrailRunning: "TrailRun", HKWorkoutActivityTypeWalking: "Walk",
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
  return rawType.replace("HKWorkoutActivityType", "") || fallbackName || "Workout";
}

function normalizeDistanceToMeters(raw: number, unit?: string | null): number {
  if (raw <= 0) return 0;
  const normalizedUnit = normalizeUnitToken(unit);
  
  if (/^(km|kilometer|kilometers)$/.test(normalizedUnit)) return raw * 1000;
  if (/^(m|meter|meters)$/.test(normalizedUnit)) return raw;

  // HEURISTIC: If raw is < 500 and no unit provided, it is likely already KM (per your DB screenshot)
  if (!normalizedUnit && raw < 500) return raw * 1000;
  return raw;
}

function normalizeDurationToSeconds(raw: number, distanceMeters: number, unit?: string | null): number {
  if (raw <= 0) return 0;
  const normalizedUnit = normalizeUnitToken(unit);
  
  if (/^(min|mins|minute|minutes)$/.test(normalizedUnit)) return raw * 60;
  if (/^(s|sec|secs|second|seconds)$/.test(normalizedUnit)) return raw;

  // HEURISTIC: If workout duration is very low (e.g. 46) but distance is high, it's minutes
  if (raw < 500 && distanceMeters > 500) return raw * 60;
  return raw;
}

function normalizeSpeedToMetersPerSecond(raw: number, unit?: string | null): number {
  if (raw <= 0) return 0;
  const normalizedUnit = normalizeUnitToken(unit);
  if (/^(km\/h|kmh|kph)$/.test(normalizedUnit)) return raw / 3.6;
  return raw;
}

function parseWorkouts(samples: any[], heartRateSamples: any[] = []): AppleHealthWorkout[] {
  if (!Array.isArray(samples) || samples.length === 0) return [];

  return samples
    .filter((w) => w && extractDateStringFromPaths(w, WORKOUT_START_DATE_PATHS))
    .map((w) => {
      const workoutName = extractTextFromPaths(w, WORKOUT_NAME_PATHS);
      const rawWorkoutType = extractTextFromPaths(w, WORKOUT_ACTIVITY_TYPE_PATHS);
      const sportType = mapWorkoutType(rawWorkoutType, workoutName || undefined);

      const distanceMeasurement = extractMeasurementFromPaths(w, WORKOUT_DISTANCE_PATHS);
      const distanceMeters = distanceMeasurement.value === null ? 0 : normalizeDistanceToMeters(distanceMeasurement.value, distanceMeasurement.unit);

      const durationMeasurement = extractMeasurementFromPaths(w, WORKOUT_DURATION_PATHS);
      let durationSeconds = normalizeDurationToSeconds(durationMeasurement.value ?? 0, distanceMeters, durationMeasurement.unit);

      if (durationSeconds <= 0) {
        const window = getWorkoutWindow(w);
        if (window) durationSeconds = (window.end.getTime() - window.start.getTime()) / 1000;
      }

      const derivedAverageSpeed = durationSeconds > 0 && distanceMeters > 0 ? distanceMeters / durationSeconds : 0;
      const heartRateStats = getHeartRateStatsForWorkout(w, heartRateSamples);
      const startDate = extractDateStringFromPaths(w, WORKOUT_START_DATE_PATHS) || "";

      const avgHRMeasurement = extractMeasurementFromPaths(w, WORKOUT_AVG_HEART_RATE_PATHS);
      const maxHRMeasurement = extractMeasurementFromPaths(w, WORKOUT_MAX_HEART_RATE_PATHS);
      const elevationMeasurement = extractMeasurementFromPaths(w, WORKOUT_ELEVATION_PATHS);

      return {
        name: workoutName || `${sportType} Workout`,
        sport_type: sportType,
        distance: Math.round(distanceMeters),
        moving_time: Math.round(durationSeconds),
        elapsed_time: Math.round(durationSeconds),
        total_elevation_gain: Math.round(elevationMeasurement.value ?? 0),
        start_date: startDate,
        average_speed: Math.round(derivedAverageSpeed * 100) / 100,
        max_speed: 0,
        average_heartrate: avgHRMeasurement.value === null ? heartRateStats.average : Math.round(avgHRMeasurement.value),
        max_heartrate: maxHRMeasurement.value === null ? heartRateStats.max : Math.round(maxHRMeasurement.value),
        source: extractTextFromPaths(w, WORKOUT_SOURCE_PATHS) || "Apple Health",
      };
    })
    .filter((workout) => !!workout.start_date);
}

let _cachedStats: HealthStats | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

export function useAppleHealth(lang: Lang) {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [healthStats, setHealthStats] = useState<HealthStats | null>(_cachedStats);

  const readHealthData = useCallback(
    async (statsDays = 1, workoutDays = 7): Promise<{ stats: HealthStats; workouts: AppleHealthWorkout[] }> => {
      try {
        // Query 1: DAILY STATS (Quantity Types)
        const statsResult = await despia(`healthkit://read?types=${HEALTHKIT_DAILY_TYPES.join(",")}&days=${statsDays}`, ["healthkitResponse"]);
        const statsData = statsResult?.healthkitResponse || statsResult || {};

        // Query 2: WORKOUTS (Longer Window)
        const workoutResult = await despia(`healthkit://read?types=${HEALTHKIT_WORKOUT_TYPES}&days=${workoutDays}`, ["healthkitResponse"]);
        const workoutData = workoutResult?.healthkitResponse || workoutResult || {};

        const sleepSamples = statsData.HKCategoryTypeIdentifierSleepAnalysis || [];
        const calorieSamples = statsData.HKQuantityTypeIdentifierActiveEnergyBurned || [];
        const stepSamples = statsData.HKQuantityTypeIdentifierStepCount || [];
        const distanceSamples = statsData.HKQuantityTypeIdentifierDistanceWalkingRunning || [];

        // Check if distance is already KM (value < 500 heuristic)
        const rawDistance = Array.isArray(distanceSamples) ? sumQuantitySamples(distanceSamples) : 0;
        const distanceKm = rawDistance < 500 ? rawDistance : rawDistance / 1000;

        const stats: HealthStats = {
          sleepMinutes: parseSleepMinutes(sleepSamples),
          caloriesBurned: Math.round(Array.isArray(calorieSamples) ? sumQuantitySamples(calorieSamples) : 0),
          steps: Math.round(Array.isArray(stepSamples) ? sumQuantitySamples(stepSamples) : 0),
          walkRunDistanceKm: Math.round(distanceKm * 100) / 100,
        };

        const heartRateSamples = mergeSampleArrays(workoutData, ["HKQuantityTypeIdentifierHeartRate", "heartRate"]);
        const workoutSamples = mergeSampleArrays(workoutData, ["HKWorkoutType", "HKWorkoutTypeIdentifier"]);
        const workouts = parseWorkouts(workoutSamples, heartRateSamples);

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
          new Map(workouts.map((w) => [new Date(w.start_date).toISOString(), { ...w, start_date: new Date(w.start_date).toISOString() }])).values()
        );

        const startDates = normalizedWorkouts.map((w) => w.start_date);
        const { data: existingRows } = await supabase.from("apple_health_activities").select("id, start_date").eq("user_id", user.id).in("start_date", startDates);
        const existingMap = new Map((existingRows || []).map((r) => [new Date(r.start_date).toISOString(), r.id]));

        const rowsToInsert: any[] = [];
        const rowsToUpdate: any[] = [];

        normalizedWorkouts.forEach((w) => {
          const payload = { user_id: user.id, ...w };
          const existingId = existingMap.get(w.start_date);
          if (existingId) rowsToUpdate.push({ id: existingId, ...payload });
          else rowsToInsert.push(payload);
        });

        if (rowsToInsert.length > 0) await supabase.from("apple_health_activities").insert(rowsToInsert);
        if (rowsToUpdate.length > 0) {
          await Promise.all(rowsToUpdate.map((r) => supabase.from("apple_health_activities").update(r).eq("id", r.id)));
        }
        return rowsToInsert.length + rowsToUpdate.length;
      } catch (err) {
        console.error("[AppleHealth] Save error:", err);
        return 0;
      }
    },
    [user],
  );

  const requestAuthorization = useCallback(async () => {
    try {
      await despia(`healthkit://read?types=${HEALTHKIT_DAILY_TYPES.join(",")}&days=1`, ["healthkitResponse"]);
      return true;
    } catch { return false; }
  }, []);

  const connect = useCallback(async () => {
    if (!user) return false;
    setSyncing(true);
    const authorized = await requestAuthorization();
    if (!authorized) {
      toast.error(lang === "zh" ? "請開啟權限" : "Enable Health access");
      setSyncing(false);
      return false;
    }
    const { stats, workouts } = await readHealthData(1, 30); // 1 day stats, 30 days workouts
    await supabase.from("apple_health_connections").upsert({ user_id: user.id, updated_at: new Date().toISOString() });
    updateStats(stats);
    await saveWorkoutsToDb(workouts);
    setSyncing(false);
    return true;
  }, [user, lang, requestAuthorization, readHealthData, updateStats, saveWorkoutsToDb]);

  const syncHealthData = useCallback(async () => {
    if (!user || (_cachedStats && Date.now() - _cachedAt < CACHE_TTL)) return;
    setSyncing(true);
    const { stats, workouts } = await readHealthData(1, 7); // 1 day stats, 7 days workouts
    updateStats(stats);
    await saveWorkoutsToDb(workouts);
    setSyncing(false);
  }, [user, readHealthData, updateStats, saveWorkoutsToDb]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    await supabase.from("apple_health_connections").delete().eq("user_id", user.id);
    _cachedStats = null;
    setHealthStats(null);
  }, [user]);

  return { connect, disconnect, syncHealthData, syncing, healthStats };
}

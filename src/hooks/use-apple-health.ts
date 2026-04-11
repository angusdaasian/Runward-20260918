import { useState, useCallback } from "react";
import despia from "despia-native";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";

// --- Constants & Types ---

const HEALTHKIT_DAILY_TYPES = [
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
];

const HEALTHKIT_WORKOUT_TYPES = ["HKWorkoutType", "HKWorkoutTypeIdentifier", "HKQuantityTypeIdentifierHeartRate"].join(
  ",",
);

export interface HealthStats {
  sleepMinutes: number;
  caloriesBurned: number;
  steps: number;
  walkRunDistanceKm: number;
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

// --- Utility Functions ---

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

function sumQuantitySamples(samples: any[]): number {
  if (!Array.isArray(samples) || samples.length === 0) return 0;
  return samples.reduce((sum: number, s: any) => sum + (extractMeasurement(s).value || 0), 0);
}

function mergeSampleArrays(data: Record<string, any>, keys: string[]): any[] {
  const merged = keys.flatMap((key) => (Array.isArray(data[key]) ? data[key] : []));
  return Array.from(
    new Map(
      merged.map((sample, index) => {
        const sampleKey = JSON.stringify([
          sample?.id, sample?.uuid, sample?.startDate, sample?.start_date, sample?.start,
          sample?.endDate, sample?.end_date, sample?.end, sample?.date, index,
        ]);
        return [sampleKey, sample];
      }),
    ).values(),
  );
}

// Path constants
const WORKOUT_NAME_PATHS = [["name"], ["workoutName"], ["summary", "name"]];
const WORKOUT_ACTIVITY_TYPE_PATHS = [["workoutActivityType"], ["activityType"], ["sport_type"]];
const WORKOUT_START_DATE_PATHS = [["startDate"], ["start_date"], ["start"]];
const WORKOUT_END_DATE_PATHS = [["endDate"], ["end_date"], ["end"], ["date"]];
const WORKOUT_DISTANCE_PATHS = [["totalDistance"], ["total_distance"], ["distance"]];
const WORKOUT_DURATION_PATHS = [["duration"], ["moving_time"], ["elapsed_time"]];
const WORKOUT_AVG_HEART_RATE_PATHS = [["averageHeartRate"], ["average_heartrate"], ["statistics", "HKQuantityTypeIdentifierHeartRate", "average"]];
const WORKOUT_MAX_HEART_RATE_PATHS = [["maxHeartRate"], ["max_heartrate"], ["statistics", "HKQuantityTypeIdentifierHeartRate", "maximum"]];
const WORKOUT_ELEVATION_PATHS = [["totalElevationGain"], ["total_elevation_gain"]];
const WORKOUT_SOURCE_PATHS = [["sourceName"], ["source", "name"], ["bundleIdentifier"]];

// --- Specific Parsing Logic ---

function parseSleepMinutes(samples: any[]): number {
  if (!Array.isArray(samples) || samples.length === 0) return 0;
  let totalMinutes = 0;
  for (const sample of samples) {
    const start = sample.startDate || sample.start;
    const end = sample.endDate || sample.end;
    if (start && end) {
      const diffMin = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
      if (diffMin > 0 && diffMin < 1440) totalMinutes += diffMin;
    } else if (typeof sample.value === "number" && sample.value > 0) {
      totalMinutes += (sample.unit === "hr" || sample.unit === "hours") ? sample.value * 60 : sample.value;
    }
  }
  return Math.round(totalMinutes);
}

function getWorkoutWindow(workout: any) {
  const startRaw = extractDateStringFromPaths(workout, WORKOUT_START_DATE_PATHS);
  const endRaw = extractDateStringFromPaths(workout, WORKOUT_END_DATE_PATHS);
  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;
  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime()) || end <= start) return null;
  return { start, end };
}

function getHeartRateStatsForWorkout(workout: any, samples: any[]) {
  const window = getWorkoutWindow(workout);
  if (!window || !Array.isArray(samples) || samples.length === 0) return { average: null, max: null };
  const values = samples.map((s) => {
    const timestamp = s.date || s.startDate || s.start;
    const val = extractMeasurement(s).value;
    if (!timestamp || val === null || val <= 0) return null;
    const t = new Date(timestamp).getTime();
    return (t >= window.start.getTime() && t <= window.end.getTime()) ? val : null;
  }).filter((v): v is number => v !== null);
  if (values.length === 0) return { average: null, max: null };
  return { average: Math.round(values.reduce((a, b) => a + b, 0) / values.length), max: Math.round(Math.max(...values)) };
}

function normalizeDistanceToMeters(raw: number, unit?: string | null): number {
  if (raw <= 0) return 0;
  const u = normalizeUnitToken(unit);
  // HEURISTIC: Fixes 0.00km bug. If value is low (e.g. 15), convert KM to Meters.
  if (/^(km|kilometer|kilometers)$/.test(u) || (!u && raw < 500)) return raw * 1000;
  return raw;
}

function normalizeDurationToSeconds(raw: number, distanceMeters: number, unit?: string | null): number {
  if (raw <= 0) return 0;
  const u = normalizeUnitToken(unit);
  // HEURISTIC: Fixes 0:00:00 bug. If value is low but distance is high, convert Min to Sec.
  if (/^(min|mins|minute|minutes)$/.test(u) || (raw < 500 && distanceMeters > 500)) return raw * 60;
  return raw;
}

const WORKOUT_ACTIVITY_TYPE_MAP: Record<string, string> = {
  "13": "Ride",
  "24": "Hike",
  "37": "Run",
  "46": "Swim",
  "52": "Walk",
  "170": "Workout", // Changed from "Run" to "Workout" to fix the ID issue
  HKWorkoutActivityTypeCycling: "Ride",
  HKWorkoutActivityTypeHiking: "Hike",
  HKWorkoutActivityTypeRunning: "Run",
  HKWorkoutActivityTypeSwimming: "Swim",
  HKWorkoutActivityTypeTrailRunning: "TrailRun",
  HKWorkoutActivityTypeWalking: "Walk",
  HKWorkoutActivityTypeOther: "Workout",
};

function mapWorkoutType(hkType: unknown, fallbackName?: string): string {
  const rawType = String(hkType ?? "").trim();
  
  // 1. Check direct mapping (Fixes the "170" display)
  const mapped = WORKOUT_ACTIVITY_TYPE_MAP[rawType];
  if (mapped) return mapped;

  // 2. Keyword detection for unmapped types
  const lower = `${rawType} ${fallbackName || ""}`.toLowerCase();
  if (lower.includes("trail") && lower.includes("run")) return "TrailRun";
  if (lower.includes("run")) return "Run";
  if (lower.includes("walk")) return "Walk";
  if (lower.includes("hike")) return "Hike";
  if (lower.includes("cycle") || lower.includes("bike")) return "Ride";
  
  // 3. Cleanup prefix or use fallback
  return rawType.replace("HKWorkoutActivityType", "") || "Workout";
}

// Inside parseWorkouts, use this logic to prevent "Workout Workout"
const sportType = mapWorkoutType(rawWorkoutType, workoutName || undefined);

const workoutPayload = {
  // If workoutName is the same as sportType (e.g., both are "Workout"), 
  // just use one to avoid "Workout Workout"
  name: workoutName && workoutName !== sportType ? workoutName : sportType,
  sport_type: sportType,
  // ... other fields
};

function parseWorkouts(samples: any[], heartRateSamples: any[] = []): AppleHealthWorkout[] {
  if (!Array.isArray(samples)) return [];
  return samples
    .filter((w) => w && extractDateStringFromPaths(w, WORKOUT_START_DATE_PATHS))
    .map((w) => {
      const workoutName = extractTextFromPaths(w, WORKOUT_NAME_PATHS);
      const sportType = mapWorkoutType(extractTextFromPaths(w, WORKOUT_ACTIVITY_TYPE_PATHS), workoutName || undefined);
      const dMeas = extractMeasurementFromPaths(w, WORKOUT_DISTANCE_PATHS);
      const distanceMeters = normalizeDistanceToMeters(dMeas.value ?? 0, dMeas.unit);
      const tMeas = extractMeasurementFromPaths(w, WORKOUT_DURATION_PATHS);
      let durationSeconds = normalizeDurationToSeconds(tMeas.value ?? 0, distanceMeters, tMeas.unit);

      if (durationSeconds <= 0) {
        const window = getWorkoutWindow(w);
        if (window) durationSeconds = (window.end.getTime() - window.start.getTime()) / 1000;
      }

      const heartStats = getHeartRateStatsForWorkout(w, heartRateSamples);
      const avgHR = extractMeasurementFromPaths(w, WORKOUT_AVG_HEART_RATE_PATHS);
      const maxHR = extractMeasurementFromPaths(w, WORKOUT_MAX_HEART_RATE_PATHS);

      return {
        name: workoutName || `${sportType} Workout`,
        sport_type: sportType,
        distance: Math.round(distanceMeters),
        moving_time: Math.round(durationSeconds),
        elapsed_time: Math.round(durationSeconds),
        total_elevation_gain: Math.round(extractMeasurementFromPaths(w, WORKOUT_ELEVATION_PATHS).value ?? 0),
        start_date: extractDateStringFromPaths(w, WORKOUT_START_DATE_PATHS) || "",
        average_speed: durationSeconds > 0 ? Math.round((distanceMeters / durationSeconds) * 100) / 100 : 0,
        max_speed: 0,
        average_heartrate: avgHR.value ? Math.round(avgHR.value) : heartStats.average,
        max_heartrate: maxHR.value ? Math.round(maxHR.value) : heartStats.max,
        source: extractTextFromPaths(w, WORKOUT_SOURCE_PATHS) || "Apple Health",
      };
    })
    .filter((w) => !!w.start_date);
}

// --- Main Hook ---

let _cachedStats: HealthStats | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

export function useAppleHealth(lang: Lang) {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [healthStats, setHealthStats] = useState<HealthStats | null>(_cachedStats);

  const readHealthData = useCallback(async (statsDays = 1, workoutDays = 30) => {
    try {
      const statsRes = await despia(`healthkit://read?types=${HEALTHKIT_DAILY_TYPES.join(",")}&days=${statsDays}`, ["healthkitResponse"]);
      const sData = statsRes?.healthkitResponse || statsRes || {};
      const workRes = await despia(`healthkit://read?types=${HEALTHKIT_WORKOUT_TYPES}&days=${workoutDays}`, ["healthkitResponse"]);
      const wData = workRes?.healthkitResponse || workRes || {};

      const rawDist = sumQuantitySamples(sData.HKQuantityTypeIdentifierDistanceWalkingRunning || []);
      const distanceKm = rawDist < 500 ? rawDist : rawDist / 1000;

      const stats: HealthStats = {
        sleepMinutes: parseSleepMinutes(sData.HKCategoryTypeIdentifierSleepAnalysis || []),
        caloriesBurned: Math.round(sumQuantitySamples(sData.HKQuantityTypeIdentifierActiveEnergyBurned || [])),
        steps: Math.round(sumQuantitySamples(sData.HKQuantityTypeIdentifierStepCount || [])),
        walkRunDistanceKm: Math.round(distanceKm * 100) / 100,
      };

      const hrSamples = mergeSampleArrays(wData, ["HKQuantityTypeIdentifierHeartRate", "heartRate"]);
      const wSamples = mergeSampleArrays(wData, ["HKWorkoutType", "HKWorkoutTypeIdentifier"]);
      const workouts = parseWorkouts(wSamples, hrSamples);

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
    if (!user || workouts.length === 0) return 0;
    try {
      const normalizedWorkouts = Array.from(
        new Map(workouts.map((w) => [new Date(w.start_date).toISOString(), { ...w, start_date: new Date(w.start_date).toISOString() }])).values()
      );
      const startDates = normalizedWorkouts.map((w) => w.start_date);
      const { data: existingRows } = await supabase.from("apple_health_activities").select("id, start_date").eq("user_id", user.id).in("start_date", startDates);
      const existingMap = new Map((existingRows || []).map((r) => [new Date(r.start_date).toISOString(), r.id]));

      const toInsert: any[] = [];
      const toUpdate: any[] = [];

      normalizedWorkouts.forEach((w) => {
        const payload = { user_id: user.id, ...w };
        const id = existingMap.get(w.start_date);
        if (id) toUpdate.push({ id, ...payload });
        else toInsert.push(payload);
      });

      if (toInsert.length > 0) await supabase.from("apple_health_activities").insert(toInsert);
      if (toUpdate.length > 0) await Promise.all(toUpdate.map((r) => supabase.from("apple_health_activities").update(r).eq("id", r.id)));
      return toInsert.length + toUpdate.length;
    } catch (err) {
      console.error("[AppleHealth] Save error:", err);
      return 0;
    }
  }, [user]);

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
    const { stats, workouts } = await readHealthData(1, 30);
    await supabase.from("apple_health_connections").upsert({ user_id: user.id, updated_at: new Date().toISOString() });
    updateStats(stats);
    await saveWorkoutsToDb(workouts);
    setSyncing(false);
    return true;
  }, [user, lang, requestAuthorization, readHealthData, updateStats, saveWorkoutsToDb]);

  const syncHealthData = useCallback(async () => {
    if (!user || (_cachedStats && Date.now() - _cachedAt < CACHE_TTL)) return;
    setSyncing(true);
    const { stats, workouts } = await readHealthData(1, 7);
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

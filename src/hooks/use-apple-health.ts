import { useState, useCallback } from "react";
import despia from "despia-native";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";
import { remoteLog } from "@/lib/remoteLogger";

// --- Constants & Types ---

const HEALTHKIT_DAILY_TYPES = [
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
];

const HEALTHKIT_WORKOUT_TYPES = "HKWorkoutType,HKWorkoutTypeIdentifier";
const HEALTHKIT_HR_TYPE = "HKQuantityTypeIdentifierHeartRate";

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

const MEASUREMENT_VALUE_KEYS = [
  "value",
  "qty",
  "quantity",
  "doubleValue",
  "numericValue",
  "amount",
  "average",
  "avg",
  "maximum",
  "minimum",
  "sum",
];
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
  if (depth > 6 || field === null || field === undefined) return { value: null, unit: null };
  if (typeof field === "number" && Number.isFinite(field)) return { value: field, unit: null };
  if (typeof field === "string") return { value: parseNumericString(field), unit: null };
  if (typeof field !== "object") return { value: null, unit: null };
  if (Array.isArray(field)) {
    for (const item of field) {
      const nested = extractMeasurement(item, depth + 1);
      if (nested.value !== null) return nested;
    }
    return { value: null, unit: null };
  }

  const obj = field as Record<string, unknown>;
  const unit =
    MEASUREMENT_UNIT_KEYS.map((key) => obj[key]).find((value): value is string => typeof value === "string") || null;

  for (const key of MEASUREMENT_VALUE_KEYS) {
    if (!(key in obj)) continue;
    const nested = extractMeasurement(obj[key], depth + 1);
    if (nested.value !== null) return { value: nested.value, unit: unit || nested.unit };
  }

  for (const [key, value] of Object.entries(obj)) {
    if (/quantity|measurement|heartrate|heart_rate|bpm|elevation/i.test(key)) {
      const nested = extractMeasurement(value, depth + 1);
      if (nested.value !== null) return { value: nested.value, unit: unit || nested.unit };
    }
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

function toSampleArray(value: unknown, depth = 0): any[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => toSampleArray(item, depth + 1));
  }
  if (typeof value !== "object") return [];

  const obj = value as Record<string, unknown>;
  const nestedCollectionKeys = [
    "samples",
    "data",
    "results",
    "records",
    "items",
    "entries",
    "objects",
    "value",
    "quantity",
  ];
  const nestedCollections = nestedCollectionKeys.flatMap((key) => toSampleArray(obj[key], depth + 1));
  if (nestedCollections.length > 0) return nestedCollections;

  return [obj];
}

function mergeSampleArrays(data: Record<string, any>, keys: string[]): any[] {
  const sources = [data, data?.data, data?.healthkitResponse, data?.healthkitResponse?.data].filter(
    (source): source is Record<string, any> => !!source && typeof source === "object",
  );
  const merged = keys.flatMap((key) =>
    sources.flatMap((source) => [
      ...toSampleArray(source[key]),
      ...toSampleArray(source?.samples?.[key]),
      ...toSampleArray(source?.statistics?.[key]),
      ...toSampleArray(source?.data?.[key]),
    ]),
  );
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
          index,
        ]);
        return [sampleKey, sample];
      }),
    ).values(),
  );
}

function extractMeasurementByCandidateKeys(
  source: unknown,
  candidateKeys: string[],
  depth = 0,
  seen = new WeakSet<object>(),
): QuantityMeasurement {
  if (depth > 6 || !source || typeof source !== "object") return { value: null, unit: null };

  const obj = source as Record<string, unknown>;
  if (seen.has(obj)) return { value: null, unit: null };
  seen.add(obj);

  for (const [key, value] of Object.entries(obj)) {
    if (candidateKeys.includes(key)) {
      const measurement = extractMeasurement(value);
      if (measurement.value !== null) return measurement;
    }
  }

  for (const value of Object.values(obj)) {
    const nested = extractMeasurementByCandidateKeys(value, candidateKeys, depth + 1, seen);
    if (nested.value !== null) return nested;
  }

  return { value: null, unit: null };
}

function extractSampleTimestamp(sample: unknown): string | null {
  return extractDateStringFromPaths(sample, [
    ["timestamp"],
    ["date"],
    ["startDate"],
    ["start_date"],
    ["start"],
    ["endDate"],
    ["end_date"],
    ["end"],
  ]);
}

// Path constants
const WORKOUT_NAME_PATHS = [["name"], ["workoutName"], ["summary", "name"]];
const WORKOUT_ACTIVITY_TYPE_PATHS = [["workoutActivityType"], ["activityType"], ["sport_type"]];
const WORKOUT_START_DATE_PATHS = [["startDate"], ["start_date"], ["start"]];
const WORKOUT_END_DATE_PATHS = [["endDate"], ["end_date"], ["end"], ["date"]];
const WORKOUT_DISTANCE_PATHS = [["totalDistance"], ["total_distance"], ["distance"]];
const WORKOUT_DURATION_PATHS = [["duration"], ["moving_time"], ["elapsed_time"]];
const WORKOUT_AVG_HEART_RATE_PATHS = [
  // Direct top-level keys
  ["averageHeartRate"],
  ["average_heartrate"],
  ["avgHeartRate"],
  ["avg_heartrate"],
  // Nested under heartRate/heart_rate
  ["heartRate", "average"],
  ["heart_rate", "average"],
  // Statistics nested paths
  ["statistics", "heartRate", "average"],
  ["statistics", "heart_rate", "average"],
  ["statistics", "HKQuantityTypeIdentifierHeartRate", "average"],
  // Garmin/Apple deeper statistics paths (averageQuantity.doubleValue)
  ["statistics", "HKQuantityTypeIdentifierHeartRate", "averageQuantity"],
  ["statistics", "HKQuantityTypeIdentifierHeartRate", "averageQuantity", "doubleValue"],
  ["statistics", "HKQuantityTypeIdentifierHeartRate", "avg"],
  // Metadata fallback (some third-party apps store HR here)
  ["metadata", "HKMetadataKeyAverageHeartRate"],
  ["metadata", "_HKPrivateMetadataKeyAverageHeartRate"],
];
const WORKOUT_MAX_HEART_RATE_PATHS = [
  // Direct top-level keys
  ["maxHeartRate"],
  ["max_heartrate"],
  ["maximumHeartRate"],
  ["maximum_heartrate"],
  // Nested under heartRate/heart_rate
  ["heartRate", "maximum"],
  ["heartRate", "max"],
  ["heart_rate", "maximum"],
  ["heart_rate", "max"],
  // Statistics nested paths
  ["statistics", "heartRate", "maximum"],
  ["statistics", "heart_rate", "maximum"],
  ["statistics", "HKQuantityTypeIdentifierHeartRate", "maximum"],
  // Garmin/Apple deeper statistics paths (maximumQuantity.doubleValue)
  ["statistics", "HKQuantityTypeIdentifierHeartRate", "maximumQuantity"],
  ["statistics", "HKQuantityTypeIdentifierHeartRate", "maximumQuantity", "doubleValue"],
  ["statistics", "HKQuantityTypeIdentifierHeartRate", "max"],
  // Metadata fallback
  ["metadata", "HKMetadataKeyMaximumHeartRate"],
  ["metadata", "_HKPrivateMetadataKeyMaximumHeartRate"],
];
const WORKOUT_ELEVATION_PATHS = [
  // Direct top-level keys
  ["totalElevationGain"],
  ["total_elevation_gain"],
  ["totalElevationAscended"],
  ["elevationAscended"],
  ["elevationGain"],
  ["elevation_gain"],
  // Apple's official metadata key (HKMetadataKeyElevationAscended)
  // Value is an HKQuantity stored as a number or nested object
  ["metadata", "HKMetadataKeyElevationAscended"],
  ["metadata", "HKMetadataKeyElevationAscended", "doubleValue"],
  ["metadata", "HKMetadataKeyElevationAscended", "value"],
  ["metadata", "HKMetadataKeyElevationAscended", "quantity"],
  // Statistics nested paths
  ["statistics", "elevationGain", "sum"],
  ["statistics", "HKQuantityTypeIdentifierElevationAscended", "sum"],
  ["statistics", "HKQuantityTypeIdentifierElevationAscended", "sumQuantity"],
  ["statistics", "HKQuantityTypeIdentifierElevationAscended", "sumQuantity", "doubleValue"],
  ["statistics", "HKQuantityTypeIdentifierFlightsClimbed", "sum"],
];
const WORKOUT_SOURCE_PATHS = [["sourceName"], ["source", "name"], ["bundleIdentifier"]];

const HEART_RATE_SAMPLE_KEYS = [
  "heartRate",
  "heart_rate",
  "bpm",
  "quantity",
  "averageQuantity",
  "maximumQuantity",
  "mostRecentQuantity",
];
const HEART_RATE_AVERAGE_KEYS = ["averageHeartRate", "average_heartrate", "avgHeartRate", "avg_heartrate"];
const HEART_RATE_MAX_KEYS = ["maxHeartRate", "max_heartrate", "maximumHeartRate", "maximum_heartrate", "peakHeartRate"];
const ELEVATION_KEYS = [
  "totalElevationGain",
  "total_elevation_gain",
  "totalElevationAscended",
  "elevationAscended",
  "elevationGain",
  "elevation_gain",
  "HKMetadataKeyElevationAscended",
  "sumQuantity",
  "sum",
];

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
      totalMinutes += sample.unit === "hr" || sample.unit === "hours" ? sample.value * 60 : sample.value;
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

  const BUFFER_MS = 30_000;
  const windowStart = window.start.getTime() - BUFFER_MS;
  const windowEnd = window.end.getTime() + BUFFER_MS;

  const flatSamples = samples.flatMap((sample) => toSampleArray(sample));

  // 1) Precise time-window matching (original logic)
  const values = flatSamples
    .map((s) => {
      const timestamp = extractSampleTimestamp(s);
      const directMeasurement = extractMeasurement(s);
      const nestedMeasurement =
        directMeasurement.value !== null
          ? directMeasurement
          : extractMeasurementByCandidateKeys(s, HEART_RATE_SAMPLE_KEYS);
      const val = nestedMeasurement.value;
      if (!timestamp || val === null || val <= 0) return null;
      const t = new Date(timestamp).getTime();
      return t >= windowStart && t <= windowEnd ? val : null;
    })
    .filter((v): v is number => v !== null);

  if (values.length > 0) {
    return {
      average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      max: Math.round(Math.max(...values)),
    };
  }

  // 2) Fallback: match by same calendar day (UTC) for daily-averaged HR data
  const workoutDateUTC = window.start.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const dayValues = flatSamples
    .map((s) => {
      const timestamp = extractSampleTimestamp(s);
      const measurement = extractMeasurement(s);
      const val =
        measurement.value !== null
          ? measurement.value
          : extractMeasurementByCandidateKeys(s, HEART_RATE_SAMPLE_KEYS).value;
      if (!timestamp || val === null || val <= 0) return null;
      const sampleDateUTC = new Date(timestamp).toISOString().slice(0, 10);
      return sampleDateUTC === workoutDateUTC ? val : null;
    })
    .filter((v): v is number => v !== null);

  if (dayValues.length > 0) {
    return {
      average: Math.round(dayValues.reduce((a, b) => a + b, 0) / dayValues.length),
      max: null, // daily averages don't give us a meaningful max
    };
  }

  return { average: null, max: null };
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

      // Priority: 1) workout statistics object, 2) deep key search, 3) manual HR sample filtering
      const avgHRDirect = extractMeasurementFromPaths(w, WORKOUT_AVG_HEART_RATE_PATHS);
      const avgHRDeep =
        avgHRDirect.value !== null ? avgHRDirect : extractMeasurementByCandidateKeys(w, HEART_RATE_AVERAGE_KEYS);
      const maxHRDirect = extractMeasurementFromPaths(w, WORKOUT_MAX_HEART_RATE_PATHS);
      const maxHRDeep =
        maxHRDirect.value !== null ? maxHRDirect : extractMeasurementByCandidateKeys(w, HEART_RATE_MAX_KEYS);

      // Only fall back to manual sample filtering if statistics didn't yield results
      const heartStats =
        avgHRDeep.value === null || maxHRDeep.value === null
          ? getHeartRateStatsForWorkout(w, heartRateSamples)
          : { average: null, max: null };

      const avgHR = avgHRDeep.value !== null ? avgHRDeep : { value: heartStats.average, unit: null };
      const maxHR = maxHRDeep.value !== null ? maxHRDeep : { value: heartStats.max, unit: null };
      const elevationDirect = extractMeasurementFromPaths(w, WORKOUT_ELEVATION_PATHS);
      const elevation =
        elevationDirect.value !== null ? elevationDirect : extractMeasurementByCandidateKeys(w, ELEVATION_KEYS);

      return {
        name:
          workoutName && workoutName !== sportType && !workoutName.toLowerCase().includes(sportType.toLowerCase())
            ? workoutName
            : sportType,
        sport_type: sportType,
        distance: Math.round(distanceMeters),
        moving_time: Math.round(durationSeconds),
        elapsed_time: Math.round(durationSeconds),
        total_elevation_gain: Math.round(elevation.value ?? 0),
        start_date: extractDateStringFromPaths(w, WORKOUT_START_DATE_PATHS) || "",
        average_speed: durationSeconds > 0 ? Math.round((distanceMeters / durationSeconds) * 100) / 100 : 0,
        max_speed: 0,
        average_heartrate: avgHR.value !== null ? Math.round(avgHR.value) : heartStats.average,
        max_heartrate: maxHR.value !== null ? Math.round(maxHR.value) : heartStats.max,
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
      // Logger self-test: tiny ping to verify infrastructure works
      const ping = await remoteLog("AppleHealth", "logger_ping", {
        timestamp: new Date().toISOString(),
        statsDays,
        workoutDays,
      });
      console.log("[AppleHealth] logger_ping result:", ping);

      // 1) Daily stats
      const statsRes = await despia(`healthkit://read?types=${HEALTHKIT_DAILY_TYPES.join(",")}&days=${statsDays}`, [
        "healthkitResponse",
      ]);
      const sData = statsRes?.healthkitResponse || statsRes || {};

      // 2) Workout records (separate from HR)
      const workRes = await despia(`healthkit://read?types=${HEALTHKIT_WORKOUT_TYPES}&days=${workoutDays}`, [
        "healthkitResponse",
      ]);
      const wData = workRes?.healthkitResponse || workRes || {};

      // 3) Heart rate samples — SEPARATE explicit request
      let hrData: Record<string, any> = {};
      try {
        const hrRes = await despia(`healthkit://read?types=${HEALTHKIT_HR_TYPE}&days=${Math.max(workoutDays, 60)}`, [
          "healthkitResponse",
        ]);
        hrData = hrRes?.healthkitResponse || hrRes || {};
        console.log("[AppleHealth] Separate HR read keys:", Object.keys(hrData));
      } catch (hrErr) {
        console.warn("[AppleHealth] Separate HR read failed, falling back to workout payload:", hrErr);
      }

      const rawDist = sumQuantitySamples(sData.HKQuantityTypeIdentifierDistanceWalkingRunning || []);
      const distanceKm = rawDist < 500 ? rawDist : rawDist / 1000;

      const stats: HealthStats = {
        sleepMinutes: parseSleepMinutes(sData.HKCategoryTypeIdentifierSleepAnalysis || []),
        caloriesBurned: Math.round(sumQuantitySamples(sData.HKQuantityTypeIdentifierActiveEnergyBurned || [])),
        steps: Math.round(sumQuantitySamples(sData.HKQuantityTypeIdentifierStepCount || [])),
        walkRunDistanceKm: Math.round(distanceKm * 100) / 100,
      };

      // Merge HR samples from both workout payload and separate HR read
      const hrFromWorkout = mergeSampleArrays(wData, ["HKQuantityTypeIdentifierHeartRate", "heartRate"]);
      const hrFromSeparate = mergeSampleArrays(hrData, ["HKQuantityTypeIdentifierHeartRate", "heartRate", "samples"]);
      const hrSamples = [...hrFromWorkout, ...hrFromSeparate];

      const wSamples = mergeSampleArrays(wData, ["HKWorkoutType", "HKWorkoutTypeIdentifier"]);
      console.log("[AppleHealth] Workout payload keys:", Object.keys(wData || {}));
      console.log(
        "[AppleHealth] HR from workout:",
        hrFromWorkout.length,
        "HR from separate:",
        hrFromSeparate.length,
        "Total HR:",
        hrSamples.length,
      );
      console.log("[AppleHealth] Workout samples:", wSamples.length);

      // Remote log: raw workout objects (first 5)
      await remoteLog("AppleHealth", "raw_workout_samples", {
        workoutPayloadKeys: Object.keys(wData || {}),
        hrFromWorkoutCount: hrFromWorkout.length,
        hrFromSeparateCount: hrFromSeparate.length,
        totalHrSamples: hrSamples.length,
        workoutSampleCount: wSamples.length,
        rawWorkouts: wSamples.slice(0, 5),
      });

      // Remote log: HR samples snapshot
      await remoteLog("AppleHealth", "hr_samples_snapshot", {
        firstHrSamples: hrSamples.slice(0, 10),
        hrPayloadKeys: Object.keys(hrData || {}),
        hrPayloadExcerpt: JSON.stringify(hrData)?.substring(0, 3000),
      });

      // Debug: Log first 3 raw workout objects fully for inspection
      wSamples.slice(0, 3).forEach((w, i) => {
        console.log(`[AppleHealth] Raw workout[${i}] FULL:`, JSON.stringify(w)?.substring(0, 2000));
      });

      if (hrSamples.length > 0) {
        console.log("[AppleHealth] First HR sample:", JSON.stringify(hrSamples[0])?.substring(0, 800));
      } else {
        console.log("[AppleHealth] NO HR samples found in either payload");
        console.log("[AppleHealth] Workout payload excerpt:", JSON.stringify(wData)?.substring(0, 1500));
        console.log("[AppleHealth] HR payload excerpt:", JSON.stringify(hrData)?.substring(0, 1500));
      }

      const workouts = parseWorkouts(wSamples, hrSamples);

      // Remote log: parsed results
      await remoteLog("AppleHealth", "parsed_workouts", {
        count: workouts.length,
        workouts: workouts.slice(0, 5).map((w) => ({
          name: w.name,
          sport_type: w.sport_type,
          start_date: w.start_date,
          average_heartrate: w.average_heartrate,
          max_heartrate: w.max_heartrate,
          total_elevation_gain: w.total_elevation_gain,
          distance: w.distance,
          source: w.source,
        })),
      });

      if (workouts.length > 0) {
        console.log(
          "[AppleHealth] First parsed workout HR:",
          workouts[0].average_heartrate,
          workouts[0].max_heartrate,
          "elev:",
          workouts[0].total_elevation_gain,
        );
      }

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

  const saveWorkoutsToDb = useCallback(
    async (workouts: AppleHealthWorkout[]) => {
      if (!user || workouts.length === 0) return 0;
      try {
        const normalizedWorkouts = Array.from(
          new Map(
            workouts.map((w) => [
              new Date(w.start_date).toISOString(),
              { ...w, start_date: new Date(w.start_date).toISOString() },
            ]),
          ).values(),
        );
        const startDates = normalizedWorkouts.map((w) => w.start_date);
        const { data: existingRows } = await supabase
          .from("apple_health_activities")
          .select("id, start_date")
          .eq("user_id", user.id)
          .in("start_date", startDates);
        const existingMap = new Map((existingRows || []).map((r) => [new Date(r.start_date).toISOString(), r.id]));

        const toInsert: any[] = [];
        const toUpdate: any[] = [];
        const newActivities: { distance: number; moving_time: number; sport_type: string }[] = [];

        normalizedWorkouts.forEach((w) => {
          const payload = { user_id: user.id, ...w };
          const id = existingMap.get(w.start_date);
          if (id) toUpdate.push({ id, ...payload });
          else {
            toInsert.push(payload);
            newActivities.push({ distance: w.distance, moving_time: w.moving_time, sport_type: w.sport_type });
          }
        });

        if (toInsert.length > 0) await supabase.from("apple_health_activities").insert(toInsert);
        if (toUpdate.length > 0)
          await Promise.all(toUpdate.map((r) => supabase.from("apple_health_activities").update(r).eq("id", r.id)));

        // Award XP, compute training score, and send notifications for new activities
        if (newActivities.length > 0) {
          try {
            const { error: postSyncError } = await supabase.functions.invoke("apple-health-post-sync", {
              body: { newActivities },
            });
            if (postSyncError) console.error("[AppleHealth] Post-sync error:", postSyncError);
          } catch (err) {
            console.error("[AppleHealth] Post-sync call failed:", err);
          }
        }

        return toInsert.length + toUpdate.length;
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
    } catch {
      return false;
    }
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

  return { connect, disconnect, syncHealthData, syncing, healthStats, readHealthData, saveWorkoutsToDb };
}

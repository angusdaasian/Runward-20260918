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

// Module-level cache to persist across remounts (tab switches)
let _cachedStats: HealthStats | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useAppleHealth(lang: Lang) {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [healthStats, setHealthStats] = useState<HealthStats | null>(_cachedStats);

  const readHealthData = useCallback(async (days = 1): Promise<HealthStats> => {
    try {
      const result = await despia(
        `healthkit://read?types=${HEALTHKIT_READ_TYPES}&days=${days}`,
        ["healthkitResponse"],
      );

      console.log("[AppleHealth] Raw response:", JSON.stringify(result));

      const data = result?.healthkitResponse || result || {};

      // Despia returns keys matching the HealthKit type identifiers
      const sleepSamples = data.HKCategoryTypeIdentifierSleepAnalysis || data.sleepAnalysis || data.sleep || [];
      const calorieSamples = data.HKQuantityTypeIdentifierActiveEnergyBurned || [];
      const stepSamples = data.HKQuantityTypeIdentifierStepCount || [];
      const distanceSamples = data.HKQuantityTypeIdentifierDistanceWalkingRunning || [];

      const rawCalories = Array.isArray(calorieSamples) ? sumQuantitySamples(calorieSamples) : (typeof calorieSamples === "number" ? calorieSamples : 0);
      const rawSteps = Array.isArray(stepSamples) ? sumQuantitySamples(stepSamples) : (typeof stepSamples === "number" ? stepSamples : 0);
      const rawDistance = Array.isArray(distanceSamples) ? sumQuantitySamples(distanceSamples) : (typeof distanceSamples === "number" ? distanceSamples : 0);

      // HealthKit always returns distance in meters — convert to km
      const distanceKm = Math.round((rawDistance / 1000) * 100) / 100;

      const stats: HealthStats = {
        sleepMinutes: parseSleepMinutes(sleepSamples),
        caloriesBurned: Math.round(rawCalories),
        steps: Math.round(rawSteps),
        walkRunDistanceKm: distanceKm,
      };

      console.log("[AppleHealth] Parsed stats:", stats);
      return stats;
    } catch (err) {
      console.error("[AppleHealth] Read error:", err);
      return { sleepMinutes: 0, caloriesBurned: 0, steps: 0, walkRunDistanceKm: 0 };
    }
  }, []);

  const updateStats = useCallback((stats: HealthStats) => {
    _cachedStats = stats;
    _cachedAt = Date.now();
    setHealthStats(stats);
  }, []);

  const connect = useCallback(async () => {
    if (!user) return false;
    setSyncing(true);
    try {
      const stats = await readHealthData(1);
      await supabase
        .from("apple_health_connections")
        .upsert({ user_id: user.id, connected_at: new Date().toISOString() }, { onConflict: "user_id" });
      updateStats(stats);
      setSyncing(false);
      return true;
    } catch (err) {
      console.error("[AppleHealth] Connect error:", err);
      toast.error(lang === "zh" ? "請在設定中開啟健康資料存取權限" : "Please enable Health access in Settings");
      setSyncing(false);
      return false;
    }
  }, [user, lang, readHealthData, updateStats]);

  const syncHealthData = useCallback(async () => {
    if (!user) return;
    // Skip if cache is fresh
    if (_cachedStats && Date.now() - _cachedAt < CACHE_TTL) {
      setHealthStats(_cachedStats);
      return;
    }
    setSyncing(true);
    try {
      const stats = await readHealthData(1);
      updateStats(stats);
    } catch {
      console.warn("[AppleHealth] Sync failed");
    }
    setSyncing(false);
  }, [user, readHealthData, updateStats]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    await supabase.from("apple_health_connections").delete().eq("user_id", user.id);
    _cachedStats = null;
    _cachedAt = 0;
    setHealthStats(null);
  }, [user]);

  return { connect, disconnect, syncHealthData, syncing, healthStats };
}

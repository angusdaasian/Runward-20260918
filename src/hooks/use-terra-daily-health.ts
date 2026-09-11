import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";

export interface TerraConnectionRow {
  provider: string; // GARMIN, COROS, SUUNTO, POLAR, ...
}

export interface TerraDailyHealthRow {
  provider: string;
  date: string;
  vo2max: number | null;
  resting_hr: number | null;
  sleep_seconds: number | null;
  sleep_score: number | null;
  steps: number | null;
  hrv: number | null;
  calories: number | null;
  distance_metres: number | null;
  active_seconds: number | null;
  fetched_at: string;
}

export function useTerraConnections() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["terra-connections-list", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<TerraConnectionRow[]> => {
      const { data, error } = await supabase
        .from("terra_connections")
        .select("provider")
        .eq("user_id", user!.id)
        .eq("active", true);
      if (error) {
        console.error("[useTerraConnections]", error);
        return [];
      }
      return (data ?? []) as TerraConnectionRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useTerraDailyHealth() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["terra-daily-health", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<TerraDailyHealthRow[]> => {
      const { data, error } = await supabase
        .from("terra_daily_health")
        .select("provider, date, vo2max, resting_hr, sleep_seconds, sleep_score, steps, hrv, calories, distance_metres, active_seconds, fetched_at")
        .eq("user_id", user!.id)
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as TerraDailyHealthRow[];
    },
    staleTime: 60 * 1000,
  });
}

export interface TerraTodayStats {
  steps: number;
  caloriesBurned: number;
  walkRunDistanceKm: number;
  sleepMinutes: number;
}

/**
 * Today's daily stats from Terra wearable webhooks (steps / calories / distance /
 * sleep). Returns null when nothing usable has arrived for today, so callers can
 * fall back to Apple Health.
 */
export function useTerraTodayStats(): TerraTodayStats | null {
  const { data: rows } = useTerraDailyHealth();

  return useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todays = rows.filter((r) => (r.date ?? "").slice(0, 10) === today);
    if (todays.length === 0) return null;

    const best = <K extends keyof TerraDailyHealthRow>(key: K): number | null => {
      let max: number | null = null;
      for (const r of todays) {
        const v = r[key];
        if (typeof v === "number" && isFinite(v) && (max == null || v > max)) max = v;
      }
      return max;
    };

    const steps = best("steps");
    const calories = best("calories");
    const distance = best("distance_metres");
    // Sleep for "today" is last night's sleep, which may be stored on today's row.
    const sleepSeconds = best("sleep_seconds");

    if (steps == null && calories == null && distance == null) return null;

    return {
      steps: steps ?? 0,
      caloriesBurned: calories != null ? Math.round(calories) : 0,
      walkRunDistanceKm: distance != null ? Math.round((distance / 1000) * 100) / 100 : 0,
      sleepMinutes: sleepSeconds != null ? Math.round(sleepSeconds / 60) : 0,
    };
  }, [rows]);
}


export function useRefreshTerraDailyHealth(lang: Lang) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(
    async (provider?: string) => {
      if (!user) return false;
      setRefreshing(true);
      try {
        const { data, error } = await supabase.functions.invoke("terra-sync", {
          body: { healthOnly: true, ...(provider ? { provider } : {}) },
        });
        if (error || !data?.ok) {
          toast.error(
            lang === "zh" ? "健康資料同步失敗" : "Health sync failed",
          );
          return false;
        }
        const h = (data as any)?.health ?? {};
        const parts: string[] = [];
        if (lang === "zh") {
          if (h.sleep > 0) parts.push("睡眠");
          if (h.vo2max > 0) parts.push("VO₂max");
          if (h.resting_hr > 0) parts.push("靜息心率");
          if (h.hrv > 0) parts.push("HRV");
        } else {
          if (h.sleep > 0) parts.push("sleep");
          if (h.vo2max > 0) parts.push("VO₂max");
          if (h.resting_hr > 0) parts.push("RHR");
          if (h.hrv > 0) parts.push("HRV");
        }
        if (parts.length > 0) {
          toast.success(
            (lang === "zh" ? "已更新:" : "Updated: ") + parts.join(lang === "zh" ? "、" : ", "),
          );
        } else {
          toast.success(
            lang === "zh" ? "健康資料已更新" : "Health stats updated",
          );
        }
        queryClient.invalidateQueries({ queryKey: ["terra-daily-health", user.id] });
        return true;
      } catch (e) {
        console.error("[refresh terra health]", e);
        toast.error(
          lang === "zh" ? "健康資料同步失敗" : "Health sync failed",
        );
        return false;
      } finally {
        setRefreshing(false);
      }
    },
    [user, lang, queryClient],
  );

  return { refresh, refreshing };
}

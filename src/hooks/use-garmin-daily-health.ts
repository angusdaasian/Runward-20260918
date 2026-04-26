import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";

export interface GarminDailyHealth {
  date: string; // YYYY-MM-DD
  vo2max: number | null;
  resting_hr: number | null;
  sleep_seconds: number | null;
  sleep_score: number | null;
  fetched_at: string;
}

/** Whether the user has an active Garmin connection — used to decide if the
 *  Garmin health card should render at all in Analytics. */
export function useHasGarminConnection() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["garmin-connection-exists", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("garmin_connections")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) {
        console.error("[useHasGarminConnection]", error);
        return false;
      }
      return !!data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Latest 7 days of Garmin daily health stats for the current user. */
export function useGarminDailyHealth() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["garmin-daily-health", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<GarminDailyHealth[]> => {
      const { data, error } = await supabase
        .from("garmin_daily_health")
        .select("date, vo2max, resting_hr, sleep_seconds, sleep_score, fetched_at")
        .eq("user_id", user!.id)
        .order("date", { ascending: false })
        .limit(7);
      if (error) throw error;
      return (data ?? []) as GarminDailyHealth[];
    },
    staleTime: 60 * 1000,
  });
}

/** Manual refresh — calls the same edge function the cron uses, but as the user. */
export function useRefreshGarminDailyHealth(lang: Lang) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return false;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("garmin-daily-health-sync", {
        body: { source: "manual" },
      });
      if (error || !data?.success) {
        const reauth = (data as any)?.reauth_required;
        if (reauth) {
          toast.error(
            lang === "zh"
              ? "Garmin 連結已過期,請重新登入"
              : "Garmin sign-in expired — please reconnect",
          );
        } else {
          toast.error(
            lang === "zh"
              ? "Garmin 健康資料同步失敗"
              : "Garmin health sync failed",
          );
        }
        return false;
      }
      toast.success(
        lang === "zh" ? "Garmin 健康資料已更新" : "Garmin health stats updated",
      );
      queryClient.invalidateQueries({ queryKey: ["garmin-daily-health", user.id] });
      return true;
    } catch (e) {
      console.error("[refresh garmin health]", e);
      toast.error(
        lang === "zh" ? "Garmin 健康資料同步失敗" : "Garmin health sync failed",
      );
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [user, lang, queryClient]);

  return { refresh, refreshing };
}

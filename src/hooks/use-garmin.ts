import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";

export function useGarmin(lang: Lang) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const invalidateActivities = useCallback(() => {
    if (!user) return;
    queryClient.invalidateQueries({ queryKey: ["garmin-activities", user.id] });
    queryClient.invalidateQueries({ queryKey: ["strava-activities", user.id] });
    queryClient.invalidateQueries({ queryKey: ["apple-health-activities", user.id] });
    queryClient.invalidateQueries({ queryKey: ["user-profile", user.id] });
    queryClient.invalidateQueries({ queryKey: ["fitness-connection", user.id] });
    queryClient.invalidateQueries({ queryKey: ["planned-workouts", user.id] });
  }, [user, queryClient]);

  const connect = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!user) return false;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("garmin-sync", {
        body: { action: "login", email, password },
      });
      if (error || !data?.success) {
        const msg = data?.error || "Garmin authentication failed";
        toast.error(lang === "zh" ? "Garmin 連結失敗" : msg);
        return false;
      }
      toast.success(lang === "zh" ? "Garmin 已連結！" : "Garmin connected!");
      invalidateActivities();
      return true;
    } catch (err) {
      console.error("Garmin connect error:", err);
      toast.error(lang === "zh" ? "Garmin 連結失敗" : "Garmin connection failed");
      return false;
    } finally {
      setConnecting(false);
    }
  }, [user, lang]);

  const syncActivities = useCallback(async (days = 30): Promise<boolean> => {
    if (!user) return false;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("garmin-sync", {
        body: { action: "sync", days },
      });
      if (error || !data?.success) {
        toast.error(lang === "zh" ? "同步失敗" : "Sync failed");
        return false;
      }

      const detailsFetched = data.details_fetched ?? 0;
      toast.success(
        lang === "zh"
          ? `已同步 ${data.synced} 筆活動${detailsFetched > 0 ? `，已取得 ${detailsFetched} 筆詳細資料` : ""}`
          : `Synced ${data.synced} activities${detailsFetched > 0 ? `, ${detailsFetched} details fetched` : ""}`
      );

      invalidateActivities();
      return true;
    } catch (err) {
      console.error("Garmin sync error:", err);
      toast.error(lang === "zh" ? "同步失敗" : "Sync failed");
      return false;
    } finally {
      setSyncing(false);
    }
  }, [user, lang]);

  const disconnect = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await supabase.functions.invoke("garmin-sync", {
        body: { action: "disconnect" },
      });
      if (error || !data?.success) {
        toast.error(lang === "zh" ? "中斷連結失敗" : "Failed to disconnect");
        return false;
      }
      toast.success(lang === "zh" ? "已中斷 Garmin 連結" : "Garmin disconnected");
      invalidateActivities();
      return true;
    } catch (err) {
      console.error("Garmin disconnect error:", err);
      toast.error(lang === "zh" ? "中斷連結失敗" : "Failed to disconnect");
      return false;
    }
  }, [user, lang]);

  return { connect, syncActivities, disconnect, connecting, syncing };
}

import { useState, useCallback } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";

async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (typeof payload?.error === "string" && payload.error.trim()) {
        return payload.error;
      }
    } catch {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return null;
}

export function useGarmin(lang: Lang) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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

  const syncActivities = useCallback(async (days = 30): Promise<boolean> => {
    if (!user) return false;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("garmin-sync", {
        body: { action: "sync", days },
      });
      if (error || !data?.success) {
        const msg = data?.error || await extractFunctionErrorMessage(error) || "Sync failed";
        if (data?.reauth_required) {
          toast.error(
            lang === "zh"
              ? "Garmin 連結已過期,請重新登入"
              : "Garmin sign-in expired — please reconnect"
          );
        } else {
          toast.error(lang === "zh" ? `同步失敗：${msg}` : msg);
        }
        return false;
      }

      const synced = data.synced ?? 0;
      const detailsFetched = data.details_fetched ?? 0;
      if (synced === 0 && detailsFetched === 0) {
        toast.success(
          lang === "zh"
            ? "已是最新！所有活動都已同步"
            : "You're up to date! All activities are already synced",
          { duration: 4000 }
        );
      } else {
        toast.success(
          lang === "zh"
            ? `同步成功！已同步 ${synced} 筆活動${detailsFetched > 0 ? `,已取得 ${detailsFetched} 筆詳細資料` : ""}`
            : `Sync successful! ${synced} activities synced${detailsFetched > 0 ? `, ${detailsFetched} details fetched` : ""}`,
          { duration: 4000 }
        );
      }

      invalidateActivities();
      return true;
    } catch (err) {
      console.error("Garmin sync error:", err);
      const msg = await extractFunctionErrorMessage(err);
      toast.error(lang === "zh" ? `同步失敗${msg ? `:${msg}` : ""}` : msg || "Sync failed");
      return false;
    } finally {
      setSyncing(false);
    }
  }, [user, lang, invalidateActivities]);

  const disconnect = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await supabase.functions.invoke("garmin-sync", {
        body: { action: "disconnect" },
      });
      if (error || !data?.success) {
        const msg = data?.error || await extractFunctionErrorMessage(error) || "Failed to disconnect";
        toast.error(lang === "zh" ? `中斷連結失敗:${msg}` : msg);
        return false;
      }
      toast.success(lang === "zh" ? "已中斷 Garmin 連結" : "Garmin disconnected");
      invalidateActivities();
      return true;
    } catch (err) {
      console.error("Garmin disconnect error:", err);
      const msg = await extractFunctionErrorMessage(err);
      toast.error(lang === "zh" ? `中斷連結失敗${msg ? `:${msg}` : ""}` : msg || "Failed to disconnect");
      return false;
    }
  }, [user, lang, invalidateActivities]);

  return { syncActivities, disconnect, syncing };
}

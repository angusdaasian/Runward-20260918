import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";

export function useGarmin(lang: Lang) {
  const { user } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const connect = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!user) return false;
      setConnecting(true);
      try {
        const { data, error } = await supabase.functions.invoke("garmin-auth", {
          body: { action: "connect", email, password },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success(lang === "zh" ? "Garmin 連結成功！" : "Garmin connected!");
        return true;
      } catch (err: any) {
        const msg = err?.message || "Connection failed";
        if (msg.includes("MFA_REQUIRED")) {
          toast.error(
            lang === "zh"
              ? "此 Garmin 帳號啟用了 MFA，請先暫時關閉 MFA 再重試"
              : "This Garmin account has MFA enabled. Please disable MFA temporarily and retry.",
          );
        } else {
          toast.error(lang === "zh" ? `Garmin 連結失敗：${msg}` : `Garmin connection failed: ${msg}`);
        }
        return false;
      } finally {
        setConnecting(false);
      }
    },
    [user, lang],
  );

  const disconnect = useCallback(async () => {
    if (!user) return;
    try {
      const { error } = await supabase.functions.invoke("garmin-auth", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      toast.success(lang === "zh" ? "已中斷 Garmin 連結" : "Garmin disconnected");
    } catch (err: any) {
      toast.error(lang === "zh" ? "中斷連結失敗" : "Failed to disconnect");
    }
  }, [user, lang]);

  const syncActivities = useCallback(
    async (limit = 20) => {
      if (!user) return null;
      setSyncing(true);
      try {
        const { data, error } = await supabase.functions.invoke("garmin-sync", {
          body: { limit },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success(lang === "zh" ? `已同步 ${data.count} 個 Garmin 活動` : `Synced ${data.count} Garmin activities`);
        return data;
      } catch (err: any) {
        toast.error(lang === "zh" ? "同步失敗" : "Sync failed");
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [user, lang],
  );

  return { connect, disconnect, syncActivities, connecting, syncing };
}

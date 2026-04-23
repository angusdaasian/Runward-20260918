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

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return null;
}

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

  /**
   * Connects Garmin. On desktop, opens a popup to Garmin's real SSO page.
   * On mobile (where popup windows are unreliable), opens Garmin in a new tab and
   * waits for the callback tab to broadcast the result via localStorage.
   */
  const connectViaPopup = useCallback(async (): Promise<{ ok: boolean; displayName?: string }> => {
    if (!user) return { ok: false };

    const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);

    if (isMobile) {
      // Open the new tab synchronously from the click so the browser allows it.
      const newTab = window.open("about:blank", "_blank");
      if (!newTab) {
        toast.error(
          lang === "zh"
            ? "請允許開啟新分頁以登入 Garmin"
            : "Please allow new tabs to sign in to Garmin"
        );
        return { ok: false };
      }

      setConnecting(true);
      try {
        const { data: startData, error: startErr } = await supabase.functions.invoke("garmin-sso-start", {
          body: { origin: window.location.origin },
        });
        if (startErr || !startData?.url) {
          const msg = await extractFunctionErrorMessage(startErr) || "Failed to start Garmin sign-in";
          toast.error(lang === "zh" ? `Garmin 連結失敗:${msg}` : msg);
          newTab.close();
          setConnecting(false);
          return { ok: false };
        }
        // The callback tab needs to know which `service` URL we registered.
        localStorage.setItem("garmin-sso-callback", startData.callback ?? "");
        newTab.location.href = startData.url;

        // Wait for the callback tab to write the result to localStorage.
        const result = await new Promise<{ ok: boolean; displayName?: string; error?: string } | null>((resolve) => {
          const TIMEOUT_MS = 10 * 60 * 1000;
          const KEY = "garmin-sso-result";
          let timeoutTimer: number | undefined;

          const finish = (value: { ok: boolean; displayName?: string; error?: string } | null) => {
            window.removeEventListener("storage", onStorage);
            if (timeoutTimer) window.clearTimeout(timeoutTimer);
            resolve(value);
          };

          const onStorage = (ev: StorageEvent) => {
            if (ev.key !== KEY || !ev.newValue) return;
            try {
              finish(JSON.parse(ev.newValue));
            } catch {
              finish(null);
            }
            localStorage.removeItem(KEY);
          };

          window.addEventListener("storage", onStorage);
          timeoutTimer = window.setTimeout(() => finish(null), TIMEOUT_MS);
        });

        if (!result) return { ok: false };
        if (!result.ok) {
          toast.error(
            lang === "zh"
              ? `Garmin 連結失敗:${result.error || "未知錯誤"}`
              : `Garmin sign-in failed: ${result.error || "unknown error"}`
          );
          return { ok: false };
        }

        toast.success(lang === "zh" ? "Garmin 已連結!" : "Garmin connected!");
        invalidateActivities();
        return { ok: true, displayName: result.displayName };
      } catch (err) {
        console.error("Garmin mobile connect error:", err);
        const msg = await extractFunctionErrorMessage(err);
        toast.error(lang === "zh" ? `Garmin 連結失敗${msg ? `:${msg}` : ""}` : msg || "Garmin connection failed");
        return { ok: false };
      } finally {
        setConnecting(false);
      }
    }

    // Desktop: popup flow.
    // Open a placeholder popup *synchronously* from the click handler so popup blockers don't trip.
    const popup = window.open("about:blank", "garmin-sso", "width=520,height=720");
    if (!popup) {
      toast.error(
        lang === "zh"
          ? "請允許彈出視窗以登入 Garmin"
          : "Please allow popups to sign in to Garmin"
      );
      return { ok: false };
    }

    setConnecting(true);
    try {
      // 1) Get the SSO URL (and the callback we registered) from the edge function.
      const { data: startData, error: startErr } = await supabase.functions.invoke("garmin-sso-start", {
        body: { origin: window.location.origin },
      });
      if (startErr || !startData?.url) {
        const msg = await extractFunctionErrorMessage(startErr) || "Failed to start Garmin sign-in";
        toast.error(lang === "zh" ? `Garmin 連結失敗：${msg}` : msg);
        popup.close();
        return { ok: false };
      }

      popup.location.href = startData.url;

      // 2) Wait for postMessage from /garmin-callback (or popup-closed timeout).
      const ticket = await new Promise<string | null>((resolve) => {
        const TIMEOUT_MS = 5 * 60 * 1000;
        let pollTimer: number | undefined;
        let timeoutTimer: number | undefined;

        const cleanup = () => {
          window.removeEventListener("message", onMessage);
          if (pollTimer) window.clearInterval(pollTimer);
          if (timeoutTimer) window.clearTimeout(timeoutTimer);
        };

        const onMessage = (ev: MessageEvent) => {
          if (ev.origin !== window.location.origin) return;
          const data = ev.data;
          if (!data || typeof data !== "object") return;
          if (data.type === "garmin-ticket" && typeof data.ticket === "string") {
            cleanup();
            resolve(data.ticket);
          } else if (data.type === "garmin-ticket-error") {
            cleanup();
            toast.error(
              lang === "zh"
                ? `Garmin 登入失敗：${data.error || "未知錯誤"}`
                : `Garmin sign-in failed: ${data.error || "unknown error"}`
            );
            resolve(null);
          }
        };

        window.addEventListener("message", onMessage);

        // Detect manual close.
        pollTimer = window.setInterval(() => {
          if (popup.closed) {
            cleanup();
            resolve(null);
          }
        }, 500);

        timeoutTimer = window.setTimeout(() => {
          cleanup();
          if (!popup.closed) popup.close();
          resolve(null);
        }, TIMEOUT_MS);
      });

      if (!ticket) {
        return { ok: false };
      }

      // 3) Exchange the ticket on the backend.
      const { data: exData, error: exErr } = await supabase.functions.invoke("garmin-sso-exchange", {
        body: { ticket, callback: startData.callback },
      });

      if (exErr || !exData?.success) {
        const msg = exData?.error || await extractFunctionErrorMessage(exErr) || "Garmin connection failed";
        toast.error(lang === "zh" ? `Garmin 連結失敗：${msg}` : msg);
        return { ok: false };
      }

      toast.success(lang === "zh" ? "Garmin 已連結！" : "Garmin connected!");
      invalidateActivities();
      return { ok: true, displayName: exData.display_name };
    } catch (err) {
      console.error("Garmin connectViaPopup error:", err);
      const msg = await extractFunctionErrorMessage(err);
      toast.error(lang === "zh" ? `Garmin 連結失敗${msg ? `：${msg}` : ""}` : msg || "Garmin connection failed");
      return { ok: false };
    } finally {
      setConnecting(false);
      if (!popup.closed) popup.close();
    }
  }, [user, lang, invalidateActivities]);

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
              ? "Garmin 連結已過期，請重新登入"
              : "Garmin sign-in expired — please reconnect"
          );
        } else {
          toast.error(lang === "zh" ? `同步失敗：${msg}` : msg);
        }
        return false;
      }

      const detailsFetched = data.details_fetched ?? 0;
      toast.success(
        lang === "zh"
          ? `已同步 ${data.synced} 筆活動${detailsFetched > 0 ? `,已取得 ${detailsFetched} 筆詳細資料` : ""}`
          : `Synced ${data.synced} activities${detailsFetched > 0 ? `, ${detailsFetched} details fetched` : ""}`
      );

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

  return { connectViaPopup, syncActivities, disconnect, connecting, syncing };
}

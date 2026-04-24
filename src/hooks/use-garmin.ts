import { useState, useCallback } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";
import { clearGarminSsoTransientState, GARMIN_SSO_KEYS, getGarminSsoValue, setGarminSsoValue } from "@/lib/garminSso";
import { isNativeApp } from "@/lib/nativeDetection";
import despia from "despia-native";

const GARMIN_NATIVE_DEEPLINK_SCHEME = "runward";

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
   * On mobile (where popups are unreliable / often blocked), does a full-page redirect
   * and resumes the exchange when the user lands back on the app.
   */
  const connectViaPopup = useCallback(async (): Promise<{ ok: boolean; displayName?: string }> => {
    if (!user) return { ok: false };

    // Mobile: prefer a real popup / in-app browser window so Garmin MFA runs in a
    // top-level browsing context instead of inside our iframe bridge page.
    // If popups are unavailable, fall back to the full-page bridge route.
    const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    const isNative = isNativeApp() || /despia/i.test(navigator.userAgent) || typeof (window as Window & { despia?: unknown }).despia !== "undefined";

    if (isMobile) {
      const popup = isNative ? null : window.open("about:blank", "garmin-sso-mobile", "width=520,height=720");
      setConnecting(true);
      try {
        const { data: startData, error: startErr } = await supabase.functions.invoke("garmin-sso-start", {
          body: { origin: window.location.origin, deeplink_scheme: GARMIN_NATIVE_DEEPLINK_SCHEME },
        });
        if (startErr || !startData?.url) {
          const msg = await extractFunctionErrorMessage(startErr) || "Failed to start Garmin sign-in";
          toast.error(lang === "zh" ? `Garmin 連結失敗:${msg}` : msg);
          if (popup && !popup.closed) popup.close();
          setConnecting(false);
          return { ok: false };
        }

        const mobileEmbedUrl = startData.mobile_embed_url ?? startData.url ?? "";
        const mobileServiceUrl = startData.service_url ?? "https://sso.garmin.com/sso/embed";

        clearGarminSsoTransientState();
        setGarminSsoValue(GARMIN_SSO_KEYS.callback, startData.callback ?? "");
        setGarminSsoValue(GARMIN_SSO_KEYS.pending, "1");
        setGarminSsoValue(GARMIN_SSO_KEYS.mobileEmbedUrl, mobileEmbedUrl);
        setGarminSsoValue(GARMIN_SSO_KEYS.mobileServiceUrl, mobileServiceUrl);

        if (isNative) {
          const nativeBridgeUrl = `${window.location.origin}/garmin-mobile-auth?native=1&embedUrl=${encodeURIComponent(mobileEmbedUrl)}&serviceUrl=${encodeURIComponent(mobileServiceUrl)}&deeplinkScheme=${encodeURIComponent(GARMIN_NATIVE_DEEPLINK_SCHEME)}`;
          await despia(`oauth://?url=${encodeURIComponent(nativeBridgeUrl)}`);
          return { ok: false };
        }

        if (!popup) {
          window.location.href = "/garmin-mobile-auth";
          return { ok: false };
        }

        const popupUrl = `/garmin-mobile-auth?popup=1&embedUrl=${encodeURIComponent(mobileEmbedUrl)}&serviceUrl=${encodeURIComponent(mobileServiceUrl)}`;
        popup.location.href = popupUrl;

        const result = await new Promise<{ ok: boolean; displayName?: string; error?: string } | null>((resolve) => {
          const TIMEOUT_MS = 5 * 60 * 1000;
          let pollTimer: number | undefined;
          let timeoutTimer: number | undefined;

          const cleanup = () => {
            window.removeEventListener("message", onMessage);
            window.removeEventListener("storage", onStorage);
            if (pollTimer) window.clearInterval(pollTimer);
            if (timeoutTimer) window.clearTimeout(timeoutTimer);
          };

          const resolveFromStoredResult = () => {
            const raw = getGarminSsoValue(GARMIN_SSO_KEYS.result);
            if (!raw) return false;
            try {
              const parsed = JSON.parse(raw) as { ok: boolean; displayName?: string; error?: string };
              cleanup();
              resolve(parsed);
              return true;
            } catch {
              return false;
            }
          };

          const onMessage = (ev: MessageEvent) => {
            if (ev.origin !== window.location.origin) return;
            const data = ev.data;
            if (!data || typeof data !== "object") return;
            if (data.type === "garmin-mobile-result" && data.result && typeof data.result === "object") {
              console.log("[Garmin] mobile popup result received", data.result);
              cleanup();
              resolve(data.result as { ok: boolean; displayName?: string; error?: string });
            }
          };

          const onStorage = (ev: StorageEvent) => {
            if (ev.key === GARMIN_SSO_KEYS.result && ev.newValue) {
              resolveFromStoredResult();
            }
          };

          window.addEventListener("message", onMessage);
          window.addEventListener("storage", onStorage);

          if (resolveFromStoredResult()) return;

          pollTimer = window.setInterval(() => {
            if (resolveFromStoredResult()) return;
            if (popup.closed) {
              cleanup();
              resolve({ ok: false, error: lang === "zh" ? "Garmin 登入視窗已關閉" : "Garmin sign-in window was closed" });
            }
          }, 500);

          timeoutTimer = window.setTimeout(() => {
            cleanup();
            if (!popup.closed) popup.close();
            resolve({ ok: false, error: lang === "zh" ? "Garmin 登入逾時，請再試一次" : "Garmin sign-in timed out. Please try again." });
          }, TIMEOUT_MS);
        });

        clearGarminSsoTransientState();

        if (!result?.ok) {
          if (result?.error) toast.error(result.error);
          return { ok: false };
        }

        toast.success(lang === "zh" ? "Garmin 已連結！" : "Garmin connected!");
        invalidateActivities();
        return { ok: true, displayName: result.displayName };
      } catch (err) {
        console.error("Garmin redirect start error:", err);
        clearGarminSsoTransientState();
        const msg = await extractFunctionErrorMessage(err);
        toast.error(lang === "zh" ? `Garmin 連結失敗${msg ? `:${msg}` : ""}` : msg || "Garmin connection failed");
        if (popup && !popup.closed) popup.close();
        setConnecting(false);
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

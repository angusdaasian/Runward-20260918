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
   * Iframe-based Garmin connect flow.
   *
   * Step 1: prepareConnect() — fetches the iframe URL from the backend.
   * Step 2: parent component renders <GarminIframeDialog> with that URL.
   * Step 3: dialog receives a postMessage with `serviceTicket` from Garmin's
   *         casEmbedSuccess.html and calls completeConnect(ticket).
   *
   * This is the only flow that works on custom domains — Garmin's CAS
   * silently rejects non-Garmin `service` URLs, so we use
   * `service=https://sso.garmin.com/sso/embed` and grab the ticket via
   * window.postMessage from inside an iframe.
   */
  const prepareConnect = useCallback(async (): Promise<{ iframeUrl: string } | null> => {
    if (!user) return null;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("garmin-sso-start", {
        body: { origin: window.location.origin },
      });
      if (error || !data?.iframe_url) {
        const msg = await extractFunctionErrorMessage(error) || "Failed to start Garmin sign-in";
        toast.error(lang === "zh" ? `Garmin 連結失敗:${msg}` : msg);
        setConnecting(false);
        return null;
      }
      return { iframeUrl: data.iframe_url };
    } catch (err) {
      console.error("[useGarmin] prepareConnect error:", err);
      const msg = await extractFunctionErrorMessage(err);
      toast.error(lang === "zh" ? `Garmin 連結失敗${msg ? `:${msg}` : ""}` : msg || "Garmin connection failed");
      setConnecting(false);
      return null;
    }
  }, [user, lang]);

  const completeConnect = useCallback(async (ticket: string): Promise<{ ok: boolean; displayName?: string }> => {
    console.log("[useGarmin] completeConnect called", { hasUser: !!user, ticketPrefix: ticket?.slice(0, 12) });
    if (!user) {
      console.warn("[useGarmin] completeConnect aborted: no user in context");
      toast.error(lang === "zh" ? "請先登入" : "Please sign in first");
      return { ok: false };
    }
    try {
      console.log("[useGarmin] invoking garmin-sso-exchange...");
      const { data, error } = await supabase.functions.invoke("garmin-sso-exchange", {
        body: { ticket },
      });
      console.log("[useGarmin] garmin-sso-exchange returned", { data, error });
      if (error || !data?.success) {
        const msg = data?.error || await extractFunctionErrorMessage(error) || "Garmin connection failed";
        toast.error(lang === "zh" ? `Garmin 連結失敗:${msg}` : msg);
        return { ok: false };
      }
      toast.success(lang === "zh" ? "Garmin 已連結!" : "Garmin connected!");
      invalidateActivities();
      return { ok: true, displayName: data.display_name };
    } catch (err) {
      console.error("[useGarmin] completeConnect error:", err);
      const msg = await extractFunctionErrorMessage(err);
      toast.error(lang === "zh" ? `Garmin 連結失敗${msg ? `:${msg}` : ""}` : msg || "Garmin connection failed");
      return { ok: false };
    } finally {
      setConnecting(false);
    }
  }, [user, lang, invalidateActivities]);

  const cancelConnect = useCallback(() => {
    setConnecting(false);
    clearGarminSsoTransientState();
  }, []);


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

  return { prepareConnect, completeConnect, cancelConnect, syncActivities, disconnect, connecting, syncing };
}

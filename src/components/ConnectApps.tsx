import { ArrowLeft, Check, RefreshCw, Info, AlertTriangle } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAppleHealth } from "@/hooks/use-apple-health";
import { useGarmin } from "@/hooks/use-garmin";
import { getAppEnvironment } from "@/lib/environment";
import { GARMIN_SSO_KEYS, getGarminSsoValue } from "@/lib/garminSso";
import GarminIframeDialog from "@/components/GarminIframeDialog";

interface Props {
  lang: Lang;
  onBack: () => void;
}

const ConnectApps = ({ lang, onBack }: Props) => {
  const { user } = useAuth();
  const [stravaConnected, setStravaConnected] = useState(false);
  const [appleHealthConnected, setAppleHealthConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const appleHealth = useAppleHealth(lang);
  const garmin = useGarmin(lang);

  // Garmin uses a popup to Garmin's real SSO page — no local form state needed.

  // A fitness app is Strava, Garmin, or Coros
  const hasFitnessApp = stravaConnected || garminConnected;

  const checkConnections = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const [stravaRes, ahRes, garminRes] = await Promise.all([
      supabase.from("strava_connections").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("apple_health_connections").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("garmin_connections").select("id").eq("user_id", user.id).maybeSingle(),
    ]);
    setStravaConnected(!!stravaRes.data);
    setAppleHealthConnected(!!ahRes.data);
    setGarminConnected(!!garminRes.data);
    setLoading(false);
  }, [user]);

  useEffect(() => { checkConnections(); }, [checkConnections]);

  useEffect(() => {
    if (appleHealthConnected && !appleHealth.syncing) {
      appleHealth.syncHealthData();
    }
  }, [appleHealthConnected]);

  // Pick up the result of a Garmin redirect-flow sign-in (mobile).
  useEffect(() => {
    if (!user) return;
    const raw = getGarminSsoValue(GARMIN_SSO_KEYS.result);
    const pending = getGarminSsoValue(GARMIN_SSO_KEYS.pending);

    // If we returned without ever hitting /garmin-callback (Garmin redirected
    // us elsewhere, e.g. to Connect's own landing page), surface that.
    if (!raw && pending) {
      sessionStorage.removeItem(GARMIN_SSO_KEYS.pending);
      localStorage.removeItem(GARMIN_SSO_KEYS.pending);
      sessionStorage.removeItem(GARMIN_SSO_KEYS.callback);
      localStorage.removeItem(GARMIN_SSO_KEYS.callback);
      toast.error(
        lang === "zh"
          ? "Garmin 登入後沒有返回 — 請再試一次,或在桌面瀏覽器使用。"
          : "Garmin didn't redirect back after sign-in — please try again, or use a desktop browser."
      );
      return;
    }

    if (!raw) return;
    sessionStorage.removeItem(GARMIN_SSO_KEYS.result);
    localStorage.removeItem(GARMIN_SSO_KEYS.result);
    sessionStorage.removeItem(GARMIN_SSO_KEYS.pending);
    localStorage.removeItem(GARMIN_SSO_KEYS.pending);
    sessionStorage.removeItem(GARMIN_SSO_KEYS.callback);
    localStorage.removeItem(GARMIN_SSO_KEYS.callback);
    try {
      const result = JSON.parse(raw) as { ok: boolean; displayName?: string; error?: string };
      if (result.ok) {
        toast.success(lang === "zh" ? "Garmin 已連結!" : "Garmin connected!");
        setGarminConnected(true);
        (async () => {
          if (appleHealthConnected) {
            await supabase.from("apple_health_activities").delete().eq("user_id", user.id);
            toast.info(
              lang === "zh"
                ? "Apple Health 活動已清除,活動數據將由 Garmin 提供"
                : "Apple Health activities cleared, activities will come from Garmin"
            );
          }
          garmin.syncActivities();
        })();
      } else if (result.error) {
        toast.error(lang === "zh" ? `Garmin 連結失敗:${result.error}` : `Garmin sign-in failed: ${result.error}`);
      }
    } catch (e) {
      console.error("Failed to parse garmin-sso-result:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Apple Health can always be connected (alone or alongside a fitness app)
  const handleConnectAppleHealth = async () => {
    const success = await appleHealth.connect();
    if (success) {
      setAppleHealthConnected(true);
      // If a fitness app is already connected, delete Apple Health activities
      // since fitness app takes priority for activities
      if (hasFitnessApp && user) {
        await supabase.from("apple_health_activities").delete().eq("user_id", user.id);
        toast.info(
          lang === "zh"
            ? "Apple Health 已連結（僅用於健康數據，活動由健身應用提供）"
            : "Apple Health connected (health stats only, activities from fitness app)"
        );
      }
    }
  };

  const handleDisconnectAppleHealth = async () => {
    await appleHealth.disconnect();
    setAppleHealthConnected(false);
  };

  const handleConnectStrava = async () => {
    if (!user) return;
    // Only 1 fitness app allowed
    if (hasFitnessApp) {
      toast.error(lang === "zh" ? "請先中斷現有健身應用再連接新的" : "Please disconnect the current fitness app before connecting a new one");
      return;
    }
    const { data, error } = await supabase.functions.invoke("strava-auth", {
      body: { environment: getAppEnvironment() },
    });
    if (error || !data?.url) {
      toast.error(lang === "zh" ? "無法啟動 Strava 連結" : "Failed to start Strava connection");
      return;
    }
    // If Apple Health activities exist, they'll be cleaned up after Strava sync
    window.location.href = data.url;
  };

  const handleDisconnectStrava = async () => {
    const { error } = await supabase.functions.invoke("strava-disconnect");
    if (error) {
      toast.error(lang === "zh" ? "中斷連結失敗" : "Failed to disconnect");
    } else {
      setStravaConnected(false);
      toast.success(lang === "zh" ? "已中斷 Strava 連結" : "Strava disconnected");
    }
  };

  const handleConnectGarmin = async () => {
    // Only 1 fitness app allowed
    if (hasFitnessApp) {
      toast.error(lang === "zh" ? "請先中斷現有健身應用再連接新的" : "Please disconnect the current fitness app before connecting a new one");
      return;
    }
    const result = await garmin.connectViaPopup();
    if (!result.ok) return;
    setGarminConnected(true);
    // Delete Apple Health activities if they exist (fitness app takes priority)
    if (appleHealthConnected && user) {
      await supabase.from("apple_health_activities").delete().eq("user_id", user.id);
      toast.info(
        lang === "zh"
          ? "Apple Health 活動已清除,活動數據將由 Garmin 提供"
          : "Apple Health activities cleared, activities will come from Garmin"
      );
    }
    // Auto-sync after connecting
    garmin.syncActivities();
  };

  const handleDisconnectGarmin = async () => {
    const success = await garmin.disconnect();
    if (success) setGarminConnected(false);
  };

  const handleSyncGarmin = async () => {
    await garmin.syncActivities();
  };

  const comingSoonApps = [
    { name: "COROS", icon: "⌚" },
  ];

  return (
    <div className="px-5 pt-6 max-w-lg mx-auto pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1">
          <ArrowLeft size={24} className="text-foreground" />
        </button>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {t("connectApps", lang)}
        </h1>
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        {lang === "zh"
          ? "連結你的裝置和服務以自動同步訓練數據"
          : "Connect your devices and services to automatically sync training data"}
      </p>

      {/* Priority reminder */}
      <div className="flex items-start gap-2 bg-muted border border-border rounded-lg p-3 mb-3">
        <AlertTriangle size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          {lang === "zh"
            ? "你只能連接一個健身應用（Strava / Garmin / COROS 擇一）。如果同時連接 Apple Health 和健身應用，活動數據將以健身應用為主（數據更精確），Apple Health 則用於提供每日健康統計（步數、睡眠、卡路里等）。"
            : "You can only connect one fitness app (Strava / Garmin / COROS). If you connect Apple Health alongside a fitness app, activities will come from the fitness app (more accurate data). Apple Health will be used for daily health stats (steps, sleep, calories, etc.) only."}
        </p>
      </div>

      <div className="flex items-start gap-2 bg-muted/50 border border-border rounded-lg p-3 mb-6">
        <Info size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          {lang === "zh"
            ? "XP 和訓練分數只會從你連接的健身應用計算。如需更換健身應用，請先中斷現有連結。"
            : "XP and training scores are calculated from your connected fitness app only. To switch fitness apps, disconnect the current one first."}
        </p>
      </div>

      <div className="space-y-3">
        {/* Apple Health — can be connected alongside fitness apps */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <span className="text-xl">❤️</span>
              </div>
              <div>
                <span className="font-medium text-foreground block">Apple Health</span>
                <span className="text-xs text-muted-foreground">
                  {lang === "zh"
                    ? hasFitnessApp
                      ? "提供每日健康統計（步數、睡眠、卡路里）"
                      : "同步健康統計及活動數據"
                    : hasFitnessApp
                      ? "Daily health stats (steps, sleep, calories)"
                      : "Sync health stats & activities"}
                </span>
              </div>
            </div>
            {appleHealthConnected ? (
              <div className="flex items-center gap-2">
                {appleHealth.syncing && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
                <Check size={16} className="text-green-500" />
                <button onClick={handleDisconnectAppleHealth} className="text-xs text-destructive hover:underline">
                  {lang === "zh" ? "中斷" : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectAppleHealth}
                className="text-xs font-medium px-3 py-1 rounded-full text-primary-foreground bg-primary"
              >
                {lang === "zh" ? "連結" : "Connect"}
              </button>
            )}
          </div>
        </div>

        {/* Garmin Connect */}
        <div className={`bg-card border border-border rounded-xl p-4 ${hasFitnessApp && !garminConnected ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-lg">
                ⌚
              </div>
              <div>
                <span className="font-medium text-foreground block">Garmin Connect</span>
                <span className="text-xs text-muted-foreground">
                  {lang === "zh"
                    ? "同步跑步數據、心率、海拔及訓練負荷"
                    : "Sync runs, HR, elevation & training load"}
                </span>
              </div>
            </div>
            {garminConnected ? (
              <div className="flex items-center gap-2">
                {garmin.syncing && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
                <button onClick={handleSyncGarmin} disabled={garmin.syncing} className="text-xs text-primary hover:underline">
                  {lang === "zh" ? "同步" : "Sync"}
                </button>
                <Check size={16} className="text-green-500" />
                <button onClick={handleDisconnectGarmin} className="text-xs text-destructive hover:underline">
                  {lang === "zh" ? "中斷" : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectGarmin}
                disabled={hasFitnessApp || garmin.connecting}
                className={`text-xs font-medium px-3 py-1 rounded-full ${hasFitnessApp ? "bg-muted text-muted-foreground cursor-not-allowed" : "text-primary-foreground bg-primary"}`}
              >
                {garmin.connecting
                  ? (lang === "zh" ? "連結中..." : "Connecting...")
                  : (lang === "zh" ? "連結" : "Connect")}
              </button>
            )}
          </div>

          {/* Garmin sign-in is handled in a popup to Garmin's secure SSO page */}
          {!garminConnected && (
            <p className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">
              {lang === "zh"
                ? "點擊「連結」會在彈出視窗中開啟 Garmin 的官方登入頁面，由 Garmin 處理你的密碼及兩步驟驗證 — 我們不會看到。"
                : "Click Connect to open Garmin's secure sign-in page in a popup. Garmin handles your password and 2-step verification — we never see them."}
            </p>
          )}
        </div>

        {/* Strava — temporarily disabled */}
        <div className="bg-card border border-border rounded-xl p-4 opacity-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FC4C02]/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="#FC4C02">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
              </div>
              <div>
                <span className="font-medium text-foreground block">Strava</span>
                <span className="text-xs text-muted-foreground">
                  {t("stravaConnectDesc", lang)}
                </span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
              {t("comingSoon", lang)}
            </span>
          </div>
        </div>

        {/* Coming Soon Apps */}
        {comingSoonApps.map((app) => (
          <div key={app.name} className="bg-card border border-border rounded-xl p-4 opacity-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg">
                  {app.icon}
                </div>
                <div>
                  <span className="font-medium text-foreground block">{app.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("stravaConnectDesc", lang)}
                  </span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                {t("comingSoon", lang)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConnectApps;

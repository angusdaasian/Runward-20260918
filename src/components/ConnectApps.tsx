import { ArrowLeft, Check, RefreshCw, Info, AlertTriangle } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAppleHealth } from "@/hooks/use-apple-health";
import { useGarmin } from "@/hooks/use-garmin";
import { getAppEnvironment } from "@/lib/environment";
import GarminCredentialDialog from "@/components/GarminCredentialDialog";
import corosIcon from "@/assets/brands/coros.png";
import polarIcon from "@/assets/brands/polar.png";
import garminIcon from "@/assets/brands/garmin.png";
import suuntoIcon from "@/assets/brands/suunto.png";

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
  const [garminDialogOpen, setGarminDialogOpen] = useState(false);

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

  // Apple Health can always be connected (alone or alongside a fitness app)
  const handleConnectAppleHealth = async () => {
    const success = await appleHealth.connect();
    if (success) {
      setAppleHealthConnected(true);
      if (hasFitnessApp && user) {
        await supabase.from("apple_health_activities").delete().eq("user_id", user.id);
        toast.info(
          lang === "zh"
            ? "Apple Health 已連結（僅用於健康數據,活動由健身應用提供）"
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

  const handleConnectGarmin = () => {
    if (hasFitnessApp) {
      toast.error(lang === "zh" ? "請先中斷現有健身應用再連接新的" : "Please disconnect the current fitness app before connecting a new one");
      return;
    }
    setGarminDialogOpen(true);
  };

  const handleGarminConnected = async () => {
    setGarminConnected(true);
    if (appleHealthConnected && user) {
      // Only clear AH activities that fall inside the Garmin coverage period.
      // Anything BEFORE the earliest Garmin activity (e.g. logged after a prior
      // disconnect) is preserved.
      const { data: earliestGarmin } = await supabase
        .from("garmin_activities")
        .select("start_time")
        .eq("user_id", user.id)
        .not("start_time", "is", null)
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (earliestGarmin?.start_time) {
        await supabase
          .from("apple_health_activities")
          .delete()
          .eq("user_id", user.id)
          .gte("start_date", earliestGarmin.start_time);
      }
      toast.info(
        lang === "zh"
          ? "Apple Health 重疊活動已清除,活動數據將由 Garmin 提供"
          : "Overlapping Apple Health activities cleared, activities will come from Garmin"
      );
    }
    garmin.syncActivities();
  };

  const handleDisconnectGarmin = async () => {
    const success = await garmin.disconnect();
    if (success) setGarminConnected(false);
  };

  const handleSyncGarmin = async () => {
    await garmin.syncActivities();
  };

  type TerraProvider = "GARMIN" | "POLAR" | "SUUNTO" | "COROS";
  const TERRA_PROVIDERS: { id: TerraProvider; label: string; icon: string }[] = [
    { id: "GARMIN", label: "Garmin", icon: garminIcon },
    { id: "COROS", label: "COROS", icon: corosIcon },
    { id: "POLAR", label: "Polar", icon: polarIcon },
    { id: "SUUNTO", label: "Suunto", icon: suuntoIcon },
  ];
  const [terraConns, setTerraConns] = useState<Record<string, { id: string; last_synced_at: string | null }>>({});
  const [terraBusy, setTerraBusy] = useState<string | null>(null);

  const loadTerraConns = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("terra_connections")
      .select("id, provider, last_synced_at, active")
      .eq("user_id", user.id)
      .eq("active", true);
    const map: Record<string, { id: string; last_synced_at: string | null }> = {};
    (data ?? []).forEach((r: any) => { map[r.provider] = { id: r.id, last_synced_at: r.last_synced_at }; });
    setTerraConns(map);
  }, [user]);

  const hasTerraConn = Object.keys(terraConns).length > 0;

  useEffect(() => { loadTerraConns(); }, [loadTerraConns]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("terra")) {
      const status = params.get("terra");
      if (status === "success") toast.success(lang === "zh" ? "Terra 連接成功" : "Terra connected");
      else toast.error(lang === "zh" ? "Terra 連接失敗" : "Terra connection failed");
      let n = 0;
      const t = setInterval(() => { loadTerraConns(); if (++n >= 6) clearInterval(t); }, 2000);
      const url = new URL(window.location.href);
      url.searchParams.delete("terra");
      url.searchParams.delete("user_id");
      url.searchParams.delete("reference_id");
      url.searchParams.delete("resource");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTerraConnect = async (provider: TerraProvider) => {
    if (hasTerraConn) {
      toast.error(lang === "zh" ? "請先中斷現有裝置連結" : "Please disconnect the current device first");
      return;
    }
    setTerraBusy(provider);
    try {
      // Always return to production domain; universal/app links reopen the native app from Terra.
      const successUrl = new URL("https://pacecalculator.fun/terra-return");
      successUrl.searchParams.set("status", "success");
      successUrl.searchParams.set("provider", provider);
      successUrl.searchParams.set("native", "true");

      const failureUrl = new URL("https://pacecalculator.fun/terra-return");
      failureUrl.searchParams.set("status", "failure");
      failureUrl.searchParams.set("provider", provider);
      failureUrl.searchParams.set("native", "true");

      const { data, error } = await supabase.functions.invoke("terra-auth-init", {
        body: { provider, success_url: successUrl.toString(), failure_url: failureUrl.toString() },
      });
      if (error || !data?.auth_url) throw new Error(error?.message || "no auth url");
      window.location.href = data.auth_url;
    } catch (e: any) {
      toast.error((lang === "zh" ? "Terra 啟動失敗: " : "Terra init failed: ") + (e?.message ?? ""));
      setTerraBusy(null);
    }
  };

  const handleTerraSync = async (provider: TerraProvider) => {
    setTerraBusy(provider);
    try {
      const { data, error } = await supabase.functions.invoke("terra-sync", { body: { provider } });
      if (error) throw error;
      toast.success(lang === "zh" ? `已同步 ${data?.activities ?? 0} 個活動` : `Synced ${data?.activities ?? 0} activities`);
      await loadTerraConns();
    } catch (e: any) {
      toast.error((lang === "zh" ? "同步失敗: " : "Sync failed: ") + (e?.message ?? ""));
    } finally { setTerraBusy(null); }
  };

  const handleTerraDisconnect = async (provider: TerraProvider) => {
    setTerraBusy(provider);
    try {
      const { error } = await supabase.functions.invoke("terra-disconnect", { body: { provider } });
      if (error) throw error;
      toast.success(lang === "zh" ? "已中斷連結" : "Disconnected");
      await loadTerraConns();
    } catch (e: any) {
      toast.error((lang === "zh" ? "中斷失敗: " : "Disconnect failed: ") + (e?.message ?? ""));
    } finally { setTerraBusy(null); }
  };

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
            ? "你只能連接一個健身應用（Strava / Garmin / COROS 擇一）。如果同時連接 Apple Health 和健身應用,活動數據將以健身應用為主（數據更精確）,Apple Health 則用於提供每日健康統計（步數、睡眠、卡路里等）。"
            : "You can only connect one fitness app (Strava / Garmin / COROS). If you connect Apple Health alongside a fitness app, activities will come from the fitness app (more accurate data). Apple Health will be used for daily health stats (steps, sleep, calories, etc.) only."}
        </p>
      </div>

      <div className="flex items-start gap-2 bg-muted/50 border border-border rounded-lg p-3 mb-6">
        <Info size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          {lang === "zh"
            ? "XP 和訓練分數只會從你連接的健身應用計算。如需更換健身應用,請先中斷現有連結。"
            : "XP and training scores are calculated from your connected fitness app only. To switch fitness apps, disconnect the current one first."}
        </p>
      </div>

      <div className="space-y-3">
        {/* Apple Health */}
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

        {/* Terra device connections (Garmin / Polar / COROS / Suunto) */}
        {TERRA_PROVIDERS.map((p) => {
          const conn = terraConns[p.id];
          const busy = terraBusy === p.id;
          const disabledByOther = hasTerraConn && !conn;
          return (
            <div key={p.id} className={`bg-card border border-border rounded-xl p-4 ${disabledByOther ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                    <img src={p.icon} alt={p.label} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <span className="font-medium text-foreground block">{p.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {conn?.last_synced_at
                        ? `${lang === "zh" ? "上次同步: " : "Last synced: "}${new Date(conn.last_synced_at).toLocaleString()}`
                        : (lang === "zh"
                            ? "同步跑步活動數據、配速、心率、海拔及訓練負荷"
                            : "Sync running activity data, pace, heart rate, elevation & training load")}
                    </span>
                  </div>
                </div>
                {conn ? (
                  <div className="flex items-center gap-2">
                    {busy && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
                    <Check size={16} className="text-green-500" />
                    <button onClick={() => handleTerraDisconnect(p.id)} disabled={busy} className="text-xs text-destructive hover:underline disabled:opacity-50">
                      {lang === "zh" ? "中斷" : "Disconnect"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleTerraConnect(p.id)}
                    disabled={busy || disabledByOther}
                    className={`text-xs font-medium px-3 py-1 rounded-full ${disabledByOther ? "bg-muted text-muted-foreground cursor-not-allowed" : "text-primary-foreground bg-primary"} disabled:opacity-50`}
                  >
                    {busy ? (lang === "zh" ? "..." : "...") : (lang === "zh" ? "連結" : "Connect")}
                  </button>
                )}
              </div>
            </div>
          );
        })}

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

      </div>

      <GarminCredentialDialog
        open={garminDialogOpen}
        lang={lang}
        onOpenChange={setGarminDialogOpen}
        onSuccess={handleGarminConnected}
      />
    </div>
  );
};

export default ConnectApps;

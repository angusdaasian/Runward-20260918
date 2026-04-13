import { ArrowLeft, Check, RefreshCw, Info, Eye, EyeOff } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAppleHealth } from "@/hooks/use-apple-health";
import { useGarmin } from "@/hooks/use-garmin";
import { getAppEnvironment } from "@/lib/environment";

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

  // Garmin login form state
  const [showGarminForm, setShowGarminForm] = useState(false);
  const [garminEmail, setGarminEmail] = useState("");
  const [garminPassword, setGarminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const hasConnection = stravaConnected || appleHealthConnected || garminConnected;

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

  const handleConnectAppleHealth = async () => {
    if (hasConnection) {
      toast.error(lang === "zh" ? "請先中斷現有連結再連接新的應用" : "Please disconnect the current app before connecting a new one");
      return;
    }
    const success = await appleHealth.connect();
    if (success) setAppleHealthConnected(true);
  };

  const handleDisconnectAppleHealth = async () => {
    await appleHealth.disconnect();
    setAppleHealthConnected(false);
  };

  const handleConnectStrava = async () => {
    if (!user) return;
    if (hasConnection) {
      toast.error(lang === "zh" ? "請先中斷現有連結再連接新的應用" : "Please disconnect the current app before connecting a new one");
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

  const handleConnectGarmin = async () => {
    if (hasConnection) {
      toast.error(lang === "zh" ? "請先中斷現有連結再連接新的應用" : "Please disconnect the current app before connecting a new one");
      return;
    }
    setShowGarminForm(true);
  };

  const handleGarminLogin = async () => {
    if (!garminEmail || !garminPassword) {
      toast.error(lang === "zh" ? "請輸入帳號和密碼" : "Please enter email and password");
      return;
    }
    const success = await garmin.connect(garminEmail, garminPassword);
    if (success) {
      setGarminConnected(true);
      setShowGarminForm(false);
      setGarminEmail("");
      setGarminPassword("");
      // Auto-sync after connecting
      garmin.syncActivities();
    }
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

      <div className="flex items-start gap-2 bg-muted/50 border border-border rounded-lg p-3 mb-6">
        <Info size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          {lang === "zh"
            ? "你只能連接以下其中一個健身應用。如需更換，請先中斷現有連結。XP 和訓練分數只會從你連接的應用計算。"
            : "You can only connect one fitness app at a time. To switch, disconnect the current one first. XP and training scores are calculated from your connected app only."}
        </p>
      </div>

      <div className="space-y-3">
        {/* Apple Health */}
        <div className={`bg-card border border-border rounded-xl p-4 ${hasConnection && !appleHealthConnected ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <span className="text-xl">❤️</span>
              </div>
              <div>
                <span className="font-medium text-foreground block">Apple Health</span>
                <span className="text-xs text-muted-foreground">
                  {lang === "zh"
                    ? "自動同步睡眠、卡路里、步數及距離"
                    : "Sync sleep, calories, steps & distance automatically"}
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
                disabled={hasConnection}
                className={`text-xs font-medium px-3 py-1 rounded-full ${hasConnection ? "bg-muted text-muted-foreground cursor-not-allowed" : "text-primary-foreground bg-primary"}`}
              >
                {lang === "zh" ? "連結" : "Connect"}
              </button>
            )}
          </div>
        </div>

        {/* Garmin Connect */}
        <div className={`bg-card border border-border rounded-xl p-4 ${hasConnection && !garminConnected ? "opacity-50" : ""}`}>
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
                disabled={hasConnection || garmin.connecting}
                className={`text-xs font-medium px-3 py-1 rounded-full ${hasConnection ? "bg-muted text-muted-foreground cursor-not-allowed" : "text-primary-foreground bg-primary"}`}
              >
                {garmin.connecting
                  ? (lang === "zh" ? "連結中..." : "Connecting...")
                  : (lang === "zh" ? "連結" : "Connect")}
              </button>
            )}
          </div>

          {/* Garmin login form */}
          {showGarminForm && !garminConnected && (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <input
                type="email"
                placeholder={lang === "zh" ? "Garmin 帳號 (Email)" : "Garmin Email"}
                value={garminEmail}
                onChange={(e) => setGarminEmail(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={lang === "zh" ? "密碼" : "Password"}
                  value={garminPassword}
                  onChange={(e) => setGarminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGarminLogin()}
                  className="w-full text-sm px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGarminLogin}
                  disabled={garmin.connecting}
                  className="flex-1 text-xs font-medium px-3 py-2 rounded-lg text-primary-foreground bg-primary disabled:opacity-50"
                >
                  {garmin.connecting
                    ? (lang === "zh" ? "登入中..." : "Signing in...")
                    : (lang === "zh" ? "登入" : "Sign In")}
                </button>
                <button
                  onClick={() => { setShowGarminForm(false); setGarminEmail(""); setGarminPassword(""); }}
                  className="text-xs px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  {lang === "zh" ? "取消" : "Cancel"}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {lang === "zh"
                  ? "你的憑證僅用於驗證，不會被儲存。"
                  : "Your credentials are used for authentication only and are not stored."}
              </p>
            </div>
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

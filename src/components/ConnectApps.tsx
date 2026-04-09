import { ArrowLeft, Check, RefreshCw, Eye, EyeOff } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAppleHealth } from "@/hooks/use-apple-health";
import { getAppEnvironment } from "@/lib/environment";
import { Input } from "@/components/ui/input";

interface Props {
  lang: Lang;
  onBack: () => void;
}

const ConnectApps = ({ lang, onBack }: Props) => {
  const { user } = useAuth();
  const [stravaConnected, setStravaConnected] = useState(false);
  const [appleHealthConnected, setAppleHealthConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const appleHealth = useAppleHealth(lang);

  // Garmin state
  const [garminConnected, setGarminConnected] = useState(false);
  const [garminDisplayName, setGarminDisplayName] = useState("");
  const [garminEmail, setGarminEmail] = useState("");
  const [garminPassword, setGarminPassword] = useState("");
  const [garminLoading, setGarminLoading] = useState(false);
  const [garminError, setGarminError] = useState("");
  const [showGarminForm, setShowGarminForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const checkConnections = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const [stravaRes, ahRes, garminRes] = await Promise.all([
      supabase.from("strava_connections").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("apple_health_connections").select("id").eq("user_id", user.id).maybeSingle(),
      (supabase as any).from("garmin_connections").select("id, garmin_display_name").eq("user_id", user.id).maybeSingle(),
    ]);
    setStravaConnected(!!stravaRes.data);
    setAppleHealthConnected(!!ahRes.data);
    if (garminRes.data) {
      setGarminConnected(true);
      setGarminDisplayName(garminRes.data.garmin_display_name || "Garmin User");
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { checkConnections(); }, [checkConnections]);

  // Auto-sync health data when connected
  useEffect(() => {
    if (appleHealthConnected && !appleHealth.healthStats && !appleHealth.syncing) {
      appleHealth.syncHealthData();
    }
  }, [appleHealthConnected]);

  const handleConnectAppleHealth = async () => {
    const success = await appleHealth.connect();
    if (success) {
      setAppleHealthConnected(true);
    }
  };

  const handleDisconnectAppleHealth = async () => {
    await appleHealth.disconnect();
    setAppleHealthConnected(false);
  };

  const handleConnectStrava = async () => {
    if (!user) return;
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

  const handleConnectGarmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !garminEmail || !garminPassword) return;

    setGarminLoading(true);
    setGarminError("");

    try {
      const res = await fetch("https://garmy-production.up.railway.app/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: garminEmail, password: garminPassword }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg = data.error || data.message || (lang === "zh" ? "登入失敗" : "Login failed");
        setGarminError(msg);
        toast.error(msg);
        setGarminLoading(false);
        return;
      }

      // Store session in garmin_connections
      const { error: dbError } = await (supabase as any)
        .from("garmin_connections")
        .upsert({
          user_id: user.id,
          access_token: JSON.stringify(data.session_data),
          garmin_display_name: data.display_name || garminEmail.split("@")[0],
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (dbError) {
        console.error("Garmin DB error:", dbError);
        toast.error(lang === "zh" ? "儲存連結失敗" : "Failed to save connection");
        setGarminLoading(false);
        return;
      }

      setGarminConnected(true);
      setGarminDisplayName(data.display_name || garminEmail.split("@")[0]);
      setShowGarminForm(false);
      setGarminEmail("");
      setGarminPassword("");
      toast.success(lang === "zh" ? "已連結 Garmin" : "Garmin connected");
    } catch (err: any) {
      const msg = lang === "zh" ? "無法連線至 Garmin 伺服器" : "Could not reach Garmin server";
      setGarminError(msg);
      toast.error(msg);
    } finally {
      setGarminLoading(false);
    }
  };

  const handleDisconnectGarmin = async () => {
    if (!user) return;
    const { error } = await (supabase as any)
      .from("garmin_connections")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      toast.error(lang === "zh" ? "中斷連結失敗" : "Failed to disconnect");
    } else {
      setGarminConnected(false);
      setGarminDisplayName("");
      toast.success(lang === "zh" ? "已中斷 Garmin 連結" : "Garmin disconnected");
    }
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

      <p className="text-sm text-muted-foreground mb-6">
        {lang === "zh"
          ? "連結你的裝置和服務以自動同步訓練數據"
          : "Connect your devices and services to automatically sync training data"}
      </p>

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
                    ? "自動同步睡眠、卡路里、步數及距離"
                    : "Sync sleep, calories, steps & distance automatically"}
                </span>
              </div>
            </div>
            {appleHealthConnected ? (
              <div className="flex items-center gap-2">
                {appleHealth.syncing && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
                <Check size={16} className="text-green-500" />
                <button
                  onClick={handleDisconnectAppleHealth}
                  className="text-xs text-destructive hover:underline"
                >
                  {lang === "zh" ? "中斷" : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectAppleHealth}
                className="text-xs font-medium text-primary-foreground bg-primary px-3 py-1 rounded-full"
              >
                {lang === "zh" ? "連結" : "Connect"}
              </button>
            )}
          </div>
        </div>

        {/* Garmin */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                <span className="text-xl">⌚</span>
              </div>
              <div>
                <span className="font-medium text-foreground block">Garmin Connect</span>
                <span className="text-xs text-muted-foreground">
                  {lang === "zh"
                    ? "同步 Garmin 手錶的訓練數據"
                    : "Sync training data from your Garmin watch"}
                </span>
              </div>
            </div>
            {garminConnected ? (
              <div className="flex items-center gap-2">
                <Check size={16} className="text-green-500" />
                <span className="text-xs text-muted-foreground">{garminDisplayName}</span>
                <button
                  onClick={handleDisconnectGarmin}
                  className="text-xs text-destructive hover:underline"
                >
                  {lang === "zh" ? "中斷" : "Disconnect"}
                </button>
              </div>
            ) : !showGarminForm ? (
              <button
                onClick={() => setShowGarminForm(true)}
                className="text-xs font-medium text-primary-foreground bg-primary px-3 py-1 rounded-full"
              >
                {lang === "zh" ? "連結" : "Connect"}
              </button>
            ) : null}
          </div>

          {/* Garmin Login Form */}
          {!garminConnected && showGarminForm && (
            <form onSubmit={handleConnectGarmin} className="mt-4 space-y-3">
              <Input
                type="email"
                placeholder={lang === "zh" ? "Garmin 電子郵件" : "Garmin Email"}
                value={garminEmail}
                onChange={(e) => setGarminEmail(e.target.value)}
                required
                disabled={garminLoading}
                className="text-sm"
              />
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={lang === "zh" ? "密碼" : "Password"}
                  value={garminPassword}
                  onChange={(e) => setGarminPassword(e.target.value)}
                  required
                  disabled={garminLoading}
                  className="text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {garminError && (
                <p className="text-xs text-destructive">{garminError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={garminLoading}
                  className="flex-1 text-xs font-medium text-primary-foreground bg-primary px-3 py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {garminLoading && <RefreshCw size={14} className="animate-spin" />}
                  {lang === "zh" ? "登入" : "Sign In"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowGarminForm(false); setGarminError(""); }}
                  className="text-xs text-muted-foreground px-3 py-2"
                >
                  {lang === "zh" ? "取消" : "Cancel"}
                </button>
              </div>
            </form>
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
          <div
            key={app.name}
            className="bg-card border border-border rounded-xl p-4 opacity-50"
          >
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

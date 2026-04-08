import { ArrowLeft, Check, RefreshCw } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAppleHealth } from "@/hooks/use-apple-health";
import { useGarmin } from "@/hooks/use-garmin";
import { getAppEnvironment } from "@/lib/environment";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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

  // Garmin login dialog state
  const [garminDialogOpen, setGarminDialogOpen] = useState(false);
  const [garminEmail, setGarminEmail] = useState("");
  const [garminPassword, setGarminPassword] = useState("");

  const checkConnections = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const [stravaRes, ahRes, garminRes] = await Promise.all([
      supabase.from("strava_connections").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("apple_health_connections").select("id").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("garmin_connections" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    setStravaConnected(!!stravaRes.data);
    setAppleHealthConnected(!!ahRes.data);
    setGarminConnected(!!(garminRes.data as any));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkConnections();
  }, [checkConnections]);

  useEffect(() => {
    if (appleHealthConnected && !appleHealth.healthStats && !appleHealth.syncing) {
      appleHealth.syncHealthData();
    }
  }, [appleHealthConnected]);

  const handleConnectAppleHealth = async () => {
    const success = await appleHealth.connect();
    if (success) setAppleHealthConnected(true);
  };

  const handleDisconnectAppleHealth = async () => {
    await appleHealth.disconnect();
    setAppleHealthConnected(false);
  };

  const handleConnectGarmin = async () => {
    if (!garminEmail || !garminPassword) {
      toast.error(lang === "zh" ? "請輸入帳號和密碼" : "Please enter email and password");
      return;
    }
    const success = await garmin.connect(garminEmail, garminPassword);
    if (success) {
      setGarminConnected(true);
      setGarminDialogOpen(false);
      setGarminEmail("");
      setGarminPassword("");
    }
  };

  const handleDisconnectGarmin = async () => {
    await garmin.disconnect();
    setGarminConnected(false);
  };

  const handleSyncGarmin = async () => {
    await garmin.syncActivities();
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

  const comingSoonApps = [{ name: "COROS", icon: "⌚" }];

  return (
    <div className="px-5 pt-6 max-w-lg mx-auto pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1">
          <ArrowLeft size={24} className="text-foreground" />
        </button>
        <h1 className="font-display text-2xl font-bold text-foreground">{t("connectApps", lang)}</h1>
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
                <button onClick={handleDisconnectAppleHealth} className="text-xs text-destructive hover:underline">
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

        {/* Garmin Connect */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <span className="text-xl">⌚</span>
              </div>
              <div>
                <span className="font-medium text-foreground block">Garmin Connect</span>
                <span className="text-xs text-muted-foreground">
                  {lang === "zh" ? "同步活動、心率、訓練效果" : "Sync activities, HR, training effect"}
                </span>
              </div>
            </div>
            {garminConnected ? (
              <div className="flex items-center gap-2">
                {garmin.syncing && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
                <button
                  onClick={handleSyncGarmin}
                  disabled={garmin.syncing}
                  className="text-xs text-primary hover:underline"
                >
                  {lang === "zh" ? "同步" : "Sync"}
                </button>
                <Check size={16} className="text-green-500" />
                <button onClick={handleDisconnectGarmin} className="text-xs text-destructive hover:underline">
                  {lang === "zh" ? "中斷" : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setGarminDialogOpen(true)}
                disabled={garmin.connecting}
                className="text-xs font-medium text-primary-foreground bg-primary px-3 py-1 rounded-full"
              >
                {garmin.connecting ? (lang === "zh" ? "連結中…" : "Connecting…") : lang === "zh" ? "連結" : "Connect"}
              </button>
            )}
          </div>
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
                <span className="text-xs text-muted-foreground">{t("stravaConnectDesc", lang)}</span>
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
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg">{app.icon}</div>
                <div>
                  <span className="font-medium text-foreground block">{app.name}</span>
                  <span className="text-xs text-muted-foreground">{t("stravaConnectDesc", lang)}</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                {t("comingSoon", lang)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Garmin Login Dialog */}
      <Dialog open={garminDialogOpen} onOpenChange={setGarminDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{lang === "zh" ? "連結 Garmin Connect" : "Connect Garmin Connect"}</DialogTitle>
            <DialogDescription>
              {lang === "zh"
                ? "輸入你的 Garmin Connect 帳號密碼。我們不會儲存你的密碼，僅使用安全令牌存取數據。"
                : "Enter your Garmin Connect credentials. We don't store your password — only a secure access token."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{lang === "zh" ? "電子郵件" : "Email"}</Label>
              <Input
                type="email"
                placeholder="garmin@example.com"
                value={garminEmail}
                onChange={(e) => setGarminEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{lang === "zh" ? "密碼" : "Password"}</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={garminPassword}
                onChange={(e) => setGarminPassword(e.target.value)}
              />
            </div>
            <Button onClick={handleConnectGarmin} disabled={garmin.connecting} className="w-full">
              {garmin.connecting ? (lang === "zh" ? "連結中…" : "Connecting…") : lang === "zh" ? "連結" : "Connect"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {lang === "zh"
                ? "⚠️ 如果你的帳號啟用了 MFA (兩步驟驗證)，請先暫時關閉"
                : "⚠️ If your account has MFA enabled, please disable it temporarily"}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConnectApps;

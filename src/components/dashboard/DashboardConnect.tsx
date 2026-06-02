// Desktop-native Connect Apps page.
//
// Uses the SAME Supabase edge functions as the mobile ConnectApps component
// (terra-auth-init, terra-sync, terra-disconnect, strava-auth, strava-disconnect,
// garmin-connections, etc.) but always opens external auth in a normal browser
// flow — never a deeplink — because this lives in the desktop dashboard.
//
// The mobile src/components/ConnectApps.tsx file is NOT modified.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plug, Check, RefreshCw, Info, AlertTriangle, ExternalLink, Loader2, Smartphone,
} from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DesktopPageHeader from "./DesktopPageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

import { useGarmin } from "@/hooks/use-garmin";
import { toast } from "sonner";
import GarminCredentialDialog from "@/components/GarminCredentialDialog";
import corosIcon from "@/assets/brands/coros.png";
import polarIcon from "@/assets/brands/polar.png";
import garminIcon from "@/assets/brands/garmin.png";
import suuntoIcon from "@/assets/brands/suunto.png";
import zeppIcon from "@/assets/brands/zepp.png";

type TerraProvider = "GARMIN" | "POLAR" | "SUUNTO" | "COROS" | "ZEPP";

interface Props {
  lang: Lang;
  onBack: () => void;
}

interface ProviderCard {
  id: string;
  name: string;
  description: { en: string; zh: string };
  icon: React.ReactNode;
  accent: string; // tailwind background-class for icon tile
  category: "fitness" | "device" | "health";
  terraId?: TerraProvider;
  kind: "terra" | "strava" | "apple-health" | "garmin-credentials";
}

export default function DashboardConnect({ lang }: Props) {
  const zh = lang === "zh";
  const L = (en: string, z: string) => (zh ? z : en);
  const { user } = useAuth();
  const garmin = useGarmin(lang);

  const [loading, setLoading] = useState(true);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [appleHealthConnected, setAppleHealthConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [garminDialogOpen, setGarminDialogOpen] = useState(false);
  const [terraConns, setTerraConns] = useState<
    Record<string, { id: string; last_synced_at: string | null }>
  >({});
  const [busy, setBusy] = useState<string | null>(null);

  const hasFitnessApp = stravaConnected || garminConnected;
  const hasTerraConn = Object.keys(terraConns).length > 0;

  const loadTerraConns = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("terra_connections")
      .select("id, provider, last_synced_at, active")
      .eq("user_id", user.id)
      .eq("active", true);
    const map: Record<string, { id: string; last_synced_at: string | null }> = {};
    (data ?? []).forEach((r: any) => {
      map[r.provider] = { id: r.id, last_synced_at: r.last_synced_at };
    });
    setTerraConns(map);
  }, [user]);

  const checkConnections = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const [stravaRes, ahRes, garminRes] = await Promise.all([
      supabase.from("strava_connections").select("id").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("apple_health_connections")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("garmin_connections").select("id").eq("user_id", user.id).maybeSingle(),
    ]);
    setStravaConnected(!!stravaRes.data);
    setAppleHealthConnected(!!ahRes.data);
    setGarminConnected(!!garminRes.data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkConnections();
    loadTerraConns();
  }, [checkConnections, loadTerraConns]);

  // Refresh after returning from OAuth tab
  useEffect(() => {
    const onFocus = () => {
      setBusy(null);
      checkConnections();
      loadTerraConns();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkConnections, loadTerraConns]);

  // Surface terra return params, same as mobile flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("terra")) {
      const status = params.get("terra");
      if (status === "success") toast.success(L("Terra connected", "Terra 連接成功"));
      else toast.error(L("Terra connection failed", "Terra 連接失敗"));
      let n = 0;
      const t = setInterval(() => {
        loadTerraConns();
        if (++n >= 6) clearInterval(t);
      }, 2000);
      const url = new URL(window.location.href);
      ["terra", "user_id", "reference_id", "resource"].forEach((k) =>
        url.searchParams.delete(k),
      );
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──
  const handleStravaConnect = async () => {
    if (!user) return;
    if (hasFitnessApp) {
      toast.error(
        L(
          "Please disconnect the current fitness app first",
          "請先中斷現有健身應用再連接新的",
        ),
      );
      return;
    }
    setBusy("STRAVA");
    const redirect_uri = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.functions.invoke("strava-auth", {
      body: { redirect_uri },
    });
    if (error || !data?.url) {
      toast.error(L("Failed to start Strava connection", "無法啟動 Strava 連結"));
      setBusy(null);
      return;
    }
    // Desktop: open OAuth in a new browser tab — never a deeplink.
    window.open(data.url, "_blank", "noopener,noreferrer");
    setBusy(null);
  };

  const handleStravaDisconnect = async () => {
    setBusy("STRAVA");
    const { error } = await supabase.functions.invoke("strava-disconnect");
    if (error) toast.error(L("Failed to disconnect", "中斷連結失敗"));
    else {
      setStravaConnected(false);
      toast.success(L("Strava disconnected", "已中斷 Strava 連結"));
    }
    setBusy(null);
  };

  const handleTerraConnect = async (provider: TerraProvider) => {
    if (hasTerraConn || hasFitnessApp) {
      toast.error(
        L(
          "Please disconnect the current fitness app first",
          "請先中斷現有健身應用再連接新的",
        ),
      );
      return;
    }
    setBusy(provider);
    try {
      const successUrl = new URL(window.location.origin + window.location.pathname);
      successUrl.searchParams.set("terra", "success");
      successUrl.searchParams.set("provider", provider);
      const failureUrl = new URL(window.location.origin + window.location.pathname);
      failureUrl.searchParams.set("terra", "failure");
      failureUrl.searchParams.set("provider", provider);

      const { data, error } = await supabase.functions.invoke("terra-auth-init", {
        body: {
          provider,
          success_url: successUrl.toString(),
          failure_url: failureUrl.toString(),
        },
      });
      if (error || !data?.auth_url) throw new Error(error?.message || "no auth url");

      // Desktop browser flow only — open in a new tab.
      window.open(data.auth_url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error((zh ? "Terra 啟動失敗: " : "Terra init failed: ") + (e?.message ?? ""));
    } finally {
      setBusy(null);
    }
  };

  const handleTerraSync = async (provider: TerraProvider) => {
    setBusy(provider);
    try {
      const { data, error } = await supabase.functions.invoke("terra-sync", {
        body: { provider },
      });
      if (error) throw error;
      toast.success(
        zh ? `已同步 ${data?.activities ?? 0} 個活動` : `Synced ${data?.activities ?? 0} activities`,
      );
      await loadTerraConns();
    } catch (e: any) {
      toast.error((zh ? "同步失敗: " : "Sync failed: ") + (e?.message ?? ""));
    } finally {
      setBusy(null);
    }
  };

  const handleTerraDisconnect = async (provider: TerraProvider) => {
    setBusy(provider);
    try {
      const { error } = await supabase.functions.invoke("terra-disconnect", {
        body: { provider },
      });
      if (error) throw error;
      toast.success(L("Disconnected", "已中斷連結"));
      await loadTerraConns();
    } catch (e: any) {
      toast.error((zh ? "中斷失敗: " : "Disconnect failed: ") + (e?.message ?? ""));
    } finally {
      setBusy(null);
    }
  };

  const handleGarminCredentialsConnect = () => {
    if (hasFitnessApp) {
      toast.error(
        L(
          "Please disconnect the current fitness app first",
          "請先中斷現有健身應用再連接新的",
        ),
      );
      return;
    }
    setGarminDialogOpen(true);
  };

  const handleGarminCredentialsDisconnect = async () => {
    setBusy("GARMIN_CREDS");
    const ok = await garmin.disconnect();
    if (ok) setGarminConnected(false);
    setBusy(null);
  };

  const handleGarminCredentialsSync = async () => {
    setBusy("GARMIN_CREDS");
    await garmin.syncActivities();
    setBusy(null);
  };

  // ── Providers ──
  const providers: ProviderCard[] = useMemo(
    () => [
      {
        id: "STRAVA",
        name: "Strava",
        category: "fitness",
        kind: "strava",
        accent: "bg-[#FC4C02]/10",
        icon: (
          <svg viewBox="0 0 24 24" className="w-7 h-7" fill="#FC4C02">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
        ),
        description: {
          en: "Sync runs, pace, heart-rate, splits and routes via official OAuth.",
          zh: "透過官方 OAuth 同步活動、配速、心率、分段與路線。",
        },
      },
      {
        id: "GARMIN",
        name: "Garmin Connect",
        category: "device",
        kind: "terra",
        terraId: "GARMIN",
        accent: "bg-muted",
        icon: <img src={garminIcon} alt="Garmin" className="w-10 h-10 rounded-md object-cover" />,
        description: {
          en: "Watch + cycling head-units, training load, sleep & body metrics.",
          zh: "錶款與單車碼錶、訓練負荷、睡眠與身體指標。",
        },
      },
      {
        id: "COROS",
        name: "COROS",
        category: "device",
        kind: "terra",
        terraId: "COROS",
        accent: "bg-muted",
        icon: <img src={corosIcon} alt="COROS" className="w-10 h-10 rounded-md object-cover" />,
        description: {
          en: "Running power, pace zones, and ultra-endurance activities.",
          zh: "跑步功率、配速區間與超耐力活動數據。",
        },
      },
      {
        id: "POLAR",
        name: "Polar",
        category: "device",
        kind: "terra",
        terraId: "POLAR",
        accent: "bg-muted",
        icon: <img src={polarIcon} alt="Polar" className="w-10 h-10 rounded-md object-cover" />,
        description: {
          en: "HR-first metrics from Polar wearables and chest straps.",
          zh: "Polar 穿戴與胸帶提供精準心率為主的數據。",
        },
      },
      {
        id: "SUUNTO",
        name: "Suunto",
        category: "device",
        kind: "terra",
        terraId: "SUUNTO",
        accent: "bg-muted",
        icon: <img src={suuntoIcon} alt="Suunto" className="w-10 h-10 rounded-md object-cover" />,
        description: {
          en: "Trail-ready GPS watches with elevation and route history.",
          zh: "適合越野的 GPS 錶款，提供爬升與路線歷史。",
        },
      },
      {
        id: "ZEPP",
        name: "Zepp",
        category: "device",
        kind: "terra",
        terraId: "ZEPP",
        accent: "bg-muted",
        icon: <img src={zeppIcon} alt="Zepp" className="w-10 h-10 rounded-md object-cover" />,
        description: {
          en: "Amazfit / Zepp watches: activities, HR and daily steps.",
          zh: "Amazfit / Zepp 錶款的活動、心率與每日步數。",
        },
      },
      {
        id: "APPLE_HEALTH",
        name: "Apple Health",
        category: "health",
        kind: "apple-health",
        accent: "bg-red-500/10",
        icon: <span className="text-2xl">❤️</span>,
        description: {
          en: "Daily steps, sleep & calories. Requires the iOS app to connect.",
          zh: "每日步數、睡眠與卡路里。需透過 iOS App 連結。",
        },
      },
    ],
    [],
  );

  const isConnected = (p: ProviderCard): boolean => {
    if (p.kind === "strava") return stravaConnected;
    if (p.kind === "apple-health") return appleHealthConnected;
    if (p.kind === "garmin-credentials") return garminConnected;
    if (p.kind === "terra" && p.terraId) return !!terraConns[p.terraId];
    return false;
  };

  const lastSync = (p: ProviderCard): string | null => {
    if (p.kind === "terra" && p.terraId) {
      const c = terraConns[p.terraId];
      return c?.last_synced_at ?? null;
    }
    return null;
  };

  const renderActions = (p: ProviderCard) => {
    const connected = isConnected(p);
    const isBusy =
      busy === p.id ||
      (p.kind === "terra" && p.terraId && busy === p.terraId) ||
      (p.kind === "strava" && busy === "STRAVA");
    const disabledByOther =
      !connected &&
      ((p.category !== "health" && hasFitnessApp) ||
        (p.kind === "terra" && hasTerraConn));

    if (p.kind === "apple-health") {
      // iOS-only — never connectable from a desktop browser.
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" />
          {L("iOS app only", "僅限 iOS App")}
        </div>
      );
    }

    if (connected) {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
            <Check className="h-3 w-3" />
            {L("Connected", "已連結")}
          </Badge>
          {p.kind === "terra" && p.terraId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTerraSync(p.terraId!)}
              disabled={isBusy}
            >
              {isBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">{L("Sync now", "立即同步")}</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isBusy}
            onClick={() => {
              if (p.kind === "strava") handleStravaDisconnect();
              else if (p.kind === "garmin-credentials") handleGarminCredentialsDisconnect();
              else if (p.kind === "terra" && p.terraId)
                handleTerraDisconnect(p.terraId);
            }}
          >
            {L("Disconnect", "中斷連結")}
          </Button>
        </div>
      );
    }

    return (
      <Button
        size="sm"
        disabled={isBusy || disabledByOther}
        onClick={() => {
          if (p.kind === "strava") handleStravaConnect();
          else if (p.kind === "garmin-credentials") handleGarminCredentialsConnect();
          else if (p.kind === "terra" && p.terraId) handleTerraConnect(p.terraId);
        }}
      >
        {isBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
        ) : (
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
        )}
        {disabledByOther
          ? L("Unavailable", "目前無法使用")
          : L("Connect in browser", "在瀏覽器中連結")}
      </Button>
    );
  };

  const grouped = useMemo(() => {
    const g: Record<string, ProviderCard[]> = { fitness: [], device: [], health: [] };
    providers.forEach((p) => g[p.category].push(p));
    return g;
  }, [providers]);

  return (
    <div>
      <DesktopPageHeader
        title={L("Connect apps", "連接應用")}
        subtitle={L(
          "Link your platforms and devices — opens normal browser tabs, no app deeplinks.",
          "連結你的平台與裝置 — 全程在瀏覽器中完成，不使用 App 深層連結。",
        )}
        icon={<Plug className="h-5 w-5" />}
      />

      {/* Info banners */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
        <Card className="p-4 flex items-start gap-3 bg-amber-500/5 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {L(
              "You can connect only one fitness platform at a time (Strava, Garmin, COROS, Polar, Suunto, or Zepp). Disconnect the current one before linking a new one.",
              "同一時間只能連接一個健身平台（Strava、Garmin、COROS、Polar、Suunto 或 Zepp 擇一）。請先中斷現有連結再連接新平台。",
            )}
          </p>
        </Card>
        <Card className="p-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {L(
              "OAuth opens in a new browser tab. After approving access, return to this tab — the connection refreshes automatically.",
              "OAuth 會在新分頁開啟。授權完成後返回此分頁，連線狀態會自動更新。",
            )}
          </p>
        </Card>
      </div>

      {/* Sections */}
      {(["fitness", "device", "health"] as const).map((section) => {
        const items = grouped[section];
        if (!items.length) return null;
        const title =
          section === "fitness"
            ? L("Fitness platforms", "健身平台")
            : section === "device"
              ? L("Devices & watches", "裝置與手錶")
              : L("Health data", "健康數據");
        return (
          <section key={section} className="mb-8">
            <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
              {title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((p) => {
                const connected = isConnected(p);
                const sync = lastSync(p);
                return (
                  <Card
                    key={p.id}
                    className={[
                      "p-5 flex flex-col gap-4 transition-all",
                      connected
                        ? "border-emerald-500/40 bg-emerald-500/[0.02]"
                        : "hover:border-primary/40 hover:shadow-sm",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={[
                          "w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden",
                          p.accent,
                        ].join(" ")}
                      >
                        {p.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-semibold text-base truncate">
                            {p.name}
                          </h3>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                          {p.description[zh ? "zh" : "en"]}
                        </p>
                        {sync && (
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            {L("Last synced", "上次同步")}:{" "}
                            {new Date(sync).toLocaleString(zh ? "zh-TW" : "en-US")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto pt-1 border-t border-border/40 -mx-5 px-5 pt-3">
                      {loading && p.kind !== "apple-health" ? (
                        <div className="h-8 flex items-center text-xs text-muted-foreground gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {L("Checking…", "檢查中…")}
                        </div>
                      ) : (
                        renderActions(p)
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      <GarminCredentialDialog
        open={garminDialogOpen}
        lang={lang}
        onOpenChange={setGarminDialogOpen}
        onSuccess={async () => {
          setGarminConnected(true);
          await garmin.syncActivities();
        }}
      />
    </div>
  );
}

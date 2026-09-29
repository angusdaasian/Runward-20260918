import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Check, RefreshCw } from "lucide-react";
import garminIcon from "@/assets/brands/garmin.png";
import corosIcon from "@/assets/brands/coros.png";
import polarIcon from "@/assets/brands/polar.png";
import fitbitIcon from "@/assets/brands/fitbit.png";
import zeppIcon from "@/assets/brands/zepp.png";

const PROVIDERS = [
  { id: "garmin", name: "Garmin", icon: garminIcon },
  { id: "coros", name: "COROS", icon: corosIcon },
  { id: "polar", name: "Polar", icon: polarIcon },
  { id: "fitbit", name: "Fitbit", icon: fitbitIcon },
  { id: "zepp", name: "Zepp (Amazfit)", icon: zeppIcon },
];
import despia from "despia-native";
import { isDespiaUA } from "@/lib/despiaOAuth";

// Watch connections via Stridee. Non-admins may link one brand; admins can link several for testing.
// Renders one section box per provider, matching the other Connect Apps rows.
export default function StrideeTestCard({ lang, blockedByOther = false, onBeforeConnect }: { lang: string; blockedByOther?: boolean; onBeforeConnect?: () => Promise<void> }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [conn, setConn] = useState<{ status: string; last_synced_at: string | null; provider?: string; providers?: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const zh = lang === "zh";

  const load = async () => {
    if (!user) return;
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    setIsAdmin(!!role);
    const { data } = await (supabase as any).from("stridee_connections").select("status, last_synced_at, provider, providers").eq("user_id", user.id).maybeSingle();
    setConn(data ?? null);
  };
  useEffect(() => { void load(); }, [user?.id]);
  // Re-check when the user comes back from the sign-in window.
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      void load();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    const t = conn?.status === "pending" ? setInterval(() => void load(), 4000) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      if (t) clearInterval(t);
    };
  }, [user?.id, conn?.status]);

  const connect = async (provider: string) => {
    if (!isAdmin && blockedByOther) {
      toast.error(zh ? "請先中斷現有的健身應用連結" : "Disconnect your current fitness app first");
      return;
    }
    setBusy(provider);
    if (!isAdmin && onBeforeConnect) await onBeforeConnect();
    const { data, error } = await supabase.functions.invoke("stridee-connect", {
      // Garmin: Safari-only flow — no in-app window, plain return page.
      body: { action: "connect", native: isDespiaUA() && provider !== "garmin", provider },
    });
    setBusy(null);
    if (error) { toast.error(zh ? "連結失敗" : "Connect failed"); console.error(error, data); return; }
    if (data?.already_connected) {
      await load();
      toast.success(zh ? "已連結，毋須再次授權" : "Already connected — no approval needed");
      return;
    }
    if (!data?.connect_url) { toast.error(zh ? "連結失敗" : "Connect failed"); console.error(data); return; }
    if (isDespiaUA() && provider === "garmin") {
      // api.stridee.com is in Despia External Links, so navigating there opens
      // Safari. The return page in Safari then deep-links back into RunWard.
      toast(zh ? "正在 Safari 開啟 Garmin…" : "Opening Garmin in Safari…");
      window.location.href = data.connect_url;
      return;
    }
    if (isDespiaUA()) {
      const bridge = `${window.location.origin}/stridee-bridge?` +
        new URLSearchParams({ url: data.connect_url, sid: data.stridee_user_id ?? "" }).toString();
      despia(`oauth://?url=${encodeURIComponent(bridge)}`);
      return;
    }
    window.open(data.connect_url, "_blank");
  };
  const sync = async (provider: string) => {
    setBusy(provider);
    const { data, error } = await supabase.functions.invoke("stridee-sync", { body: {} });
    setBusy(null);
    if (error) { toast.error(zh ? "同步失敗" : "Sync failed"); return; }
    toast.success(zh ? `已同步 ${data?.stored ?? 0} 項活動` : `Synced ${data?.stored ?? 0} activities`);
    void load();
  };
  const disconnect = async (provider: string) => {
    setBusy(provider);
    await supabase.functions.invoke("stridee-connect", { body: { action: "disconnect" } });
    setBusy(null);
    void load();
  };

  const connected = conn?.status === "connected";
  const connectedProviders: string[] = conn?.providers?.length
    ? conn.providers
    : conn?.provider
      ? [conn.provider]
      : [];

  return (
    <>
      {PROVIDERS.map((p) => {
        const isConn = connected && connectedProviders.includes(p.id);
        const isPending = conn?.status === "pending" && connectedProviders.includes(p.id);
        // Non-admins: one watch only — disable the other brands once connected,
        // and disable all when another fitness app (Strava/Suunto/intervals) is linked.
        // A pending brand stays tappable so users who quit the approval window
        // can simply try again.
        const disabled = !isConn && !isPending && !isAdmin && ((conn != null) || blockedByOther);
        return (
          <div key={p.id} className={`bg-card border border-border rounded-xl p-4 ${disabled ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                  <img src={p.icon} alt={p.name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <span className="font-medium text-foreground block">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {isConn
                      ? (zh ? "已連結" : "Connected") + (conn?.last_synced_at ? ` · ${new Date(conn.last_synced_at).toLocaleString()}` : "")
                      : isPending
                        ? (zh ? "等待授權中" : "Waiting for approval")
                        : (zh ? "同步跑步活動數據、配速、心率、海拔及訓練負荷" : "Sync running activity data, pace, heart rate, elevation & training load")}
                  </span>
                </div>
              </div>
              {isConn ? (
                <div className="flex items-center gap-2">
                  {busy === p.id && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
                  <Check size={16} className="text-green-500" />
                  <button
                    onClick={() => sync(p.id)}
                    disabled={!!busy}
                    className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                  >
                    {zh ? "同步" : "Sync"}
                  </button>
                  <button
                    onClick={() => disconnect(p.id)}
                    disabled={!!busy}
                    className="text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    {zh ? "中斷" : "Disconnect"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => connect(p.id)}
                  disabled={!!busy || disabled}
                  className={`text-xs font-medium px-3 py-1 rounded-full disabled:cursor-not-allowed ${
                    disabled
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground disabled:opacity-50"
                  }`}
                >
                  {busy === p.id ? "..." : (zh ? "連結" : "Connect")}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

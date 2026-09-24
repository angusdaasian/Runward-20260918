import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import despia from "despia-native";
import { isDespiaUA } from "@/lib/despiaOAuth";

const GARMIN_NATIVE_RETURN_KEY = "stridee_garmin_native_return";
const GARMIN_RESTART_DELAY_MS = 1500;

type DespiaLifecycleWindow = Window & {
  focusin?: () => void;
};

// Admin-only trial of Garmin via Stridee. Hidden for everyone else.
export default function StrideeTestCard({ lang }: { lang: string }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [conn, setConn] = useState<{ status: string; last_synced_at: string | null; provider?: string; providers?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const zh = lang === "zh";

  const load = async () => {
    if (!user) return;
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    setIsAdmin(!!role);
    const { data } = await (supabase as any).from("stridee_connections").select("status, last_synced_at, provider, providers").eq("user_id", user.id).maybeSingle();
    setConn(data ?? null);
  };
  useEffect(() => { void load(); }, [user?.id]);
  // Re-check when the user comes back from the Garmin sign-in window.
  useEffect(() => {
    const closeGarminBrowser = () => {
      const armedAt = Number(sessionStorage.getItem(GARMIN_NATIVE_RETURN_KEY));
      if (!(armedAt > 0) || Date.now() - armedAt < GARMIN_RESTART_DELAY_MS) return false;
      sessionStorage.removeItem(GARMIN_NATIVE_RETURN_KEY);
      // Despia closes an oauth:// browser only when it receives the matching
      // app-scheme callback. reset:// refreshes the WebView underneath but does
      // not dismiss the OAuth browser layer.
      window.location.href = "runward://oauth/stridee-return?status=resume&page=connect-apps";
      return true;
    };
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (closeGarminBrowser()) return;
      void load();
    };
    const onVisibility = () => {
      onReturn();
    };
    // Despia does not reliably dispatch the browser's standard focus event when
    // an external provider app returns. Its native runtime calls window.focusin.
    const nativeWindow = window as DespiaLifecycleWindow;
    const previousFocusIn = nativeWindow.focusin;
    nativeWindow.focusin = () => {
      previousFocusIn?.();
      onReturn();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onReturn);
    const t = conn?.status === "pending" ? setInterval(() => void load(), 4000) : undefined;
    return () => {
      nativeWindow.focusin = previousFocusIn;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onReturn);
      if (t) clearInterval(t);
    };
  }, [user?.id, conn?.status]);

  // If the connection completes while Despia's OAuth browser is still covering
  // the app, send the same callback immediately instead of waiting for focus.
  useEffect(() => {
    if (conn?.status !== "connected") return;
    const armedAt = Number(sessionStorage.getItem(GARMIN_NATIVE_RETURN_KEY));
    if (!(armedAt > 0)) return;
    sessionStorage.removeItem(GARMIN_NATIVE_RETURN_KEY);
    window.location.href = "runward://oauth/stridee-return?status=success&page=connect-apps";
  }, [conn?.status]);

  if (!isAdmin) return null;

  const connect = async (provider: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("stridee-connect", {
      body: { action: "connect", native: isDespiaUA(), provider },
    });
    setBusy(false);
    if (error) { toast.error(zh ? "Stridee 連結失敗" : "Stridee connect failed"); console.error(error, data); return; }
    if (data?.already_connected) {
      await load();
      toast.success(zh ? "已連結，毋須再次授權" : "Already connected — no approval needed");
      return;
    }
    if (!data?.connect_url) { toast.error(zh ? "Stridee 連結失敗" : "Stridee connect failed"); console.error(data); return; }
    // Stridee launches Garmin from a second page, so wrapping its first page in
    // Despia's oauth:// session leaves that first page open. A blank-target link
    // lets Despia route the whole flow to the normal phone browser instead.
    if (isDespiaUA()) {
      // Open our own bridge page in Despia's in-app browser. It opens Stridee,
      // watches for the connection and then fires runward://oauth/... which
      // makes Despia close the in-app browser and return to RunWard.
      const bridge = `${window.location.origin}/stridee-bridge?` +
        new URLSearchParams({ url: data.connect_url, sid: data.stridee_user_id ?? "" }).toString();
      if (provider === "garmin") sessionStorage.setItem(GARMIN_NATIVE_RETURN_KEY, String(Date.now()));
      despia(`oauth://?url=${encodeURIComponent(bridge)}`);
      return;
    }
    window.open(data.connect_url, "_blank");
  };
  const sync = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("stridee-sync", { body: {} });
    setBusy(false);
    if (error) { toast.error(zh ? "同步失敗" : "Sync failed"); return; }
    toast.success(zh ? `已同步 ${data?.stored ?? 0} 項活動` : `Synced ${data?.stored ?? 0} activities`);
    void load();
  };
  const disconnect = async () => {
    setBusy(true);
    await supabase.functions.invoke("stridee-connect", { body: { action: "disconnect" } });
    setBusy(false);
    void load();
  };

  const connected = conn?.status === "connected";
  const cur = PROVIDERS.find((p) => p.id === (conn?.provider ?? "garmin")) ?? PROVIDERS[0];
  return (
    <div className="rounded-xl border border-dashed border-primary/50 bg-card p-4 mb-6">
      <div className="flex items-center gap-3">
        <img src={conn ? cur.icon : garminIcon} alt={cur.name} className="w-9 h-9 rounded-lg" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">{conn?.providers?.length ? PROVIDERS.filter((p) => conn.providers!.includes(p.id)).map((p) => p.name).join(", ") : (zh ? "手錶" : "Watches")} (Stridee) · {zh ? "管理員測試" : "Admin trial"}</p>
          <p className="text-xs text-muted-foreground">
            {connected
              ? (zh ? "已連結" : "Connected") + (conn?.last_synced_at ? ` · ${new Date(conn.last_synced_at).toLocaleString()}` : "")
              : conn?.status === "pending" ? (zh ? "等待授權中" : "Waiting for approval") : (zh ? "未連結" : "Not connected")}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 mt-3">
        {(
          <div className="grid grid-cols-2 gap-2 flex-1">
            {PROVIDERS.filter((p) => !(conn?.providers ?? []).includes(p.id)).map((p) => (
              <Button key={p.id} variant="outline" disabled={busy} onClick={() => connect(p.id)} className="justify-start gap-2">
                <img src={p.icon} alt="" className="w-5 h-5 rounded" />{p.name}
              </Button>
            ))}
          </div>
        )}

        {connected && <Button disabled={busy} onClick={sync} className="flex-1">{zh ? "立即同步" : "Sync now"}</Button>}
        {conn && <Button variant="outline" disabled={busy} onClick={disconnect}>{zh ? "移除" : "Remove"}</Button>}
      </div>
    </div>
  );
}

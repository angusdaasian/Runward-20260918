import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import despia from "despia-native";
import { isDespiaUA } from "@/lib/despiaOAuth";
import garminIcon from "@/assets/brands/garmin.png";

// Admin-only trial of Garmin via Stridee. Hidden for everyone else.
export default function StrideeTestCard({ lang }: { lang: string }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [conn, setConn] = useState<{ status: string; last_synced_at: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const zh = lang === "zh";

  const load = async () => {
    if (!user) return;
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    setIsAdmin(!!role);
    const { data } = await (supabase as any).from("stridee_connections").select("status, last_synced_at").eq("user_id", user.id).maybeSingle();
    setConn(data ?? null);
  };
  useEffect(() => { void load(); }, [user?.id]);
  // Re-check when the user comes back from the Garmin sign-in window.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    const t = conn?.status === "pending" ? setInterval(() => void load(), 4000) : undefined;
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); if (t) clearInterval(t); };
  }, [user?.id, conn?.status]);

  if (!isAdmin) return null;

  const connect = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("stridee-connect", { body: { action: "connect" } });
    setBusy(false);
    if (error) { toast.error(zh ? "Stridee 連結失敗" : "Stridee connect failed"); console.error(error, data); return; }
    if (data?.already_connected) {
      await load();
      toast.success(zh ? "Garmin 已連結，毋須再次授權" : "Garmin is already connected — no approval needed");
      return;
    }
    if (!data?.connect_url) { toast.error(zh ? "Stridee 連結失敗" : "Stridee connect failed"); console.error(data); return; }
    // In the app, open the normal outside browser (not the in-app OAuth sheet,
    // which cannot be closed reliably). The card polls and flips to Connected.
    if (isDespiaUA()) window.open(data.connect_url, "_blank");
    else window.location.href = data.connect_url;
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
  return (
    <div className="rounded-xl border border-dashed border-primary/50 bg-card p-4 mb-6">
      <div className="flex items-center gap-3">
        <img src={garminIcon} alt="Garmin" className="w-9 h-9 rounded-lg" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">Garmin (Stridee) · {zh ? "管理員測試" : "Admin trial"}</p>
          <p className="text-xs text-muted-foreground">
            {connected
              ? (zh ? "已連結" : "Connected") + (conn?.last_synced_at ? ` · ${new Date(conn.last_synced_at).toLocaleString()}` : "")
              : conn?.status === "pending" ? (zh ? "等待授權中" : "Waiting for approval") : (zh ? "未連結" : "Not connected")}
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        {!connected && <button disabled={busy} onClick={connect} className="flex-1 rounded-lg bg-primary text-primary-foreground text-sm py-2 disabled:opacity-50">{zh ? "連結" : "Connect"}</button>}
        {connected && <button disabled={busy} onClick={sync} className="flex-1 rounded-lg bg-primary text-primary-foreground text-sm py-2 disabled:opacity-50">{zh ? "立即同步" : "Sync now"}</button>}
        {conn && <button disabled={busy} onClick={disconnect} className="rounded-lg border border-border text-sm px-3 py-2 text-foreground disabled:opacity-50">{zh ? "移除" : "Remove"}</button>}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RefreshCw, Link as LinkIcon, Unlink } from "lucide-react";

type ConnRow = { suunto_username: string; expires_at: number; updated_at: string };

const SuuntoSyncTester = () => {
  const { user } = useAuth();
  const [conn, setConn] = useState<ConnRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(30);
  const [lastResult, setLastResult] = useState<string>("");

  const loadConn = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("suunto_connections")
      .select("suunto_username, expires_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    setConn(data ?? null);
  };

  useEffect(() => { loadConn(); }, [user]);

  // If this window was opened as a Suunto OAuth popup, forward the code to the
  // opener and close. Suunto returns ?code=... (and sometimes ?state=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(
          { type: "suunto-oauth", code },
          window.location.origin,
        );
      } catch (_) { /* ignore */ }
      window.close();
    }
  }, []);

  // Listen for the popup's postMessage and complete the callback exchange.
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data: any = e.data;
      if (!data || data.type !== "suunto-oauth" || !data.code) return;
      setBusy("connect");
      try {
        const redirect_uri = `${window.location.origin}/admin`;
        const { data: res, error } = await supabase.functions.invoke("suunto-callback", {
          body: { code: data.code, redirect_uri },
        });
        if (error || !(res as any)?.success) {
          throw new Error((res as any)?.error || error?.message || "Callback failed");
        }
        toast.success(`Suunto connected: ${(res as any).username}`);
        await loadConn();
      } catch (err: any) {
        toast.error(err?.message || "Suunto connect failed");
      } finally {
        setBusy(null);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const handleConnect = async () => {
    // Match the Terra ConnectApps pattern: get the auth URL, then open it in
    // a new tab. No `noopener` because we rely on window.opener.postMessage
    // from the returned /admin?code=... page to complete the exchange.
    setBusy("connect");
    try {
      const redirect_uri = `${window.location.origin}/admin`;
      const { data, error } = await supabase.functions.invoke("suunto-auth", {
        body: { redirect_uri },
      });
      if (error || !(data as any)?.url) {
        throw new Error((data as any)?.error || error?.message || "Auth init failed");
      }
      window.open((data as any).url as string, "_blank");
    } catch (e: any) {
      toast.error(e?.message || "Failed to start Suunto auth");
      setBusy(null);
    }
  };


  const handleDisconnect = async () => {
    setBusy("disconnect");
    try {
      const { error } = await supabase.functions.invoke("suunto-disconnect");
      if (error) throw error;
      toast.success("Suunto disconnected");
      await loadConn();
    } catch (e: any) {
      toast.error(e?.message || "Disconnect failed");
    } finally { setBusy(null); }
  };

  const handleSync = async () => {
    setBusy("sync");
    setLastResult("");
    try {
      const { data, error } = await supabase.functions.invoke("suunto-sync", {
        body: { sinceDays },
      });
      if (error) throw error;
      const pretty = JSON.stringify(data, null, 2);
      setLastResult(pretty);
      toast.success(`Synced ${(data as any)?.count ?? 0} workout(s)`);
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Suunto Sync (Official API)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Uses the official Suunto Cloud API v2 (subscription required). Webhook endpoint:{" "}
            <code>/functions/v1/suunto-webhook</code>.
          </p>

          <div className="rounded-md border border-border p-3 text-sm">
            {conn ? (
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Username:</span> <b>{conn.suunto_username}</b></div>
                <div>
                  <span className="text-muted-foreground">Token expires:</span>{" "}
                  {new Date(conn.expires_at * 1000).toLocaleString()}
                </div>
                <div className="text-muted-foreground text-xs">
                  Last updated {new Date(conn.updated_at).toLocaleString()}
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">Not connected to Suunto.</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!conn ? (
              <Button onClick={handleConnect} disabled={busy !== null}>
                <LinkIcon className="h-4 w-4 mr-2" />
                {busy === "connect" ? "Connecting…" : "Connect Suunto"}
              </Button>
            ) : (
              <>
                <Button variant="destructive" onClick={handleDisconnect} disabled={busy !== null}>
                  <Unlink className="h-4 w-4 mr-2" />
                  {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
                </Button>
              </>
            )}
          </div>

          {conn && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="suuntoSinceDays">Since (days back)</Label>
                  <Input
                    id="suuntoSinceDays"
                    type="number"
                    min={1}
                    max={365}
                    value={sinceDays}
                    onChange={(e) => setSinceDays(Math.max(1, Number(e.target.value) || 30))}
                    className="w-32"
                  />
                </div>
                <Button onClick={handleSync} disabled={busy !== null}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${busy === "sync" ? "animate-spin" : ""}`} />
                  Sync workouts
                </Button>
              </div>

              {lastResult && (
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-[480px]">
                  {lastResult}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuuntoSyncTester;

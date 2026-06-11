import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw, Link as LinkIcon, Unlink } from "lucide-react";
import despia from "despia-native";
import { isDespiaUA } from "@/lib/despiaOAuth";

type ConnRow = { polar_user_id: number; member_id: string; expires_at: number; updated_at: string };
type WebhookRow = { id: string; url: string; events: string[]; created_at: string };

const POLAR_PENDING_REDIRECT_KEY = "polar_pending_redirect_uri";

const PolarSyncTester = () => {
  const { user } = useAuth();
  const [conn, setConn] = useState<ConnRow | null>(null);
  const [webhook, setWebhook] = useState<WebhookRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string>("");

  const webhookUrl = `https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/polar-webhook`;

  const loadConn = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("polar_connections" as any)
      .select("polar_user_id, member_id, expires_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    setConn((data as unknown as ConnRow | null) ?? null);
  };

  const loadWebhook = async () => {
    const { data } = await supabase
      .from("polar_webhooks" as any)
      .select("id, url, events, created_at")
      .limit(1)
      .maybeSingle();
    setWebhook((data as unknown as WebhookRow | null) ?? null);
  };

  useEffect(() => { loadConn(); loadWebhook(); }, [user]);

  const handleCreateWebhook = async () => {
    setBusy("webhook-create");
    try {
      const { data, error } = await supabase.functions.invoke("polar-webhook-manage", {
        body: { action: "create", url: webhookUrl, events: ["EXERCISE"] },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error(JSON.stringify((data as any)?.polar ?? data));
      toast.success("Webhook created");
      setLastResult(JSON.stringify(data, null, 2));
      await loadWebhook();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create webhook");
    } finally { setBusy(null); }
  };

  const handleDeleteWebhook = async () => {
    if (!webhook) return;
    setBusy("webhook-delete");
    try {
      const { data, error } = await supabase.functions.invoke("polar-webhook-manage", {
        body: { action: "delete", id: webhook.id },
      });
      if (error) throw error;
      toast.success("Webhook deleted");
      setLastResult(JSON.stringify(data, null, 2));
      await loadWebhook();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete webhook");
    } finally { setBusy(null); }
  };

  const handleListWebhook = async () => {
    setBusy("webhook-list");
    try {
      const { data, error } = await supabase.functions.invoke("polar-webhook-manage", {
        body: { action: "list" },
      });
      if (error) throw error;
      setLastResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      toast.error(e?.message || "Failed to list webhooks");
    } finally { setBusy(null); }
  };

  const handleConnect = async () => {
    setBusy("connect");
    try {
      const native = isDespiaUA();
      const redirect_uri = `${window.location.origin}/polar/callback`;
      localStorage.setItem(POLAR_PENDING_REDIRECT_KEY, redirect_uri);
      localStorage.setItem("polar_pending_origin", "admin");
      if (native) localStorage.setItem("polar_pending_native", "runward");
      else localStorage.removeItem("polar_pending_native");

      const { data, error } = await supabase.functions.invoke("polar-auth", {
        body: { redirect_uri },
      });
      if (error || !(data as any)?.url) {
        throw new Error((data as any)?.error || error?.message || "Auth init failed");
      }

      if (native) {
        despia(`oauth://?url=${encodeURIComponent((data as any).url as string)}`);
        setBusy(null);
      } else {
        window.location.href = (data as any).url as string;
      }
    } catch (e: any) {
      localStorage.removeItem(POLAR_PENDING_REDIRECT_KEY);
      toast.error(e?.message || "Failed to start Polar auth");
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    try {
      const { error } = await supabase.functions.invoke("polar-disconnect");
      if (error) throw error;
      toast.success("Polar disconnected");
      await loadConn();
    } catch (e: any) {
      toast.error(e?.message || "Disconnect failed");
    } finally { setBusy(null); }
  };

  const handleSync = async () => {
    setBusy("sync");
    setLastResult("");
    try {
      const { data, error } = await supabase.functions.invoke("polar-sync", { body: {} });
      if (error) throw error;
      const pretty = JSON.stringify(data, null, 2);
      setLastResult(pretty);
      toast.success(`Synced ${(data as any)?.count ?? 0} exercise(s)`);
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Polar AccessLink Sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Uses the official Polar AccessLink API v3. Make sure the redirect URI{" "}
            <code>{window.location.origin}/polar/callback</code> is registered in your
            Polar Application's Authorization redirect URLs.
          </p>

          <div className="rounded-md border border-border p-3 text-sm">
            {conn ? (
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Polar user ID:</span> <b>{conn.polar_user_id}</b></div>
                <div><span className="text-muted-foreground">Member ID:</span> <code>{conn.member_id}</code></div>
                <div>
                  <span className="text-muted-foreground">Token expires:</span>{" "}
                  {new Date(conn.expires_at * 1000).toLocaleString()}
                </div>
                <div className="text-muted-foreground text-xs">
                  Last updated {new Date(conn.updated_at).toLocaleString()}
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">Not connected to Polar.</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!conn ? (
              <Button onClick={handleConnect} disabled={busy !== null}>
                <LinkIcon className="h-4 w-4 mr-2" />
                {busy === "connect" ? "Connecting…" : "Connect Polar"}
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleDisconnect} disabled={busy !== null}>
                <Unlink className="h-4 w-4 mr-2" />
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </Button>
            )}
          </div>

          {conn && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                AccessLink uses a transaction model — sync pulls all new exercises
                since the last commit. Old data already synced won't reappear.
              </p>
              <Button onClick={handleSync} disabled={busy !== null}>
                <RefreshCw className={`h-4 w-4 mr-2 ${busy === "sync" ? "animate-spin" : ""}`} />
                Sync new exercises
              </Button>

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

export default PolarSyncTester;

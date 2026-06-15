import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type AppRow = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  contact_email: string;
  website_url: string | null;
  redirect_uris: string[];
  webhook_url: string | null;
  client_id: string;
  client_secret_prefix: string | null;
  status: "pending" | "active" | "suspended" | "rejected";
  max_athletes: number;
  rate_limit_15min: number;
  rate_limit_daily: number;
  rejection_reason: string | null;
  created_at: string;
};

export default function DeveloperAppsManager() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, { secret?: string; signing?: string; verify?: string }>>({});
  const [rejectFor, setRejectFor] = useState<AppRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-developer-apps", { method: "GET" });
    if (error) {
      toast.error(error.message);
    } else {
      setApps((data as any)?.apps ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const act = async (app_id: string, action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("admin-developer-apps", {
      body: { app_id, action, ...extra },
    });
    if (error || (data as any)?.error) {
      toast.error(error?.message || JSON.stringify((data as any)?.error));
      return null;
    }
    return data as any;
  };

  const approve = async (app: AppRow) => {
    const res = await act(app.id, "approve");
    if (res?.client_secret) {
      setRevealed((r) => ({ ...r, [app.id]: { secret: res.client_secret, signing: res.webhook_signing_secret, verify: res.webhook_verify_token } }));
      toast.success("App approved. Credentials shown once below.");
      load();
    }
  };

  const reject = async () => {
    if (!rejectFor) return;
    const res = await act(rejectFor.id, "reject", { rejection_reason: rejectReason });
    if (res) {
      toast.success("App rejected");
      setRejectFor(null); setRejectReason("");
      load();
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Developer Apps</CardTitle></CardHeader>
        <CardContent>
          {loading ? "Loading…" : apps.length === 0 ? (
            <p className="text-muted-foreground text-sm">No apps yet.</p>
          ) : (
            <div className="space-y-3">
              {apps.map((a) => (
                <div key={a.id} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        {a.name}
                        <Badge variant={a.status === "active" ? "default" : a.status === "pending" ? "secondary" : "outline"}>
                          {a.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{a.contact_email} · {new Date(a.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex gap-2">
                      {a.status === "pending" && (
                        <>
                          <Button size="sm" onClick={() => approve(a)}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => setRejectFor(a)}>Reject</Button>
                        </>
                      )}
                      {a.status === "active" && (
                        <Button size="sm" variant="outline" onClick={async () => { if (await act(a.id, "suspend")) { toast.success("Suspended"); load(); }}}>Suspend</Button>
                      )}
                      {a.status === "suspended" && (
                        <Button size="sm" onClick={async () => { if (await act(a.id, "reactivate")) { toast.success("Reactivated"); load(); }}}>Reactivate</Button>
                      )}
                    </div>
                  </div>
                  {a.description && <p className="text-sm">{a.description}</p>}
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>client_id: <code>{a.client_id}</code></div>
                    {a.website_url && <div>website: {a.website_url}</div>}
                    {a.webhook_url && <div>webhook: <code>{a.webhook_url}</code></div>}
                    <div>redirect_uris: <code>{a.redirect_uris.join(", ")}</code></div>
                    <div>caps: {a.max_athletes} athletes · {a.rate_limit_15min}/15m · {a.rate_limit_daily}/day</div>
                  </div>
                  {revealed[a.id]?.secret && (
                    <div className="bg-muted rounded p-2 text-xs space-y-1">
                      <div className="font-semibold text-destructive">Shown once — copy now:</div>
                      <div><b>client_secret:</b> <code className="break-all">{revealed[a.id].secret}</code></div>
                      <div><b>webhook_signing_secret:</b> <code className="break-all">{revealed[a.id].signing}</code></div>
                      <div><b>webhook_verify_token:</b> <code className="break-all">{revealed[a.id].verify}</code></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject {rejectFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

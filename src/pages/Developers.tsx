import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, RotateCw } from "lucide-react";

type App = {
  id: string;
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

export default function Developers() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [apps, setApps] = useState<App[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    website_url: "",
    contact_email: "",
    redirect_uris: "",
    webhook_url: "",
  });
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  const load = async () => {
    const { data, error } = await supabase.functions.invoke("developer-apps", { method: "GET" });
    if (error) { toast.error(error.message); return; }
    setApps((data as any)?.apps ?? []);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const create = async () => {
    setSubmitting(true);
    const redirect_uris = form.redirect_uris.split(/\s+|,/).map((s) => s.trim()).filter(Boolean);
    const { data, error } = await supabase.functions.invoke("developer-apps?action=create", {
      body: { ...form, redirect_uris, webhook_url: form.webhook_url || undefined, website_url: form.website_url || undefined, description: form.description || undefined },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast.error(error?.message || JSON.stringify((data as any)?.error));
      return;
    }
    toast.success("App submitted. Pending admin review.");
    setCreateOpen(false);
    setForm({ name: "", description: "", website_url: "", contact_email: "", redirect_uris: "", webhook_url: "" });
    load();
  };

  const rotate = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("developer-apps?action=rotate_secret", { body: { id } });
    if (error || (data as any)?.error) { toast.error(error?.message || "Failed"); return; }
    setRevealedSecret((data as any).client_secret);
    load();
  };

  if (loading || !user) return <div className="p-8">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-lg font-semibold">Developer Portal</h1>
        <div className="ml-auto">
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />New app</Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        <Card>
          <CardHeader><CardTitle>Build on Runward</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Create OAuth apps to let Runward users connect their account and stream new activities to your service.</p>
            <p>Apps are reviewed manually. Limits: 200 requests / 15 min, 2,000 / day, up to 300 athletes per app.</p>
            <p>Docs: OAuth code flow with PKCE · Bearer tokens on <code>/api-v1/activities</code> · HMAC-signed webhooks on new activities.</p>
          </CardContent>
        </Card>

        {apps.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No apps yet. Create one to get started.</CardContent></Card>
        ) : apps.map((a) => (
          <Card key={a.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {a.name}
                <Badge variant={a.status === "active" ? "default" : a.status === "pending" ? "secondary" : "outline"}>{a.status}</Badge>
              </CardTitle>
              {a.status === "active" && (
                <Button size="sm" variant="outline" onClick={() => rotate(a.id)}><RotateCw className="h-3 w-3 mr-1" />Rotate secret</Button>
              )}
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {a.description && <p>{a.description}</p>}
              <div className="text-xs text-muted-foreground">
                <div><b>client_id:</b> <code>{a.client_id}</code></div>
                {a.client_secret_prefix && <div><b>client_secret:</b> <code>{a.client_secret_prefix}…</code> (rotate to view full)</div>}
                <div><b>redirect_uris:</b> {a.redirect_uris.join(", ")}</div>
                {a.webhook_url && <div><b>webhook_url:</b> <code>{a.webhook_url}</code></div>}
                <div><b>limits:</b> {a.max_athletes} athletes · {a.rate_limit_15min}/15m · {a.rate_limit_daily}/day</div>
                {a.status === "rejected" && a.rejection_reason && <div className="text-destructive">Rejection reason: {a.rejection_reason}</div>}
              </div>
            </CardContent>
          </Card>
        ))}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New developer app</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>App name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Website URL</Label><Input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://" /></div>
            <div><Label>Contact email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
            <div><Label>Redirect URIs (one per line)</Label><Textarea rows={3} value={form.redirect_uris} onChange={(e) => setForm({ ...form, redirect_uris: e.target.value })} placeholder="https://yourapp.com/callback" /></div>
            <div><Label>Webhook URL (optional)</Label><Input value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} placeholder="https://yourapp.com/runward/webhook" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={submitting || !form.name || !form.contact_email || !form.redirect_uris}>Submit for review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealedSecret} onOpenChange={(o) => !o && setRevealedSecret(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Client secret</DialogTitle></DialogHeader>
          <p className="text-sm text-destructive">Shown only once. Store it now.</p>
          <code className="block bg-muted p-3 rounded break-all text-xs">{revealedSecret}</code>
          <DialogFooter><Button onClick={() => setRevealedSecret(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck } from "lucide-react";

interface StravaAppRow {
  id: string;
  client_id: string;
  client_secret: string | null;
  verify_token: string | null;
  client_secret_vault_id: string | null;
  verify_token_vault_id: string | null;
  subscription_id: number | null;
  max_athletes: number;
  priority: number;
  is_active: boolean;
  notes: string | null;
}

const emptyForm = {
  client_id: "",
  client_secret: "",
  verify_token: "",
  subscription_id: "",
  max_athletes: "10",
  priority: "0",
  is_active: true,
  notes: "",
};

const StravaAppsManager = () => {
  const [apps, setApps] = useState<StravaAppRow[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("strava_apps")
      .select("*")
      .order("priority", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setApps((rows ?? []) as StravaAppRow[]);

    const counts: Record<string, number> = {};
    for (const row of rows ?? []) {
      const { count } = await supabase
        .from("strava_connections")
        .select("id", { count: "exact", head: true })
        .eq("strava_app_id", row.id);
      counts[row.id] = count ?? 0;
    }
    setUsage(counts);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row: StravaAppRow) => {
    setEditingId(row.id);
    setForm({
      client_id: row.client_id,
      client_secret: "",
      verify_token: "",
      subscription_id: row.subscription_id?.toString() ?? "",
      max_athletes: row.max_athletes.toString(),
      priority: row.priority.toString(),
      is_active: row.is_active,
      notes: row.notes ?? "",
    });
    setDialogOpen(true);
  };

  const writeSecret = async (appId: string, kind: "client_secret" | "verify_token", value: string) => {
    const { error } = await supabase.functions.invoke("strava-app-secret", {
      body: { app_id: appId, kind, value },
    });
    if (error) throw new Error(`${kind}: ${error.message}`);
  };

  const save = async () => {
    if (!form.client_id.trim()) {
      toast.error("Client ID is required");
      return;
    }
    setSaving(true);
    const payload: any = {
      client_id: form.client_id.trim(),
      subscription_id: form.subscription_id.trim() ? Number(form.subscription_id) : null,
      max_athletes: Number(form.max_athletes) || 10,
      priority: Number(form.priority) || 0,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    };

    try {
      let appId = editingId;
      if (appId) {
        const { error } = await supabase.from("strava_apps").update(payload).eq("id", appId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("strava_apps")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        appId = data.id;
      }

      const cs = form.client_secret.trim();
      const vt = form.verify_token.trim();
      if (cs) await writeSecret(appId!, "client_secret", cs);
      if (vt) await writeSecret(appId!, "verify_token", vt);

      toast.success(editingId ? "Strava app updated" : "Strava app added");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const secretBadge = (set: boolean) =>
    set ? (
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="h-3 w-3" /> Vault
      </Badge>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Strava Apps</CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Add App
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          Each Strava API app is capped at 10 athletes until your application is approved (then raise{" "}
          <code>max_athletes</code> to 999). Secrets are stored encrypted in Supabase Vault — they never leave the
          server and cannot be read from the dashboard.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Cap</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Secret</TableHead>
                  <TableHead>Verify Token</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => {
                  const used = usage[app.id] ?? 0;
                  const full = used >= app.max_athletes;
                  return (
                    <TableRow key={app.id}>
                      <TableCell className="font-mono">{app.client_id}</TableCell>
                      <TableCell>
                        <Badge variant={full ? "destructive" : "secondary"}>
                          {used} / {app.max_athletes}
                        </Badge>
                      </TableCell>
                      <TableCell>{app.max_athletes}</TableCell>
                      <TableCell>{app.priority}</TableCell>
                      <TableCell>{secretBadge(!!app.client_secret_vault_id)}</TableCell>
                      <TableCell>{secretBadge(!!app.verify_token_vault_id)}</TableCell>
                      <TableCell>{app.subscription_id ?? "—"}</TableCell>
                      <TableCell>
                        {app.is_active ? (
                          <Badge>Active</Badge>
                        ) : (
                          <Badge variant="outline">Off</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => openEdit(app)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Strava App" : "Add Strava App"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Client ID</Label>
                <Input
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  placeholder="215250"
                />
              </div>
              <div className="space-y-1">
                <Label>Client Secret {editingId && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}</Label>
                <Input
                  type="password"
                  value={form.client_secret}
                  onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                  placeholder="From Strava → My API Application"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1">
                <Label>Webhook Verify Token {editingId && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}</Label>
                <Input
                  type="password"
                  value={form.verify_token}
                  onChange={(e) => setForm({ ...form, verify_token: e.target.value })}
                  placeholder="Random string you choose"
                  autoComplete="new-password"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Max Athletes</Label>
                  <Input
                    type="number"
                    value={form.max_athletes}
                    onChange={(e) => setForm({ ...form, max_athletes: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Priority (lower fills first)</Label>
                  <Input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Subscription ID (optional)</Label>
                <Input
                  type="number"
                  value={form.subscription_id}
                  onChange={(e) => setForm({ ...form, subscription_id: e.target.value })}
                  placeholder="Filled after registering webhook"
                />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default StravaAppsManager;

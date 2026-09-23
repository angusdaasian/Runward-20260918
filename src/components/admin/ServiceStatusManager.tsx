import { useEffect, useState } from "react";
import { Activity, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ServiceState = "operational" | "degraded" | "outage" | "maintenance";

interface ServiceStatus {
  id: string;
  service_name: string;
  status: ServiceState;
  message: string | null;
  message_zh: string | null;
  display_order: number;
  updated_at: string;
}

const statusLabels: Record<ServiceState, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  maintenance: "Maintenance",
};

const badgeVariant = (status: ServiceState) => {
  if (status === "operational") return "default" as const;
  if (status === "outage") return "destructive" as const;
  return "secondary" as const;
};

const emptyForm = {
  service_name: "",
  status: "degraded" as ServiceState,
  message: "",
  message_zh: "",
  display_order: "0",
};

const ServiceStatusManager = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchStatuses = async () => {
    const { data, error } = await supabase
      .from("service_statuses")
      .select("id, service_name, status, message, message_zh, display_order, updated_at")
      .order("display_order", { ascending: true })
      .order("service_name", { ascending: true });
    if (error) toast.error("Failed to load service statuses");
    setItems((data as ServiceStatus[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void fetchStatuses();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEditing = (item: ServiceStatus) => {
    setEditingId(item.id);
    setForm({
      service_name: item.service_name,
      status: item.status,
      message: item.message ?? "",
      message_zh: item.message_zh ?? "",
      display_order: String(item.display_order),
    });
  };

  const save = async () => {
    if (!user || !form.service_name.trim()) return;
    setSaving(true);
    const payload = {
      service_name: form.service_name.trim(),
      status: form.status,
      message: form.message.trim() || null,
      message_zh: form.message_zh.trim() || null,
      display_order: Number.parseInt(form.display_order, 10) || 0,
    };
    const result = editingId
      ? await supabase.from("service_statuses").update(payload).eq("id", editingId)
      : await supabase.from("service_statuses").insert({ ...payload, created_by: user.id });
    setSaving(false);
    if (result.error) {
      toast.error(result.error.code === "23505" ? "That service already exists" : "Failed to save service status");
      return;
    }
    toast.success(editingId ? "Service status updated" : "Service added");
    resetForm();
    void fetchStatuses();
  };

  const markOperational = async (id: string) => {
    const { error } = await supabase
      .from("service_statuses")
      .update({ status: "operational", message: null, message_zh: null })
      .eq("id", id);
    if (error) toast.error("Failed to restore service");
    else {
      toast.success("Service marked operational");
      void fetchStatuses();
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("service_statuses").delete().eq("id", id);
    if (error) toast.error("Failed to remove service");
    else {
      toast.success("Service removed");
      if (editingId === id) resetForm();
      void fetchStatuses();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Service Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 rounded-lg border border-border bg-muted/40 p-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="status-service">Service name</Label>
              <Input
                id="status-service"
                placeholder="e.g. Garmin / Terra"
                value={form.service_name}
                onChange={(event) => setForm((current) => ({ ...current, service_name: event.target.value }))}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(status) => setForm((current) => ({ ...current, status: status as ServiceState }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status-message">Message (English)</Label>
              <Textarea
                id="status-message"
                placeholder="Explain what is affected and what users should do."
                value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                maxLength={300}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status-message-zh">訊息（繁體中文）</Label>
              <Textarea
                id="status-message-zh"
                placeholder="說明受影響功能及用戶可以採取的行動。"
                value={form.message_zh}
                onChange={(event) => setForm((current) => ({ ...current, message_zh: event.target.value }))}
                maxLength={300}
                rows={3}
              />
            </div>
            <div className="space-y-1.5 md:max-w-40">
              <Label htmlFor="status-order">Display order</Label>
              <Input
                id="status-order"
                type="number"
                value={form.display_order}
                onChange={(event) => setForm((current) => ({ ...current, display_order: event.target.value }))}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={save} disabled={saving || !form.service_name.trim()}>
                {editingId ? <Check className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {saving ? "Saving..." : editingId ? "Save changes" : "Add service"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Services</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No services added yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{item.service_name}</span>
                      <Badge variant={badgeVariant(item.status)}>{statusLabels[item.status]}</Badge>
                    </div>
                    {(item.message || item.message_zh) && (
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {item.message && <p>{item.message}</p>}
                        {item.message_zh && <p>{item.message_zh}</p>}
                      </div>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">Updated {new Date(item.updated_at).toLocaleString()}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.status !== "operational" && (
                      <Button size="sm" variant="outline" onClick={() => void markOperational(item.id)}>
                        <Check className="mr-1.5 h-4 w-4" /> Operational
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" aria-label="Edit service" onClick={() => startEditing(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Delete service" onClick={() => void remove(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ServiceStatusManager;
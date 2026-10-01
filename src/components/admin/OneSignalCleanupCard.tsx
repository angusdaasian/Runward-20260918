import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

type Scan = {
  total: number; linked: number; anonymous: number; deleted_account: number;
  candidates: number; registered_users: number; linked_accounts: number;
};
type Run = {
  id: string; status: string; total_candidates: number; processed: number;
  deleted: number; skipped_linked: number; failed: number; last_error: string | null;
};

const OneSignalCleanupCard = () => {
  const [csvUrl, setCsvUrl] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [run, setRun] = useState<Run | null>(null);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("onesignal-cleanup", { body });
    if (error) throw error;
    if (data?.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data));
    return data;
  };

  const loadLatestRun = async () => {
    const { data } = await supabase.from("onesignal_cleanup_runs" as never)
      .select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setRun((data as Run) ?? null);
  };
  useEffect(() => { loadLatestRun(); }, []);
  useEffect(() => {
    if (run?.status !== "running") return;
    const t = setInterval(loadLatestRun, 4000);
    return () => clearInterval(t);
  }, [run?.status]);

  const check = async () => {
    setBusy(true); setScan(null);
    try {
      const { csv_url } = await call({ mode: "export" });
      setCsvUrl(csv_url); setWaiting(true);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 8000));
        const res = await call({ mode: "scan", csv_url });
        if (res.ready) { setScan(res); break; }
      }
    } catch (e) {
      toast({ title: "Check failed", description: String((e as Error).message), variant: "destructive" });
    } finally { setBusy(false); setWaiting(false); }
  };

  const del = async () => {
    if (!csvUrl || !scan) return;
    if (!confirm(`Permanently delete ${scan.candidates} unregistered OneSignal users? This cannot be undone.`)) return;
    setBusy(true);
    try { await call({ mode: "delete", csv_url: csvUrl }); await loadLatestRun(); }
    catch (e) { toast({ title: "Delete failed", description: String((e as Error).message), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5" />Clean up OneSignal</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">Removes OneSignal users that aren't linked to a current RunWard account (never signed up, or deleted their account). They never receive notifications anyway.</p>
        <Button onClick={check} disabled={busy}>{waiting ? "Waiting for OneSignal export…" : "Check (dry run)"}</Button>
        {scan && (
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <div>OneSignal subscriptions: <b>{scan.total}</b></div>
            <div>Linked to a current account: <b>{scan.linked}</b> ({scan.linked_accounts} accounts of {scan.registered_users})</div>
            <div>Never signed up: <b>{scan.anonymous}</b></div>
            <div>Deleted accounts: <b>{scan.deleted_account}</b></div>
            <Button variant="destructive" className="mt-2" onClick={del} disabled={busy || scan.candidates === 0 || run?.status === "running"}>
              Delete {scan.candidates} unregistered
            </Button>
          </div>
        )}
        {run && (
          <div className="rounded-lg border border-border p-3 space-y-1">
            <div>Last cleanup: <b>{run.status}</b> — {run.processed}/{run.total_candidates} checked</div>
            <div>Deleted {run.deleted} · kept (signed in since) {run.skipped_linked} · failed {run.failed}</div>
            {run.last_error && <div className="text-destructive break-all">{run.last_error}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OneSignalCleanupCard;

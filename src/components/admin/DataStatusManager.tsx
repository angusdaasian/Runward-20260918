import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw } from "lucide-react";

const SOURCES: Record<string, string> = {
  stridee: "Stridee", terra: "Terra", railway: "Railway (Garmin)", strava: "Strava",
  suunto: "Suunto", intervals: "Intervals.icu", apple: "Apple Watch", polar: "Polar (direct)",
};
const MULTI = ["stridee", "terra"];
const WATCHES = ["GARMIN", "COROS", "POLAR", "FITBIT", "ZEPP", "SUUNTO"];

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const ago = (s: string | null) => {
  if (!s) return "never";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 2880) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

const DataStatusManager = () => {
  const [source, setSource] = useState("all");
  const [watch, setWatch] = useState("all");
  const [kind, setKind] = useState("all");
  const [limit, setLimit] = useState("100");
  const [summary, setSummary] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.functions.invoke("admin-data-status", {
      body: { source, watch, kind, limit: Number(limit) },
    });
    if (error || data?.error) setError(error?.message ?? data.error);
    else { setSummary(data.summary ?? []); setRows(data.rows ?? []); }
    setLoading(false);
  }, [source, watch, kind, limit]);

  useEffect(() => { load(); }, [load]);

  const watchEnabled = source === "all" || MULTI.includes(source);
  const shownSummary = summary.filter((s) => source === "all" || s.source === source);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Filter label="Provider" value={source} onChange={(v) => { setSource(v); if (!MULTI.includes(v) && v !== "all") setWatch("all"); }}
          options={[["all", "All providers"], ...Object.entries(SOURCES)]} />
        <Filter label="Watch" value={watch} onChange={setWatch} disabled={!watchEnabled}
          options={[["all", "All watches"], ...WATCHES.map((w) => [w, w.charAt(0) + w.slice(1).toLowerCase()] as [string, string])]} />
        <Filter label="Data type" value={kind} onChange={setKind}
          options={[["all", "All data"], ["activity", "Activities"], ["daily", "Daily data (steps, HRV…)"]]} />
        <Filter label="Rows" value={limit} onChange={setLimit} options={[["50", "50"], ["100", "100"], ["300", "300"]]} />
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shownSummary.map((s) => (
          <Card key={s.source}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                {SOURCES[s.source] ?? s.source}
                <Badge variant={s.last_activity || s.last_daily ? "secondary" : "outline"}>
                  {ago([s.last_activity, s.last_daily].filter(Boolean).sort().pop() ?? null)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {kind !== "daily" && <p>Activities: <b>{s.activities}</b> <span className="text-muted-foreground">· last {ago(s.last_activity)}</span></p>}
              {kind !== "activity" && <p>Daily data: <b>{s.daily}</b> <span className="text-muted-foreground">· last {ago(s.last_daily)}</span></p>}
              {s.watches?.length > 0 && (
                <div className="space-y-1 border-t border-border pt-2">
                  {s.watches.filter((w: any) => watch === "all" || w.watch === watch).map((w: any) => (
                    <div key={w.watch} className="flex justify-between text-xs">
                      <span className="font-medium">{w.watch}</span>
                      <span className="text-muted-foreground">
                        {kind !== "daily" && `${w.activities} act`}{kind === "all" && " · "}{kind !== "activity" && `${w.daily} daily`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Latest data received</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead><TableHead>Provider</TableHead><TableHead>Watch</TableHead>
                <TableHead>Type</TableHead><TableHead>User</TableHead><TableHead>Date</TableHead><TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No data</TableCell></TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-xs">{fmt(r.received_at)}</TableCell>
                  <TableCell>{SOURCES[r.source] ?? r.source}</TableCell>
                  <TableCell>{r.watch ?? "—"}</TableCell>
                  <TableCell><Badge variant={r.kind === "daily" ? "outline" : "secondary"}>{r.kind === "daily" ? "Daily" : "Activity"}</Badge></TableCell>
                  <TableCell className="text-xs">{r.user_name || r.user_id.slice(0, 8)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{r.date ? new Date(r.date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-xs"><span className="font-medium">{r.title}</span>{r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const Filter = ({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]; disabled?: boolean;
}) => (
  <div className="space-y-1">
    <p className="text-xs text-muted-foreground">{label}</p>
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  </div>
);

export default DataStatusManager;

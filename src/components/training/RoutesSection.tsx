import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decodePolyline } from "@/lib/territory";
import { toast } from "sonner";
import { Download, Watch, MapPin, Loader2 } from "lucide-react";

type Route = {
  source: string; source_id: string; user_id: string; display_name: string | null; started_at: string;
  activity_name: string | null; distance_km: number; elevation_m: number | null; summary_polyline: string;
};

const BUCKETS = [
  { id: "all", en: "All", zh: "全部", min: 0, max: 1e9 },
  { id: "s", en: "< 5 km", zh: "< 5 公里", min: 0, max: 5 },
  { id: "m", en: "5–10 km", zh: "5–10 公里", min: 5, max: 10 },
  { id: "l", en: "10–21 km", zh: "10–21 公里", min: 10, max: 21.1 },
  { id: "xl", en: "21+ km", zh: "21+ 公里", min: 21.1, max: 1e9 },
];

// Trim ~200 m from both ends so start/finish (often home) isn't exposed.
function trimmedPoints(poly: string): [number, number][] {
  const pts = decodePolyline(poly);
  if (pts.length < 10) return pts;
  const hav = (a: [number, number], b: [number, number]) => {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  let s = 0, d = 0;
  while (s < pts.length - 2 && d < 200) { d += hav(pts[s], pts[s + 1]); s++; }
  let e = pts.length - 1; d = 0;
  while (e > s + 2 && d < 200) { d += hav(pts[e], pts[e - 1]); e--; }
  return pts.slice(s, e + 1);
}

function toGpx(name: string, pts: [number, number][]) {
  const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
  const seg = pts.map(([la, lo]) => `<trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="RunWard" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(name)}</name></metadata><trk><name>${esc(name)}</name><type>running</type><trkseg>${seg}</trkseg></trk></gpx>`;
}

function Thumb({ pts }: { pts: [number, number][] }) {
  const path = useMemo(() => {
    if (pts.length < 2) return "";
    const lats = pts.map((p) => p[0]), lons = pts.map((p) => p[1]);
    const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
    const span = Math.max(b - a, (d - c) * Math.cos((a * Math.PI) / 180), 1e-6);
    return pts.map(([la, lo], i) => {
      const x = 8 + (((lo - c) * Math.cos((a * Math.PI) / 180)) / span) * 84;
      const y = 92 - ((la - a) / span) * 84;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join("");
  }, [pts]);
  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0 rounded-xl bg-muted">
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function RoutesSection({ lang }: { lang: "en" | "zh" | string }) {
  const zh = lang === "zh";
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (supabase.rpc as any)("get_public_routes", { p_limit: 200 }).then(({ data, error }: any) => {
      if (error) console.error(error);
      setRoutes((data as Route[]) ?? []);
    });
  }, []);

  const list = useMemo(() => {
    const b = BUCKETS.find((x) => x.id === bucket)!;
    const s = q.trim().toLowerCase();
    return (routes ?? []).filter((r) => r.distance_km >= b.min && r.distance_km < b.max &&
      (!s || (r.activity_name ?? "").toLowerCase().includes(s) || (r.display_name ?? "").toLowerCase().includes(s)));
  }, [routes, q, bucket]);

  const nameOf = (r: Route) => `${r.activity_name || (zh ? "路線" : "Route")} · ${Number(r.distance_km).toFixed(1)} km`;

  const download = (r: Route) => {
    const blob = new Blob([toGpx(nameOf(r), trimmedPoints(r.summary_polyline))], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(r.activity_name || "route").replace(/[^\w\u4e00-\u9fff-]+/g, "_")}.gpx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const send = async (r: Route) => {
    const key = r.source + r.source_id;
    setBusy(key);
    const { data, error } = await supabase.functions.invoke("route-push", {
      body: { name: nameOf(r).slice(0, 80), gpx: toGpx(nameOf(r), trimmedPoints(r.summary_polyline)) },
    });
    setBusy(null);
    const code = (data as any)?.error ?? (error as any)?.context?.status;
    if (code === "no_garmin" || code === 409) { toast.error(zh ? "請先連結 Garmin 手錶，或下載 GPX" : "Connect a Garmin watch first, or download the GPX"); return; }
    if (error || !data?.ok) { toast.error(zh ? "傳送失敗" : "Couldn't send route"); return; }
    if (data.status === "failed" && data.reason === "not_permitted") {
      toast.error(zh ? "請在 Garmin 授權「課程匯入」後重新連結" : "Allow “Course Import” for Garmin, then reconnect your watch");
      return;
    }
    toast.success(zh ? "已傳送到手錶 ✓ 同步 Garmin Connect 後即可使用" : "Sent to your watch ✓ Sync Garmin Connect to see it");
  };

  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{zh ? "路線" : "Routes"}</h2>
        <p className="text-sm text-muted-foreground">
          {zh ? "其他跑者公開分享的路線，可傳送到手錶或下載 GPX。" : "Routes shared publicly by other runners. Send one to your watch or download the GPX."}
        </p>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? "搜尋路線或跑者" : "Search routes or runners"} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {BUCKETS.map((b) => (
          <button key={b.id} onClick={() => setBucket(b.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${bucket === b.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
            {zh ? b.zh : b.en}
          </button>
        ))}
      </div>
      {routes === null ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{zh ? "暫時沒有路線" : "No routes yet"}</p>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const key = r.source + r.source_id;
            const pts = trimmedPoints(r.summary_polyline);
            return (
              <div key={key} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex gap-3">
                  <Thumb pts={pts} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{r.activity_name || (zh ? "路線" : "Route")}</p>
                    <p className="text-sm text-muted-foreground">
                      {Number(r.distance_km).toFixed(1)} km{r.elevation_m ? ` · ↑${Math.round(Number(r.elevation_m))} m` : ""}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin size={12} /> {r.display_name || (zh ? "跑者" : "Runner")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={() => send(r)} disabled={busy === key}>
                    {busy === key ? <Loader2 size={14} className="animate-spin" /> : <Watch size={14} />}
                    {zh ? "傳送到手錶" : "Send to watch"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => download(r)}>
                    <Download size={14} /> GPX
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

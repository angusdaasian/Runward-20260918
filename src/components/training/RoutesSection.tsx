import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decodePolyline } from "@/lib/territory";
import { toast } from "sonner";
import { Download, Watch, Loader2, Globe2 } from "lucide-react";

type Route = {
  source: string; source_id: string; user_id: string; display_name: string | null; started_at: string;
  activity_name: string | null; distance_km: number; elevation_m: number | null; summary_polyline: string;
};

type TerritoryCity = {
  country: string | null;
  bbox: [number, number, number, number] | number[];
};

type LocatedRoute = Route & { country: string };

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

const MAP_WIDTH = 600;
const MAP_HEIGHT = 260;
const TILE_SIZE = 256;

function worldPoint([lat, lng]: [number, number], zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function RouteMap({ pts }: { pts: [number, number][] }) {
  const scene = useMemo(() => {
    if (pts.length < 2) return null;
    let zoom = 15;
    let projected = pts.map((point) => worldPoint(point, zoom));
    while (zoom > 2) {
      const xs = projected.map((p) => p.x), ys = projected.map((p) => p.y);
      if (Math.max(...xs) - Math.min(...xs) <= MAP_WIDTH - 80 && Math.max(...ys) - Math.min(...ys) <= MAP_HEIGHT - 60) break;
      zoom -= 1;
      projected = pts.map((point) => worldPoint(point, zoom));
    }
    const xs = projected.map((p) => p.x), ys = projected.map((p) => p.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const left = centerX - MAP_WIDTH / 2;
    const top = centerY - MAP_HEIGHT / 2;
    const path = projected.map((p, index) => `${index ? "L" : "M"}${(p.x - left).toFixed(1)},${(p.y - top).toFixed(1)}`).join("");
    const tiles = [];
    for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + MAP_WIDTH) / TILE_SIZE); x += 1) {
      for (let y = Math.floor(top / TILE_SIZE); y <= Math.floor((top + MAP_HEIGHT) / TILE_SIZE); y += 1) {
        tiles.push({ x, y, left: x * TILE_SIZE - left, top: y * TILE_SIZE - top });
      }
    }
    return { zoom, path, tiles };
  }, [pts]);

  if (!scene) return <div className="h-32 w-full bg-muted" />;
  return (
    <div className="relative h-32 w-full overflow-hidden bg-muted">
      {scene.tiles.map((tile) => (
        <img
          key={`${tile.x}-${tile.y}`}
          src={`https://tile.openstreetmap.org/${scene.zoom}/${tile.x}/${tile.y}.png`}
          alt=""
          loading="lazy"
          className="pointer-events-none absolute max-w-none"
          style={{ width: TILE_SIZE / 2, height: TILE_SIZE / 2, left: tile.left / 2, top: tile.top / 2 }}
        />
      ))}
      <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d={scene.path} fill="none" stroke="hsl(var(--background))" strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" />
        <path d={scene.path} fill="none" stroke="hsl(var(--primary))" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="absolute bottom-0.5 right-1 bg-background/80 px-1 text-[9px] text-muted-foreground">
        © OpenStreetMap
      </a>
    </div>
  );
}

export default function RoutesSection({ lang }: { lang: "en" | "zh" | string }) {
  const zh = lang === "zh";
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [cities, setCities] = useState<TerritoryCity[]>([]);
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState("all");
  const [country, setCountry] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0): Promise<void> => {
      // Wait for the signed-in session; calling before it restores runs as a guest and returns nothing.
      const { data: s } = await supabase.auth.getSession();
      if (!s.session && attempt < 5) { await new Promise((r) => setTimeout(r, 800)); return load(attempt + 1); }
      const [{ data, error }, { data: cityRows }] = await Promise.all([
        (supabase.rpc as any)("get_public_routes", { p_limit: 300 }),
        supabase.from("territory_cities").select("country,bbox"),
      ]);
      if (cancelled) return;
      if (error) {
        console.error("[routes]", error);
        if (attempt < 5) { await new Promise((r) => setTimeout(r, 1200)); return load(attempt + 1); }
      }
      const rows = ((data as Route[]) ?? []).sort((a, b) => (b.started_at > a.started_at ? 1 : -1));
      setCities(((cityRows as TerritoryCity[] | null) ?? []).filter((city) => city.country && Array.isArray(city.bbox)));
      setRoutes(rows);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const locatedRoutes = useMemo<LocatedRoute[]>(() => (routes ?? []).map((route) => {
    const first = decodePolyline(route.summary_polyline)[0];
    const match = first && cities.find((city) => {
      const [minLat, minLng, maxLat, maxLng] = city.bbox;
      return first[0] >= minLat && first[0] <= maxLat && first[1] >= minLng && first[1] <= maxLng;
    });
    return { ...route, country: match?.country ?? "" };
  }), [routes, cities]);

  const countries = useMemo(() => [...new Set(locatedRoutes.map((route) => route.country).filter(Boolean))].sort(), [locatedRoutes]);

  const list = useMemo(() => {
    const b = BUCKETS.find((x) => x.id === bucket)!;
    const s = q.trim().toLowerCase();
    return locatedRoutes.filter((r) => r.distance_km >= b.min && r.distance_km < b.max &&
      (country === "all" || r.country === country) &&
      (!s || (r.activity_name ?? "").toLowerCase().includes(s) || r.country.toLowerCase().includes(s)));
  }, [locatedRoutes, q, bucket, country]);

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
       <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? "搜尋路線" : "Search routes"} />
       <label className="flex items-center gap-2 text-sm text-muted-foreground">
         <Globe2 size={16} />
         <select value={country} onChange={(event) => setCountry(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground">
           <option value="all">{zh ? "所有國家或地區" : "All countries and regions"}</option>
           {countries.map((value) => <option key={value} value={value}>{value}</option>)}
         </select>
       </label>
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
              <div key={key} className="overflow-hidden rounded-lg border border-border bg-card">
                <RouteMap pts={pts} />
                <div className="p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{r.activity_name || (zh ? "路線" : "Route")}</p>
                    <p className="text-sm text-muted-foreground">
                      {Number(r.distance_km).toFixed(1)} km{r.elevation_m ? ` · ↑${Math.round(Number(r.elevation_m))} m` : ""}
                    </p>
                    {r.country && <p className="text-xs text-muted-foreground">{r.country}</p>}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

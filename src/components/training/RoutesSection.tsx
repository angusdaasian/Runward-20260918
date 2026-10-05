import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { decodePolyline } from "@/lib/territory";
import { toast } from "sonner";
import { Download, Watch, Loader2, Globe2, ZoomIn, ZoomOut, Expand, Mountain } from "lucide-react";

type Route = {
  source: string; source_id: string; user_id: string; display_name: string | null; started_at: string;
  activity_name: string | null; distance_km: number; elevation_m: number | null; summary_polyline: string;
};

type TerritoryCity = {
  slug: string;
  display_name: string;
  display_name_zh: string | null;
  country: string | null;
  admin1: string | null;
  bbox: [number, number, number, number] | number[];
};

type LocatedRoute = Route & { country: string; area: string; areaZh: string };

type GeoPoint = [number, number];

const HK_AREAS = [
  {
    id: "hong-kong-island",
    en: "Hong Kong Island",
    zh: "香港島",
    polygon: [[22.194, 114.115], [22.208, 114.09], [22.284, 114.11], [22.303, 114.178], [22.291, 114.263], [22.218, 114.253]] as GeoPoint[],
  },
  {
    id: "kowloon",
    en: "Kowloon",
    zh: "九龍",
    polygon: [[22.278, 114.126], [22.287, 114.11], [22.354, 114.126], [22.361, 114.235], [22.329, 114.257], [22.281, 114.224]] as GeoPoint[],
  },
];

const TAIWAN_AREA_ZH: Record<string, string> = {
  "Baisha Township": "白沙鄉", "Changhua City": "彰化市", Hsinchu: "新竹", "Hualien City": "花蓮市",
  "Huxi Township": "湖西鄉", "Ji'an": "吉安鄉", Jiuru: "九如鄉", Kaohsiung: "高雄市",
  "Magong City": "馬公市", Neipu: "內埔鄉", "New Taipei": "新北市", "Su'ao Township": "蘇澳鎮",
  Taichung: "台中市", Tainan: "台南市", Taipei: "台北市", "Taitung City": "台東市",
  "Taoyuan City": "桃園市", Tongluo: "銅鑼鄉", Xiulin: "秀林鄉", "Zhubei City": "竹北市", Zhudong: "竹東鎮",
};

function pointInPolygon([lat, lng]: GeoPoint, polygon: GeoPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    if ((latI > lat) !== (latJ > lat) && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
  }
  return inside;
}

function representativePoints(poly: string): GeoPoint[] {
  const points = decodePolyline(poly);
  if (points.length <= 3) return points;
  return [points[0], points[Math.floor(points.length / 4)], points[Math.floor(points.length / 2)], points[Math.floor(points.length * 0.75)], points[points.length - 1]];
}

function hongKongArea(points: GeoPoint[]) {
  const votes = new Map<string, number>();
  points.forEach((point) => {
    const match = HK_AREAS.find((area) => pointInPolygon(point, area.polygon));
    const id = match?.id ?? "new-territories";
    votes.set(id, (votes.get(id) ?? 0) + 1);
  });
  const id = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "new-territories";
  const match = HK_AREAS.find((area) => area.id === id);
  return match ?? { id: "new-territories", en: "New Territories", zh: "新界" };
}

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
  const seg = pts.map(([la, lo]) => `      <trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"></trkpt>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd" version="1.1" creator="RunWard">
  <metadata><name>${esc(name)}</name></metadata>
  <trk>
    <name>${esc(name)}</name>
    <type>running</type>
    <trkseg>
${seg}
    </trkseg>
  </trk>
</gpx>`;
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

function fitView(pts: [number, number][], width: number, height: number) {
  let zoom = 15;
  let projected = pts.map((point) => worldPoint(point, zoom));
  while (zoom > 2) {
    const xs = projected.map((p) => p.x), ys = projected.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= width - 80 && Math.max(...ys) - Math.min(...ys) <= height - 60) break;
    zoom -= 1;
    projected = pts.map((point) => worldPoint(point, zoom));
  }
  const xs = projected.map((p) => p.x), ys = projected.map((p) => p.y);
  return { zoom, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function buildScene(pts: [number, number][], zoom: number, cx: number, cy: number, width: number, height: number) {
  const left = cx - width / 2;
  const top = cy - height / 2;
  const projected = pts.map((point) => worldPoint(point, zoom));
  const path = projected.map((p, index) => `${index ? "L" : "M"}${(p.x - left).toFixed(1)},${(p.y - top).toFixed(1)}`).join("");
  const tiles = [];
  for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + width) / TILE_SIZE); x += 1) {
    for (let y = Math.floor(top / TILE_SIZE); y <= Math.floor((top + height) / TILE_SIZE); y += 1) {
      tiles.push({ x, y, left: x * TILE_SIZE - left, top: y * TILE_SIZE - top });
    }
  }
  return { path, tiles };
}

function MapSvg({ pts, zoom, cx, cy, width, height }: { pts: [number, number][]; zoom: number; cx: number; cy: number; width: number; height: number }) {
  const scene = useMemo(() => buildScene(pts, zoom, cx, cy, width, height), [pts, zoom, cx, cy, width, height]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {scene.tiles.map((tile) => (
        <image
          key={`${zoom}-${tile.x}-${tile.y}`}
          href={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
          x={tile.left}
          y={tile.top}
          width={TILE_SIZE}
          height={TILE_SIZE}
        />
      ))}
      <path d={scene.path} fill="none" stroke="hsl(var(--background))" strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" />
      <path d={scene.path} fill="none" stroke="hsl(var(--primary))" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const BIG_W = 800;
const BIG_H = 520;

function InteractiveRouteMap({ pts }: { pts: [number, number][] }) {
  const fit = useMemo(() => fitView(pts, BIG_W, BIG_H), [pts]);
  const [view, setView] = useState<{ zoom: number; cx: number; cy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const v = view ?? fit;

  const zoomBy = (delta: number) => {
    const next = Math.max(2, Math.min(18, v.zoom + delta));
    if (next === v.zoom) return;
    const factor = 2 ** (next - v.zoom);
    setView({ zoom: next, cx: v.cx * factor, cy: v.cy * factor });
  };

  return (
    <div
      ref={wrap}
      className="relative aspect-[20/13] w-full touch-none overflow-hidden bg-muted"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current || !wrap.current) return;
        const scale = BIG_W / wrap.current.getBoundingClientRect().width;
        setView({
          zoom: v.zoom,
          cx: drag.current.cx - (e.clientX - drag.current.x) * scale,
          cy: drag.current.cy - (e.clientY - drag.current.y) * scale,
        });
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    >
      <MapSvg pts={pts} zoom={v.zoom} cx={v.cx} cy={v.cy} width={BIG_W} height={BIG_H} />
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => zoomBy(1)} aria-label="Zoom in"><ZoomIn size={16} /></Button>
        <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => zoomBy(-1)} aria-label="Zoom out"><ZoomOut size={16} /></Button>
      </div>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="absolute bottom-0.5 right-1 bg-background/80 px-1 text-[9px] text-muted-foreground">
        © OpenStreetMap
      </a>
    </div>
  );
}

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const elevCache = new Map<string, { d: number; e: number }[]>();

function ElevationProfile({ pts, zh }: { pts: [number, number][]; zh: boolean }) {
  const [data, setData] = useState<{ d: number; e: number }[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (pts.length < 2) { setFailed(true); return; }
    const n = Math.min(100, pts.length);
    const sample = Array.from({ length: n }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
    const key = sample.map((p) => p.join(",")).join("|");
    if (elevCache.has(key)) { setData(elevCache.get(key)!); return; }
    let cancelled = false;
    setData(null); setFailed(false);
    const lat = sample.map((p) => p[0].toFixed(5)).join(",");
    const lng = sample.map((p) => p[1].toFixed(5)).join(",");
    fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`)
      .then((r) => r.json())
      .then((j) => {
        const elev: number[] = j?.elevation;
        if (!Array.isArray(elev) || elev.length !== sample.length) throw new Error("bad");
        let d = 0;
        const out = sample.map((p, i) => { if (i > 0) d += haversineKm(sample[i - 1], p); return { d, e: elev[i] }; });
        elevCache.set(key, out);
        if (!cancelled) setData(out);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [pts]);

  const title = zh ? "高度圖" : "Elevation profile";
  if (failed) return <p className="px-2 py-3 text-sm text-muted-foreground">{zh ? "暫時未能載入高度資料" : "Elevation data isn't available right now"}</p>;
  if (!data) return <div className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />{title}</div>;

  let up = 0, down = 0;
  for (let i = 1; i < data.length; i++) { const diff = data[i].e - data[i - 1].e; if (diff > 0) up += diff; else down -= diff; }
  const W = 600, H = 160, P = 4;
  const maxD = data[data.length - 1].d || 1;
  const es = data.map((p) => p.e);
  const minE = Math.min(...es), maxE = Math.max(...es);
  const span = Math.max(10, maxE - minE);
  const x = (d: number) => P + (d / maxD) * (W - 2 * P);
  const y = (e: number) => H - P - ((e - minE) / span) * (H - 2 * P);
  const line = data.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.e).toFixed(1)}`).join(" ");
  const area = `${line} L${x(maxD)},${H - P} L${x(0)},${H - P} Z`;

  return (
    <div className="space-y-2 px-2 pb-2 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">↑{Math.round(up)} m · ↓{Math.round(down)} m</p>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="none">
          <path d={area} className="fill-primary/20" />
          <path d={line} className="fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="absolute left-1 top-0 text-xs text-muted-foreground">{Math.round(maxE)} m</span>
        <span className="absolute bottom-0 left-1 text-xs text-muted-foreground">{Math.round(minE)} m</span>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0 km</span><span>{maxD.toFixed(1)} km</span>
      </div>
    </div>
  );
}

function RouteMap({ pts, onExpand }: { pts: [number, number][]; onExpand: () => void }) {
  const view = useMemo(() => (pts.length < 2 ? null : fitView(pts, MAP_WIDTH, MAP_HEIGHT)), [pts]);

  if (!view) return <div className="h-32 w-full bg-muted" />;
  return (
    <button type="button" onClick={onExpand} className="relative block aspect-[30/13] w-full overflow-hidden bg-muted" aria-label="View route map">
      <MapSvg pts={pts} zoom={view.zoom} cx={view.cx} cy={view.cy} width={MAP_WIDTH} height={MAP_HEIGHT} />
      <span className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-muted-foreground">
        <Expand size={14} />
      </span>
      <span className="absolute bottom-0.5 right-1 bg-background/80 px-1 text-[9px] text-muted-foreground">© OpenStreetMap</span>
    </button>
  );
}

export default function RoutesSection({ lang }: { lang: "en" | "zh" | string }) {
  const zh = lang === "zh";
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [zoomPts, setZoomPts] = useState<[number, number][] | null>(null);
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
        supabase.from("territory_cities").select("slug,display_name,display_name_zh,country,admin1,bbox"),
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
    const points = representativePoints(route.summary_polyline);
    const first = points[0];
    if (!first) return { ...route, country: "", area: "", areaZh: "" };
    const [lat, lng] = first;
    // Special regions: never fold HK / Macau into CN
    if (points.some(([pointLat, pointLng]) => pointLat >= 22.13 && pointLat <= 22.58 && pointLng >= 113.82 && pointLng <= 114.45)) {
      const area = hongKongArea(points);
      return { ...route, country: "HK", area: area.en, areaZh: area.zh };
    }
    if (lat >= 22.10 && lat <= 22.22 && lng >= 113.52 && lng <= 113.61) return { ...route, country: "MO", area: "", areaZh: "" };
    const matches = cities.filter((city) => {
      const [minLat, minLng, maxLat, maxLng] = city.bbox;
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    });
    const bboxArea = (city: TerritoryCity) => (city.bbox[2] - city.bbox[0]) * (city.bbox[3] - city.bbox[1]);
    const match = matches.sort((a, b) => bboxArea(a) - bboxArea(b))[0];
    const countryCode = match?.country ?? "";
    const area = countryCode === "TW" ? (match?.admin1 || match?.display_name || "") : "";
    return { ...route, country: countryCode, area, areaZh: match?.display_name_zh || TAIWAN_AREA_ZH[area] || area };
  }), [routes, cities]);

  const regionName = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([zh ? "zh-Hant-TW" : "en"], { type: "region" }); } catch { /* ignore */ }
    const overrides: Record<string, string> = zh ? { HK: "香港", MO: "澳門", TW: "台灣", CN: "中國" } : { HK: "Hong Kong", MO: "Macau", TW: "Taiwan" };
    return (code: string) => overrides[code] ?? (/^[A-Z]{2}$/.test(code) ? dn?.of(code) ?? code : code);
  }, [zh]);

  const countries = useMemo(() => [...new Set(locatedRoutes.map((route) => route.country).filter(Boolean))].sort(), [locatedRoutes]);
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || countries.length === 0) return;
    autoPicked.current = true;
    if (countries.includes("HK")) setCountry("HK");
  }, [countries]);

  const [area, setArea] = useState("all");

  const filteredBeforeArea = useMemo(() => {
    const b = BUCKETS.find((x) => x.id === bucket) ?? BUCKETS[0];
    const s = q.trim().toLowerCase();
    return locatedRoutes.filter((r) => r.distance_km >= b.min && r.distance_km < b.max &&
      (country === "all" || r.country === country) &&
      (!s || (r.activity_name ?? "").toLowerCase().includes(s) || regionName(r.country).toLowerCase().includes(s) ||
        r.area.toLowerCase().includes(s) || r.areaZh.includes(s)));
  }, [locatedRoutes, q, bucket, country, regionName]);

  const areas = useMemo(() => {
    if (country === "all") return [];
    const counts = new Map<string, { en: string; zh: string; count: number }>();
    filteredBeforeArea.forEach((route) => {
      if (!route.area) return;
      const current = counts.get(route.area);
      counts.set(route.area, { en: route.area, zh: route.areaZh || route.area, count: (current?.count ?? 0) + 1 });
    });
    return [...counts.values()].sort((a, b) => (zh ? a.zh : a.en).localeCompare(zh ? b.zh : b.en, zh ? "zh-Hant" : "en"));
  }, [country, filteredBeforeArea, zh]);

  useEffect(() => {
    if (area !== "all" && !areas.some((item) => item.en === area)) setArea("all");
  }, [area, areas]);

  const list = useMemo(() => filteredBeforeArea.filter((route) => area === "all" || route.area === area), [filteredBeforeArea, area]);
  const selectedArea = areas.find((item) => item.en === area);

  const nameOf = (r: Route) => `${r.activity_name || (zh ? "路線" : "Route")} · ${Number(r.distance_km).toFixed(1)} km`;

  const download = async (r: Route) => {
    const points = trimmedPoints(r.summary_polyline);
    if (points.length < 2) { toast.error(zh ? "此路線沒有足夠的地圖資料" : "This route doesn't have enough map data"); return; }
    const gpx = toGpx(nameOf(r), points);
    const filename = `${(r.activity_name || "route").replace(/[^\w\u4e00-\u9fff-]+/g, "_")}.gpx`;
    // In-app (iOS webview) blob downloads are blocked — use the share sheet ("Save to Files") when available
    try {
      const file = new File([gpx], filename, { type: "application/gpx+xml" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = `data:application/gpx+xml;charset=utf-8,${encodeURIComponent(gpx)}`;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const send = async (r: Route) => {
    const key = r.source + r.source_id;
    const points = trimmedPoints(r.summary_polyline);
    if (points.length < 2) {
      toast.error(zh ? "此路線沒有足夠的地圖資料" : "This route doesn't have enough map data");
      return;
    }
    setBusy(key);
    const { data, error } = await supabase.functions.invoke("route-push", {
      body: { name: nameOf(r).slice(0, 80), gpx: toGpx(nameOf(r), points) },
    });
    setBusy(null);
    const code = (data as any)?.error ?? (error as any)?.context?.status;
    if (code === "no_garmin" || code === 409) { toast.error(zh ? "請先連結 Garmin 手錶，或下載 GPX" : "Connect a Garmin watch first, or download the GPX"); return; }
    if (code === "invalid_points") { toast.error(zh ? "此路線沒有足夠的地圖資料" : "This route doesn't have enough map data"); return; }
    if (error || !data?.ok) { toast.error(zh ? "Garmin 未能接收此路線，請稍後再試" : "Garmin couldn't receive this route. Please try again later"); return; }
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
          <select value={country} onChange={(event) => { setCountry(event.target.value); setArea("all"); }} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground">
           <option value="all">{zh ? "所有國家或地區" : "All countries and regions"}</option>
            {countries.map((value) => <option key={value} value={value}>{regionName(value)}</option>)}
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
      {areas.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label={zh ? "地區" : "Areas"}>
          <Button size="sm" variant={area === "all" ? "default" : "outline"} className="shrink-0" onClick={() => setArea("all")}>
            {zh ? "全部地區" : "All areas"} · {filteredBeforeArea.length}
          </Button>
          {areas.map((item) => (
            <Button key={item.en} size="sm" variant={area === item.en ? "default" : "outline"} className="shrink-0" onClick={() => setArea(item.en)}>
              {zh ? item.zh : item.en} · {item.count}
            </Button>
          ))}
        </div>
      )}
      {routes === null ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{zh ? "暫時沒有路線" : "No routes yet"}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold text-foreground">
              {selectedArea ? (zh ? selectedArea.zh : selectedArea.en) : country === "all" ? (zh ? "所有路線" : "All routes") : regionName(country)}
            </h3>
            <span className="text-sm text-muted-foreground">{zh ? `${list.length} 條` : `${list.length} routes`}</span>
          </div>
          {list.map((r) => {
            const key = r.source + r.source_id;
            const pts = trimmedPoints(r.summary_polyline);
            return (
              <div key={key} className="overflow-hidden rounded-lg border border-border bg-card">
                <RouteMap pts={pts} onExpand={() => setZoomPts(pts)} />
                <div className="p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{r.activity_name || (zh ? "路線" : "Route")}</p>
                    <p className="text-sm text-muted-foreground">
                      {Number(r.distance_km).toFixed(1)} km{r.elevation_m ? ` · ↑${Math.round(Number(r.elevation_m))} m` : ""}
                    </p>
                    {r.country && <p className="text-xs text-muted-foreground">{[regionName(r.country), zh ? r.areaZh : r.area].filter(Boolean).join(" · ")}</p>}
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
      <Dialog open={zoomPts !== null} onOpenChange={(open) => { if (!open) setZoomPts(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-2">
          {zoomPts && <InteractiveRouteMap pts={zoomPts} />}
          {zoomPts && <ElevationProfile pts={zoomPts} zh={zh} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lang } from "@/lib/i18n";
import { Loader2, Download, Share2, Film } from "lucide-react";
import { toast } from "sonner";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "@/integrations/supabase/client";

// ---------- Polyline decoder ----------
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  polyline: string | null;
  name: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  averageSpeed: number;
  elevationGainMeters: number | null;
  streams?: any[];
}

// Keep the offscreen WebGL canvas modest — 1080x1920 OOMs Mapbox GL on most
// mobile devices (page goes blank/green and the PWA reloads to the home route).
const CANVAS_W = 720;
const CANVAS_H = 1280;
const MAP_H_FRAC = 0.78;
// Dynamic flyover duration: scales with route length, clamped to a sane range.
function computeDurationMs(distanceMeters: number): number {
  const km = Math.max(0, distanceMeters / 1000);
  // ~1.2s per km, +6s base, clamp 8s..30s
  const ms = (6 + km * 1.2) * 1000;
  return Math.max(8000, Math.min(30000, ms));
}

let cachedToken: string | null = null;
async function getMapboxToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const { data, error } = await supabase.functions.invoke("get-mapbox-token");
  if (error || !data?.token) throw new Error("Mapbox token unavailable");
  cachedToken = data.token as string;
  return cachedToken;
}

function bearing([lon1, lat1]: number[], [lon2, lat2]: number[]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const RouteVideoDialog = ({
  open, onOpenChange, lang, polyline, name,
  distanceMeters, movingTimeSeconds, averageSpeed, elevationGainMeters, streams,
}: Props) => {
  const isZh = lang === "zh";
  const t = (en: string, zh: string) => (isZh ? zh : en);

  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [phase, setPhase] = useState<"idle" | "loading" | "rendering" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (!open) {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      setPhase("idle");
      setProgress(0);
      videoBlobRef.current = null;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    }
  }, [open]); // eslint-disable-line

  const distKm = distanceMeters / 1000;
  const totalSec = movingTimeSeconds;

  const handleGenerate = async () => {
    if (!polyline) { toast.error(t("No route data available", "沒有路線資料")); return; }
    const composite = compositeCanvasRef.current;
    const container = mapContainerRef.current;
    if (!composite || !container) return;

    setPhase("loading");
    setProgress(0);

    try {
      const token = await getMapboxToken();
      mapboxgl.accessToken = token;

      const coordsLatLng = decodePolyline(polyline);
      if (coordsLatLng.length < 2) throw new Error("Empty route");
      // Mapbox expects [lon, lat]
      const coords: [number, number][] = coordsLatLng.map(([la, lo]) => [lo, la]);

      // Compute bbox + center
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const [lo, la] of coords) {
        if (la < minLat) minLat = la; if (la > maxLat) maxLat = la;
        if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo;
      }

      // Build pace samples (sec/km)
      const paceSamples: { frac: number; paceSec: number }[] = [];
      if (streams && streams.length) {
        const distStream = streams.find((s: any) => s.type === "distance");
        const velStream = streams.find((s: any) => s.type === "velocity_smooth");
        const timeStream = streams.find((s: any) => s.type === "time");
        const distData: number[] | undefined = distStream?.data;
        const velData: number[] | undefined = velStream?.data;
        const timeData: number[] | undefined = timeStream?.data;
        if (distData && distData.length > 1) {
          const totalDist = distData[distData.length - 1] || 1;
          const windowSec = 20;
          for (let i = 0; i < distData.length; i++) {
            let paceSec = 0;
            if (velData && velData[i] != null && velData[i] > 0.3) {
              paceSec = 1000 / velData[i];
            } else if (timeData) {
              let j = i;
              while (j > 0 && (timeData[i] - timeData[j]) < windowSec) j--;
              const dt = timeData[i] - timeData[j];
              const dd = distData[i] - distData[j];
              if (dd > 0 && dt > 0) paceSec = (dt / dd) * 1000;
            }
            if (paceSec > 0 && paceSec < 1800) {
              paceSamples.push({ frac: distData[i] / totalDist, paceSec });
            }
          }
        }
      }
      const avgPaceSec = averageSpeed > 0 ? 1000 / averageSpeed : 0;
      const paceAt = (frac: number): number => {
        if (paceSamples.length === 0) return avgPaceSec;
        let lo = 0, hi = paceSamples.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (paceSamples[mid].frac < frac) lo = mid + 1; else hi = mid;
        }
        return paceSamples[lo].paceSec;
      };

      // Cumulative distances along polyline (in pixel-agnostic meters via haversine)
      const haversine = (a: [number, number], b: [number, number]) => {
        const R = 6371000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(b[1] - a[1]);
        const dLon = toRad(b[0] - a[0]);
        const s1 = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(s1));
      };
      const cum: number[] = [0];
      for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
      const totalLen = cum[cum.length - 1] || 1;

      // Look ~80m ahead/behind for a stable tangent regardless of polyline density.
      const LOOK_M = 80;
      const indexAtDist = (d: number) => {
        let lo = 0, hi = cum.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cum[mid] < d) lo = mid + 1; else hi = mid;
        }
        return lo;
      };
      const posAtDist = (d: number): [number, number] => {
        const dc = Math.max(0, Math.min(totalLen, d));
        const i = indexAtDist(dc);
        const i0 = Math.max(0, i - 1);
        const segLen = Math.max(1, cum[i] - cum[i0]);
        const segT = (dc - cum[i0]) / segLen;
        const a = coords[i0], b = coords[i];
        return [a[0] + (b[0] - a[0]) * segT, a[1] + (b[1] - a[1]) * segT];
      };
      const pointAt = (frac: number): { pos: [number, number]; bear: number } => {
        const target = totalLen * frac;
        const pos = posAtDist(target);
        const back = posAtDist(target - LOOK_M);
        const fwd = posAtDist(target + LOOK_M);
        const bear = bearing(back, fwd);
        return { pos, bear };
      };

      const sliceCoords = (frac: number): [number, number][] => {
        const target = totalLen * frac;
        const out: [number, number][] = [coords[0]];
        for (let i = 1; i < coords.length; i++) {
          if (cum[i] <= target) {
            out.push(coords[i]);
          } else {
            const segT = (target - cum[i - 1]) / Math.max(1, cum[i] - cum[i - 1]);
            const a = coords[i - 1], b = coords[i];
            out.push([a[0] + (b[0] - a[0]) * segT, a[1] + (b[1] - a[1]) * segT]);
            break;
          }
        }
        return out;
      };

      // Setup map container at full export resolution (offscreen via fixed but invisible)
      container.style.width = `${CANVAS_W}px`;
      container.style.height = `${Math.floor(CANVAS_H * MAP_H_FRAC)}px`;

      // Tear down any previous map
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      // Initial bounds-fit center/zoom
      const map = new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/outdoors-v12",
        center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
        zoom: 13,
        pitch: 0,
        bearing: 0,
        interactive: false,
        preserveDrawingBuffer: true,
        attributionControl: false,
        antialias: false,
      });
      mapRef.current = map;

      // Surface WebGL context loss as a clean error instead of crashing the PWA shell.
      const glCanvas = map.getCanvas();
      glCanvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        console.warn("WebGL context lost during flyover render");
        try { map.remove(); } catch { /* noop */ }
        mapRef.current = null;
        setPhase("error");
        toast.error(t("Your device ran out of GPU memory. Try again.", "裝置 GPU 記憶體不足，請再試一次。"));
      });

      await new Promise<void>((resolve, reject) => {
        map.once("load", () => resolve());
        map.once("error", (e) => reject(e.error || new Error("Map load failed")));
      });

      // 3D terrain + sky
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      map.addLayer({
        id: "sky",
        type: "sky",
        paint: {
          "sky-type": "atmosphere",
          "sky-atmosphere-sun": [0, 90],
          "sky-atmosphere-sun-intensity": 12,
        },
      });

      // Route source/layers (full route faded + progressive route bright)
      map.addSource("route-full", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } });
      map.addSource("route-progress", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [coords[0]] } } });

      map.addLayer({
        id: "route-full-line",
        type: "line",
        source: "route-full",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-opacity": 0.35, "line-width": 4 },
      });
      map.addLayer({
        id: "route-progress-halo",
        type: "line",
        source: "route-progress",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route-progress-line",
        type: "line",
        source: "route-progress",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#FC4C02", "line-width": 6 },
      });

      // Fit to bounds with padding to estimate target zoom
      const bounds = new mapboxgl.LngLatBounds(coords[0] as any, coords[0] as any);
      coords.forEach((c) => bounds.extend(c as any));
      const cam = map.cameraForBounds(bounds, { padding: 120, pitch: 0, bearing: 0 });
      const overviewZoom = cam?.zoom ?? 13;
      // Lower flyover zoom keeps far-tiles on screen so we don't expose grey gutters
      // when the camera pitches/rotates. Was overviewZoom + 2.2 (too tight).
      const flyoverZoom = Math.min(15.2, Math.max(13, overviewZoom + 0.8));

      // Compute dynamic flyover duration from route length
      const DURATION_MS = computeDurationMs(distanceMeters);

      // Pre-warm tiles along the entire flight path so frames don't show grey areas.
      // Pre-warm fewer poses so we don't blow tile cache on mobile.
      const SAMPLES = 5;
      for (let i = 0; i <= SAMPLES; i++) {
        const f = i / SAMPLES;
        const p = pointAt(f);
        map.jumpTo({ center: p.pos, zoom: flyoverZoom, pitch: 65, bearing: p.bear });
        await new Promise<void>((resolve) => map.once("idle", () => resolve()));
      }

      // Move camera to the flyover START pose, then wait for tiles+terrain to be fully ready
      const startPoint = pointAt(0);
      map.jumpTo({
        center: startPoint.pos,
        zoom: flyoverZoom,
        pitch: 65,
        bearing: startPoint.bear,
      });
      await new Promise<void>((resolve) => map.once("idle", () => resolve()));
      // Extra small delay so DEM-shaded terrain finishes shading the first frame
      await new Promise((r) => setTimeout(r, 250));

      // Setup composite canvas + recorder
      composite.width = CANVAS_W;
      composite.height = CANVAS_H;
      const ctx = composite.getContext("2d")!;
      const mapH = Math.floor(CANVAS_H * MAP_H_FRAC);

      const stream = composite.captureStream(30);
      const mimeCandidates = [
        "video/mp4;codecs=h264",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      const mime = mimeCandidates.find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

      setPhase("rendering");
      recorder.start();

      const start = performance.now();
      const progressSrc = map.getSource("route-progress") as mapboxgl.GeoJSONSource;

      // Overlay coords/fonts were tuned to 1080px wide. Scale to current canvas.
      const S = CANVAS_W / 1080;
      const px = (n: number) => Math.round(n * S);

      const drawOverlay = (tEase: number, animDist: number, animTimeSec: number, curPaceSec: number) => {
        // Top fade for title legibility
        const topFade = ctx.createLinearGradient(0, 0, 0, px(240));
        topFade.addColorStop(0, "rgba(0,0,0,0.6)");
        topFade.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = topFade;
        ctx.fillRect(0, 0, CANVAS_W, px(240));

        // Bottom panel
        const panelY = mapH;
        const panelH = CANVAS_H - mapH;
        const grad = ctx.createLinearGradient(0, panelY - px(60), 0, CANVAS_H);
        grad.addColorStop(0, "rgba(10,10,10,0)");
        grad.addColorStop(0.25, "rgba(10,10,10,0.95)");
        grad.addColorStop(1, "#1a1a1a");
        ctx.fillStyle = grad;
        ctx.fillRect(0, panelY - px(60), CANVAS_W, panelH + px(60));

        // Title
        ctx.fillStyle = "#fff";
        ctx.font = `700 ${px(56)}px ui-sans-serif, system-ui, -apple-system, 'Segoe UI'`;
        ctx.textAlign = "left";
        ctx.fillText(name.length > 28 ? name.slice(0, 27) + "…" : name, px(56), px(110));

        // Stats
        const ah = Math.floor(animTimeSec / 3600);
        const am = Math.floor((animTimeSec % 3600) / 60);
        const as = Math.floor(animTimeSec % 60);
        const animTimeStr = ah > 0
          ? `${ah}:${String(am).padStart(2, "0")}:${String(as).padStart(2, "0")}`
          : `${am}:${String(as).padStart(2, "0")}`;
        const cpm = Math.floor(curPaceSec / 60);
        const cps = Math.floor(curPaceSec % 60);
        const curPaceStr = curPaceSec > 0 ? `${cpm}:${String(cps).padStart(2, "0")}/km` : "--";

        const drawStat = (label: string, value: string, x: number, y: number) => {
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.font = `500 ${px(28)}px ui-sans-serif, system-ui`;
          ctx.fillText(label, x, y);
          ctx.fillStyle = "#fff";
          ctx.font = `800 ${px(76)}px ui-sans-serif, system-ui`;
          ctx.fillText(value, x, y + px(78));
        };
        const padX = px(64);
        const baseY = panelY + px(80);
        const colGap = px(540);
        drawStat(t("DISTANCE", "距離"), `${animDist.toFixed(2)} km`, padX, baseY);
        drawStat(t("TIME", "時間"), animTimeStr, padX + colGap, baseY);
        const row2Y = baseY + px(200);
        drawStat(t("PACE", "配速"), curPaceStr, padX, row2Y);
        if (elevationGainMeters != null) {
          drawStat(t("ELEV", "爬升"), `${Math.round(elevationGainMeters)} m`, padX + colGap, row2Y);
        }

        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `600 ${px(24)}px ui-sans-serif, system-ui`;
        ctx.textAlign = "right";
        ctx.fillText("RUNWARD", CANVAS_W - px(56), CANVAS_H - px(48));
      };

      const mapCanvas = map.getCanvas();

      // Smoothed bearing state (low-pass filter to kill jitter from polyline noise)
      let smoothBearing = pointAt(0).bear;
      const shortestDelta = (from: number, to: number) => {
        let d = ((to - from + 540) % 360) - 180;
        return d;
      };

      const drawFrame = (now: number) => {
        const elapsed = now - start;
        const tRaw = Math.min(1, elapsed / DURATION_MS);
        const tEase = tRaw < 0.5 ? 2 * tRaw * tRaw : 1 - Math.pow(-2 * tRaw + 2, 2) / 2;
        setProgress(tEase);

        let camCenter: [number, number];
        let targetBearing: number;
        let camPitch: number;
        let camZoom: number;
        let routeFrac: number;

        if (tEase < 0.92) {
          const k = tEase / 0.92;
          routeFrac = k;
          const p = pointAt(k);
          camCenter = p.pos;
          targetBearing = p.bear;
          camPitch = 65;
          camZoom = flyoverZoom;
        } else {
          const k = (tEase - 0.92) / 0.08;
          const end = pointAt(1);
          routeFrac = 1;
          camCenter = [
            end.pos[0] * (1 - k) + ((minLon + maxLon) / 2) * k,
            end.pos[1] * (1 - k) + ((minLat + maxLat) / 2) * k,
          ];
          targetBearing = smoothBearing; // hold heading during pull-back, no spin
          camPitch = 65 * (1 - k) + 30 * k;
          camZoom = flyoverZoom * (1 - k) + (overviewZoom + 0.3) * k;
        }

        // Low-pass filter the bearing so the camera no longer whips around.
        const alpha = 0.08;
        smoothBearing = (smoothBearing + shortestDelta(smoothBearing, targetBearing) * alpha + 360) % 360;
        const camBearing = smoothBearing;

        map.jumpTo({ center: camCenter, bearing: camBearing, pitch: camPitch, zoom: camZoom });
        progressSrc.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: sliceCoords(routeFrac) } } as any);

        // Force a synchronous paint, then composite
        map.triggerRepaint();
        // Let mapbox paint at least once for this frame
        // (drawImage from WebGL canvas works because we set preserveDrawingBuffer)
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        try {
          ctx.drawImage(mapCanvas, 0, 0, CANVAS_W, mapH);
        } catch {/* ignore */}

        const animDist = distKm * tEase;
        const animTime = totalSec * tEase;
        const curPaceSec = paceAt(tEase);
        drawOverlay(tEase, animDist, animTime, curPaceSec);

        if (tRaw < 1) {
          requestAnimationFrame(drawFrame);
        } else {
          setTimeout(() => recorder.stop(), 600);
        }
      };

      requestAnimationFrame(drawFrame);

      await stopped;
      const blob = new Blob(chunks, { type: mime.startsWith("video/mp4") ? "video/mp4" : "video/webm" });
      videoBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setPhase("done");

      // Cleanup map
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    } catch (err) {
      console.error(err);
      toast.error(t("Failed to generate video", "影片生成失敗"));
      setPhase("error");
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    }
  };

  const filename = () => {
    const ext = videoBlobRef.current?.type.includes("mp4") ? "mp4" : "webm";
    return `route-${Date.now()}.${ext}`;
  };

  const handleDownload = async () => {
    if (!videoBlobRef.current) return;
    const blob = videoBlobRef.current;
    const fname = filename();

    const freshUrl = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = freshUrl;
      a.download = fname;
      a.rel = "noopener";
      // Note: no target="_blank" — in standalone PWAs that navigates the app away.
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(t("Video saved", "影片已儲存"));
    } catch {
      toast.error(t("Download failed", "下載失敗"));
    }
    setTimeout(() => URL.revokeObjectURL(freshUrl), 60_000);
  };

  const handleShare = async () => {
    if (!videoBlobRef.current) return;
    const file = new File([videoBlobRef.current], filename(), { type: videoBlobRef.current.type });
    try {
      // @ts-ignore
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name, text: t("My route on Runward", "我的 Runward 路線") });
        return;
      }
    } catch {/* fall through */}
    handleDownload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film size={16} className="text-primary" />
            {t("Share route video", "分享路線影片")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Generate a 3D flyover video of your route with stats overlay.",
              "生成 3D 路線飛覽影片，附上統計資料。",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hidden offscreen mapbox container at export resolution */}
          <div
            ref={mapContainerRef}
            aria-hidden
            style={{
              position: "fixed",
              left: "-99999px",
              top: 0,
              width: `${CANVAS_W}px`,
              height: `${Math.floor(CANVAS_H * MAP_H_FRAC)}px`,
              pointerEvents: "none",
            }}
          />

          {/* Composite preview */}
          <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}`, maxHeight: "60vh" }}>
            <canvas
              ref={compositeCanvasRef}
              className="w-full h-full block"
              style={{ display: phase === "idle" || (phase === "done" && videoUrl) ? "none" : "block" }}
            />
            {videoUrl && phase === "done" && (
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            )}
            {phase === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2 p-6 text-center">
                <Film size={40} className="opacity-50" />
                <p className="text-sm">{t("Press Generate to create a 3D flyover.", "按下生成製作 3D 路線飛覽。")}</p>
              </div>
            )}
            {(phase === "loading" || phase === "rendering") && (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs text-center py-2">
                {phase === "loading" ? t("Loading 3D map…", "載入 3D 地圖中…") : `${t("Recording", "錄製中")}: ${Math.round(progress * 100)}%`}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end flex-wrap">
            {phase !== "done" ? (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={phase === "loading" || phase === "rendering"}>
                  {t("Cancel", "取消")}
                </Button>
                <Button onClick={handleGenerate} disabled={!polyline || phase === "loading" || phase === "rendering"}>
                  {(phase === "loading" || phase === "rendering") ? (
                    <><Loader2 className="animate-spin" size={14} />{t("Generating…", "生成中…")}</>
                  ) : (
                    <><Film size={14} />{t("Generate", "生成")}</>
                  )}
                </Button>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2 w-full">
                <Button variant="outline" size="sm" onClick={() => { setPhase("idle"); setVideoUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); }}>
                  {t("Regenerate", "重新生成")}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download size={14} />
                  {t("Download", "下載")}
                </Button>
                <Button size="sm" onClick={handleShare}>
                  <Share2 size={14} />
                  {t("Share", "分享")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RouteVideoDialog;

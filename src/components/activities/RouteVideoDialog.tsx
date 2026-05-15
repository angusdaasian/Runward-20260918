import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lang } from "@/lib/i18n";
import { Loader2, Download, Share2, Film } from "lucide-react";
import { toast } from "sonner";

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

// ---------- Web mercator tile math ----------
const TILE_SIZE = 256;
function lonLatToWorldPx(lon: number, lat: number, zoom: number) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const x = (lon + 180) / 360 * scale;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
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

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const DURATION_MS = 10000; // 10 second video

const RouteVideoDialog = ({
  open, onOpenChange, lang, polyline, name,
  distanceMeters, movingTimeSeconds, averageSpeed, elevationGainMeters, streams,
}: Props) => {
  const isZh = lang === "zh";
  const t = (en: string, zh: string) => (isZh ? zh : en);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "rendering" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoBlobRef = useRef<Blob | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      setPhase("idle");
      setProgress(0);
      videoBlobRef.current = null;
    }
  }, [open]); // eslint-disable-line

  const distKm = distanceMeters / 1000;
  const totalSec = movingTimeSeconds;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const timeStr = h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
  const paceSec = averageSpeed > 0 ? 1000 / averageSpeed : 0;
  const pm = Math.floor(paceSec / 60);
  const ps = Math.floor(paceSec % 60);
  const paceStr = paceSec > 0 ? `${pm}:${String(ps).padStart(2,"0")}/km` : "--";

  const handleGenerate = async () => {
    if (!polyline) {
      toast.error(t("No route data available", "沒有路線資料"));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    setPhase("loading");
    setProgress(0);

    try {
      const coords = decodePolyline(polyline);
      if (coords.length < 2) throw new Error("Empty route");

      // Build pace samples (sec/km) keyed by progress fraction along route
      // Prefer velocity_smooth + distance/time streams. Fallback to averageSpeed.
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
          const windowSec = 20; // smoothing window
          for (let i = 0; i < distData.length; i++) {
            let paceSec = 0;
            if (velData && velData[i] != null && velData[i] > 0.3) {
              paceSec = 1000 / velData[i];
            } else if (timeData) {
              // Compute rolling pace from window
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
        // Binary-ish linear scan
        let lo = 0, hi = paceSamples.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (paceSamples[mid].frac < frac) lo = mid + 1; else hi = mid;
        }
        return paceSamples[lo].paceSec;
      };

      // Compute bbox
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const [la, lo] of coords) {
        if (la < minLat) minLat = la; if (la > maxLat) maxLat = la;
        if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo;
      }
      // Padding
      const padFrac = 0.12;
      const latPad = (maxLat - minLat) * padFrac || 0.001;
      const lonPad = (maxLon - minLon) * padFrac || 0.001;
      minLat -= latPad; maxLat += latPad; minLon -= lonPad; maxLon += lonPad;

      // Pick zoom so that bbox fits inside CANVAS_W x (CANVAS_H * 0.65) (leave room for stats)
      const mapH = Math.floor(CANVAS_H * 0.78);
      const mapW = CANVAS_W;
      let zoom = 18;
      for (; zoom >= 2; zoom--) {
        const a = lonLatToWorldPx(minLon, maxLat, zoom);
        const b = lonLatToWorldPx(maxLon, minLat, zoom);
        if ((b.x - a.x) <= mapW && (b.y - a.y) <= mapH) break;
      }

      // Tile range
      const topLeft = lonLatToWorldPx(minLon, maxLat, zoom);
      const bottomRight = lonLatToWorldPx(maxLon, minLat, zoom);
      const centerWorld = { x: (topLeft.x + bottomRight.x) / 2, y: (topLeft.y + bottomRight.y) / 2 };
      const originX = centerWorld.x - mapW / 2;
      const originY = centerWorld.y - mapH / 2;

      const tileMinX = Math.floor(originX / TILE_SIZE);
      const tileMaxX = Math.floor((originX + mapW) / TILE_SIZE);
      const tileMinY = Math.floor(originY / TILE_SIZE);
      const tileMaxY = Math.floor((originY + mapH) / TILE_SIZE);

      const ctx = canvas.getContext("2d")!;
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;

      // Background
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Load all tiles
      const tilePromises: Promise<{ img: HTMLImageElement; tx: number; ty: number }>[] = [];
      const subdomains = ["a", "b", "c", "d"];
      for (let tx = tileMinX; tx <= tileMaxX; tx++) {
        for (let ty = tileMinY; ty <= tileMaxY; ty++) {
          const sd = subdomains[(tx + ty) % 4];
          const url = `https://${sd}.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${tx}/${ty}.png`;
          tilePromises.push(new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve({ img, tx, ty });
            img.onerror = () => reject(new Error(`tile ${tx},${ty}`));
            img.src = url;
          }));
        }
      }

      const tiles = await Promise.all(tilePromises);

      // Draw tiles into the map area (offset 0..mapH at top)
      for (const { img, tx, ty } of tiles) {
        const px = tx * TILE_SIZE - originX;
        const py = ty * TILE_SIZE - originY;
        ctx.drawImage(img, px, py);
      }

      // Snapshot map background for re-use each frame
      const mapBg = ctx.getImageData(0, 0, CANVAS_W, mapH);

      // Project route to canvas pixels
      const routePx = coords.map(([la, lo]) => {
        const w = lonLatToWorldPx(lo, la, zoom);
        return { x: w.x - originX, y: w.y - originY };
      });

      // Setup MediaRecorder
      const stream = canvas.captureStream(30);
      const mimeCandidates = [
        "video/mp4;codecs=h264",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      const mime = mimeCandidates.find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

      setPhase("rendering");
      recorder.start();

      const start = performance.now();

      // Pre-compute cumulative distances along route for smooth interp
      const cum: number[] = [0];
      for (let i = 1; i < routePx.length; i++) {
        const dx = routePx[i].x - routePx[i - 1].x;
        const dy = routePx[i].y - routePx[i - 1].y;
        cum.push(cum[i - 1] + Math.hypot(dx, dy));
      }
      const totalLen = cum[cum.length - 1] || 1;

      const drawFrame = (now: number) => {
        const elapsed = now - start;
        const tRaw = Math.min(1, elapsed / DURATION_MS);
        // Ease in-out
        const tEase = tRaw < 0.5 ? 2 * tRaw * tRaw : 1 - Math.pow(-2 * tRaw + 2, 2) / 2;
        setProgress(tEase);

        // Clear & redraw map area
        ctx.putImageData(mapBg, 0, 0);

        // Bottom panel for stats
        const panelY = mapH;
        const panelH = CANVAS_H - mapH;
        const grad = ctx.createLinearGradient(0, panelY, 0, CANVAS_H);
        grad.addColorStop(0, "#0a0a0a");
        grad.addColorStop(1, "#1a1a1a");
        ctx.fillStyle = grad;
        ctx.fillRect(0, panelY, CANVAS_W, panelH);
        // Subtle top fade over map for legibility
        const topFade = ctx.createLinearGradient(0, 0, 0, 220);
        topFade.addColorStop(0, "rgba(0,0,0,0.55)");
        topFade.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = topFade;
        ctx.fillRect(0, 0, CANVAS_W, 220);

        // Compute progress index along route
        const targetLen = totalLen * tEase;
        let segIdx = 0;
        while (segIdx < cum.length - 1 && cum[segIdx + 1] < targetLen) segIdx++;
        const segT = segIdx >= cum.length - 1 ? 1 : (targetLen - cum[segIdx]) / Math.max(1, cum[segIdx + 1] - cum[segIdx]);
        const headX = routePx[segIdx].x + (routePx[Math.min(segIdx + 1, routePx.length - 1)].x - routePx[segIdx].x) * segT;
        const headY = routePx[segIdx].y + (routePx[Math.min(segIdx + 1, routePx.length - 1)].y - routePx[segIdx].y) * segT;

        // Draw progressive polyline (white halo + orange line)
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(routePx[0].x, routePx[0].y);
        for (let i = 1; i <= segIdx; i++) ctx.lineTo(routePx[i].x, routePx[i].y);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.strokeStyle = "#FC4C02";
        ctx.lineWidth = 8;
        ctx.stroke();

        // Start dot
        ctx.beginPath();
        ctx.arc(routePx[0].x, routePx[0].y, 14, 0, Math.PI * 2);
        ctx.fillStyle = "#10B981"; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke();

        // Head dot (pulsing)
        const pulse = 14 + Math.sin(elapsed / 120) * 3;
        ctx.beginPath();
        ctx.arc(headX, headY, pulse + 8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(252,76,2,0.35)"; ctx.fill();
        ctx.beginPath();
        ctx.arc(headX, headY, pulse, 0, Math.PI * 2);
        ctx.fillStyle = "#FC4C02"; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke();

        // If finished, draw end dot
        if (tRaw >= 1) {
          const end = routePx[routePx.length - 1];
          ctx.beginPath();
          ctx.arc(end.x, end.y, 16, 0, Math.PI * 2);
          ctx.fillStyle = "#FC4C02"; ctx.fill();
          ctx.lineWidth = 5; ctx.strokeStyle = "#fff"; ctx.stroke();
        }

        // Title
        ctx.fillStyle = "#fff";
        ctx.font = "700 56px ui-sans-serif, system-ui, -apple-system, 'Segoe UI'";
        ctx.textAlign = "left";
        ctx.fillText(name.length > 28 ? name.slice(0, 27) + "…" : name, 56, 110);

        // Animated distance counter
        const animDist = distKm * tEase;
        const animTime = totalSec * tEase;
        const ah = Math.floor(animTime / 3600);
        const am = Math.floor((animTime % 3600) / 60);
        const as = Math.floor(animTime % 60);
        const animTimeStr = ah > 0
          ? `${ah}:${String(am).padStart(2,"0")}:${String(as).padStart(2,"0")}`
          : `${am}:${String(as).padStart(2,"0")}`;

        // Stats panel
        const panelPadX = 64;
        const baseY = panelY + 80;
        ctx.textAlign = "left";

        // Label/value pairs
        const drawStat = (label: string, value: string, x: number, y: number) => {
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.font = "500 28px ui-sans-serif, system-ui";
          ctx.fillText(label, x, y);
          ctx.fillStyle = "#fff";
          ctx.font = "800 76px ui-sans-serif, system-ui";
          ctx.fillText(value, x, y + 78);
        };

        drawStat(t("DISTANCE", "距離"), `${animDist.toFixed(2)} km`, panelPadX, baseY);
        drawStat(t("TIME", "時間"), animTimeStr, panelPadX + 540, baseY);

        const row2Y = baseY + 200;
        const curPaceSec = paceAt(tEase);
        const cpm = Math.floor(curPaceSec / 60);
        const cps = Math.floor(curPaceSec % 60);
        const curPaceStr = curPaceSec > 0 ? `${cpm}:${String(cps).padStart(2, "0")}/km` : "--";
        drawStat(t("PACE", "配速"), curPaceStr, panelPadX, row2Y);
        if (elevationGainMeters != null) {
          drawStat(t("ELEV", "爬升"), `${Math.round(elevationGainMeters)} m`, panelPadX + 540, row2Y);
        }

        // Branding
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "600 24px ui-sans-serif, system-ui";
        ctx.textAlign = "right";
        ctx.fillText("RUNWARD", CANVAS_W - 56, CANVAS_H - 48);

        if (tRaw < 1) {
          requestAnimationFrame(drawFrame);
        } else {
          // Hold last frame ~600ms then stop
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
    } catch (err) {
      console.error(err);
      toast.error(t("Failed to generate video", "影片生成失敗"));
      setPhase("error");
    }
  };

  const filename = () => {
    const ext = videoBlobRef.current?.type.includes("mp4") ? "mp4" : "webm";
    return `route-${Date.now()}.${ext}`;
  };

  const handleDownload = () => {
    if (!videoBlobRef.current || !videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = filename();
    document.body.appendChild(a);
    a.click();
    a.remove();
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
    } catch (e) {
      // fall through to download
    }
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
              "Generate an animated video of your route with stats overlay.",
              "生成你的路線動畫影片，附上統計資料。",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Canvas preview (scaled) */}
          <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}`, maxHeight: "60vh" }}>
            <canvas
              ref={canvasRef}
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
                <p className="text-sm">{t("Press Generate to create a 10-second route flyover.", "按下生成製作 10 秒路線動畫。")}</p>
              </div>
            )}
            {(phase === "loading" || phase === "rendering") && (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs text-center py-2">
                {phase === "loading" ? t("Loading map…", "載入地圖中…") : `${t("Recording", "錄製中")}: ${Math.round(progress * 100)}%`}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
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
              <>
                <Button variant="outline" onClick={() => { setPhase("idle"); setVideoUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); }}>
                  {t("Regenerate", "重新生成")}
                </Button>
                <Button variant="outline" onClick={handleDownload}>
                  <Download size={14} />
                  {t("Download", "下載")}
                </Button>
                <Button onClick={handleShare}>
                  <Share2 size={14} />
                  {t("Share", "分享")}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RouteVideoDialog;

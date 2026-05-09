/**
 * Share an activity as a generated image card.
 *
 * Renders a Strava-style summary on a <canvas>:
 *  - Top half: hero photo with activity title + stat row (Distance / Pace / Time)
 *  - Bottom: notepad-styled card containing the AI analysis
 *  - Footer: Runward branding (logo + url)
 *
 * Distribution:
 *  1. Native (Despia) → save to camera roll via `savethisimage://`
 *  2. Web Share API → share PNG as a File
 *  3. Otherwise → download the PNG
 */
import despia from "despia-native";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";

import appIcon from "@/assets/app-icon.png";
import bg1 from "@/assets/share-bg-1.jpg";
import bg2 from "@/assets/share-bg-2.jpg";
import bg3 from "@/assets/share-bg-3.jpg";

const APP_NAME = "Runward";
const APP_URL = "https://pacecalculator.fun";
const HEROES = [bg1, bg2, bg3];

export interface ShareActivityInput {
  name: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  averageSpeed: number; // m/s
  startDate: string;
  averageHeartrate?: number | null;
  elevationGainMeters?: number | null;
  summaryPolyline?: string | null;
  analysis?: string | null; // unused (kept for backwards compat)
  nextWorkout?: string | null; // unused
  lang: Lang;
}

export interface ShareSplit {
  distance: number; // meters
  elapsed_time: number; // seconds
  average_speed: number; // m/s
  average_heartrate?: number | null;
}

export interface ShareSplitsInput {
  name: string;
  startDate: string;
  splits: ShareSplit[];
  lang: Lang;
}

export interface ShareChartPoint {
  distance_km: number; // x-axis
  pace?: number;       // min/km (decimal)
  heartrate?: number;  // bpm
}

export interface ShareChartsInput {
  name: string;
  startDate: string;
  data: ShareChartPoint[];
  lang: Lang;
}

// ---------------- formatting helpers ----------------

function fmtDistance(meters: number): string {
  return (meters / 1000).toFixed(2);
}

function fmtTimeShort(seconds: number, isZh: boolean): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return isZh ? `${h}時 ${m}分` : `${h}h ${m}m`;
  }
  return isZh ? `${m}分 ${s}秒` : `${m}m ${s}s`;
}

function fmtPace(avgSpeed: number, isZh: boolean): string {
  if (!avgSpeed || avgSpeed <= 0) return "--";
  const paceSec = 1000 / avgSpeed;
  const min = Math.floor(paceSec / 60);
  const sec = Math.floor(paceSec % 60);
  return `${min}:${String(sec).padStart(2, "0")} ${isZh ? "/公里" : "/km"}`;
}

function fmtDate(iso: string, lang: Lang): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------- canvas helpers ----------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function pickHero(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HEROES[h % HEROES.length];
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draw image cropped to fill the target rect (object-cover). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;
  if (ir > tr) {
    // Image wider → crop sides
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / tr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Word-wrap text within maxWidth. Returns the y position after the block. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const paragraphs = text.split("\n");
  let lines: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const ch of para) {
      const test = current + ch;
      if (ctx.measureText(test).width > maxWidth && current.length > 0) {
        lines.push(current);
        current = ch;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let trimmed = lines[maxLines - 1];
    while (ctx.measureText(trimmed + "…").width > maxWidth && trimmed.length > 0) {
      trimmed = trimmed.slice(0, -1);
    }
    lines[maxLines - 1] = trimmed + "…";
  }
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  return y + lines.length * lineHeight;
}

// ---------------- card renderer ----------------

const FONT_DISPLAY =
  "-apple-system, 'SF Pro Display', 'PingFang TC', 'Helvetica Neue', system-ui, sans-serif";
const FONT_TEXT =
  "-apple-system, 'SF Pro Text', 'PingFang TC', 'Helvetica Neue', system-ui, sans-serif";
const FONT_HAND =
  "'Bradley Hand', 'Noteworthy', 'Marker Felt', 'Comic Sans MS', 'PingFang TC', cursive";

// Draws an Instagram glyph + @runward.app handle right-aligned, vertically centered at midY.
function drawIgHandle(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  midY: number,
  color: string = "#0F172A",
) {
  const handle = "@runward.app";
  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = `600 20px ${FONT_TEXT}`;
  const handleW = ctx.measureText(handle).width;
  ctx.fillText(handle, rightX, midY);
  const igSize = 30;
  const igX = rightX - handleW - 12 - igSize;
  const igY = midY - igSize / 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.2;
  roundedRect(ctx, igX, igY, igSize, igSize, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(igX + igSize / 2, igY + igSize / 2, igSize * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(igX + igSize - 7, igY + 7, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Decode Google encoded polyline → [lat, lng] pairs
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function drawRouteOnCanvas(
  ctx: CanvasRenderingContext2D,
  coords: [number, number][],
  x: number, y: number, w: number, h: number,
) {
  if (coords.length < 2) return;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [la, ln] of coords) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (ln < minLng) minLng = ln;
    if (ln > maxLng) maxLng = ln;
  }
  // Mercator-ish: lng cos(lat) correction
  const midLat = (minLat + maxLat) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const dx = (maxLng - minLng) * cos || 1e-6;
  const dy = (maxLat - minLat) || 1e-6;
  const pad = 24;
  const aw = w - pad * 2;
  const ah = h - pad * 2;
  const scale = Math.min(aw / dx, ah / dy);
  const drawW = dx * scale;
  const drawH = dy * scale;
  const offX = x + pad + (aw - drawW) / 2;
  const offY = y + pad + (ah - drawH) / 2;
  const project = (lat: number, lng: number): [number, number] => [
    offX + (lng - minLng) * cos * scale,
    offY + (maxLat - lat) * scale,
  ];

  // White outline
  ctx.beginPath();
  for (let i = 0; i < coords.length; i++) {
    const [px, py] = project(coords[i][0], coords[i][1]);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 16;
  ctx.stroke();

  // Accent line
  ctx.strokeStyle = "#FC4C02";
  ctx.lineWidth = 9;
  ctx.stroke();

  // Start / end dots
  const drawDot = (lat: number, lng: number, fill: string) => {
    const [px, py] = project(lat, lng);
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
}

// Web Mercator projection helpers
function lonLatToWorld(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

async function drawMapWithTiles(
  ctx: CanvasRenderingContext2D,
  coords: [number, number][],
  x: number, y: number, w: number, h: number,
): Promise<boolean> {
  if (coords.length < 2) return false;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [la, ln] of coords) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (ln < minLng) minLng = ln;
    if (ln > maxLng) maxLng = ln;
  }
  const TILE = 256; // tile world units; @2x retina images source for sharpness
  const pad = 56;
  const MAX_TILE_SCALE = 2; // @2x tiles stay sharp up to this draw scale
  const aw = w - pad * 2;
  const ah = h - pad * 2;

  let zoom = 2;
  for (let z = 19; z >= 2; z--) {
    const tl = lonLatToWorld(maxLat, minLng, z);
    const br = lonLatToWorld(minLat, maxLng, z);
    const pxW = (br.x - tl.x) * TILE;
    const pxH = (br.y - tl.y) * TILE;
    if (pxW <= aw && pxH <= ah) { zoom = z; break; }
    zoom = z;
  }

  const tlW = lonLatToWorld(maxLat, minLng, zoom);
  const brW = lonLatToWorld(minLat, maxLng, zoom);
  const minWorldX = tlW.x * TILE;
  const minWorldY = tlW.y * TILE;
  const maxWorldX = brW.x * TILE;
  const maxWorldY = brW.y * TILE;
  const routePxW = Math.max(1, maxWorldX - minWorldX);
  const routePxH = Math.max(1, maxWorldY - minWorldY);
  const scale = Math.min(aw / routePxW, ah / routePxH, MAX_TILE_SCALE);
  const viewportOriginX = (minWorldX + maxWorldX) / 2 - w / (2 * scale);
  const viewportOriginY = (minWorldY + maxWorldY) / 2 - h / (2 * scale);
  const viewportEndX = viewportOriginX + w / scale;
  const viewportEndY = viewportOriginY + h / scale;

  const minTx = Math.floor(viewportOriginX / TILE);
  const maxTx = Math.floor(viewportEndX / TILE);
  const minTy = Math.floor(viewportOriginY / TILE);
  const maxTy = Math.floor(viewportEndY / TILE);

  const tasks: Promise<{ tx: number; ty: number; img: HTMLImageElement | null }>[] = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const sub = "abcd"[(tx + ty) & 3];
      const url = `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${tx}/${ty}@2x.png`;
      tasks.push(
        loadImage(url).then((img) => ({ tx, ty, img })).catch(() => ({ tx, ty, img: null as any })),
      );
    }
  }
  const tiles = await Promise.all(tasks);

  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevQuality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const t of tiles) {
    if (!t.img) continue;
    const tilePxX = t.tx * TILE;
    const tilePxY = t.ty * TILE;
    const dx = x + (tilePxX - viewportOriginX) * scale;
    const dy = y + (tilePxY - viewportOriginY) * scale;
    const ds = TILE * scale;
    ctx.drawImage(t.img, dx, dy, ds, ds);
  }
  ctx.imageSmoothingEnabled = prevSmooth;
  ctx.imageSmoothingQuality = prevQuality;

  const project = (lat: number, lng: number): [number, number] => {
    const wp = lonLatToWorld(lat, lng, zoom);
    return [
      x + (wp.x * TILE - viewportOriginX) * scale,
      y + (wp.y * TILE - viewportOriginY) * scale,
    ];
  };

  ctx.beginPath();
  for (let i = 0; i < coords.length; i++) {
    const [px, py] = project(coords[i][0], coords[i][1]);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = "#FC4C02";
  ctx.lineWidth = 5;
  ctx.stroke();

  const drawDot = (lat: number, lng: number, fill: string) => {
    const [px, py] = project(lat, lng);
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  drawDot(coords[0][0], coords[0][1], "#22C55E");
  drawDot(coords[coords.length - 1][0], coords[coords.length - 1][1], "#EF4444");

  return true;
}


async function renderShareCard(input: ShareActivityInput): Promise<Blob> {
  const W = 1080;
  const H = 1350; // 4:5 — clean, no excess whitespace
  const isZh = input.lang === "zh";

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Soft warm gradient background (transparent feel — light, no photo)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#FFFFFF");
  bg.addColorStop(1, "#F4F1EC");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Outer card
  const M = 48; // page margin
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = H - M * 2;
  const cardR = 40;

  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.10)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#FFFFFF";
  roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fill();
  ctx.restore();

  // Subtle border
  ctx.strokeStyle = "rgba(15,23,42,0.06)";
  ctx.lineWidth = 1.5;
  roundedRect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, cardR);
  ctx.stroke();

  // ---------- Header (logo + brand + date) ----------
  const headerY = cardY + 44;
  try {
    const icon = await loadImage(appIcon);
    ctx.save();
    roundedRect(ctx, cardX + 44, headerY, 56, 56, 14);
    ctx.clip();
    ctx.drawImage(icon, cardX + 44, headerY, 56, 56);
    ctx.restore();
  } catch { /* ignore */ }

  ctx.fillStyle = "#0F172A";
  ctx.textBaseline = "top";
  ctx.font = `700 28px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, cardX + 116, headerY + 4);
  ctx.fillStyle = "#64748B";
  ctx.font = `500 18px ${FONT_TEXT}`;
  ctx.fillText(isZh ? "AI 跑步教練" : "AI Running Coach", cardX + 116, headerY + 34);

  // Date right-aligned
  ctx.textAlign = "right";
  ctx.fillStyle = "#64748B";
  ctx.font = `600 20px ${FONT_TEXT}`;
  ctx.fillText(fmtDate(input.startDate, input.lang), cardX + cardW - 44, headerY + 18);
  ctx.textAlign = "left";

  // ---------- Activity title ----------
  const titleY = headerY + 100;
  ctx.fillStyle = "#0F172A";
  ctx.font = `800 56px ${FONT_DISPLAY}`;
  const titleEnd = wrapText(ctx, input.name, cardX + 44, titleY, cardW - 88, 64, 2);

  // Accent underline
  ctx.fillStyle = "#FC4C02";
  ctx.fillRect(cardX + 44, titleEnd + 8, 64, 5);

  // ---------- Map area ----------
  const mapY = titleEnd + 44;
  const mapH = 560;
  const mapX = cardX + 44;
  const mapW = cardW - 88;
  const mapR = 28;

  // Map background card
  ctx.save();
  roundedRect(ctx, mapX, mapY, mapW, mapH, mapR);
  ctx.clip();
  // Light map background (in case tiles fail)
  ctx.fillStyle = "#E8EEF4";
  ctx.fillRect(mapX, mapY, mapW, mapH);

  // Route polyline + tiled basemap
  let drewRoute = false;
  if (input.summaryPolyline) {
    try {
      const coords = decodePolyline(input.summaryPolyline);
      if (coords.length >= 2) {
        drewRoute = await drawMapWithTiles(ctx, coords, mapX, mapY, mapW, mapH);
      }
    } catch (err) {
      console.warn("[Share] map render failed:", err);
    }
  }
  if (!drewRoute) {
    ctx.fillStyle = "#94A3B8";
    ctx.font = `500 24px ${FONT_TEXT}`;
    ctx.textAlign = "center";
    ctx.fillText(isZh ? "無 GPS 軌跡" : "No GPS route", mapX + mapW / 2, mapY + mapH / 2 - 12);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // ---------- Stats grid (Distance / Pace / Time + optional row) ----------
  const statsY = mapY + mapH + 40;
  const stats: { label: string; value: string }[] = [
    { label: isZh ? "距離" : "Distance", value: `${fmtDistance(input.distanceMeters)} ${isZh ? "公里" : "km"}` },
    { label: isZh ? "配速" : "Pace", value: fmtPace(input.averageSpeed, isZh) },
    { label: isZh ? "時間" : "Time", value: fmtTimeShort(input.movingTimeSeconds, isZh) },
  ];
  // Add HR/elevation if present (replace pace row's siblings on a 2nd row)
  const extras: { label: string; value: string }[] = [];
  if (input.averageHeartrate && input.averageHeartrate > 0) {
    extras.push({ label: isZh ? "平均心率" : "Avg HR", value: `${Math.round(input.averageHeartrate)} bpm` });
  }
  if (input.elevationGainMeters && input.elevationGainMeters > 0) {
    extras.push({ label: isZh ? "爬升" : "Elevation", value: `${Math.round(input.elevationGainMeters)} m` });
  }

  const colW = (cardW - 88) / 3;
  stats.forEach((s, i) => {
    const cx = cardX + 44 + colW * i;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#94A3B8";
    ctx.font = `600 18px ${FONT_TEXT}`;
    ctx.fillText(s.label.toUpperCase(), cx, statsY);
    ctx.fillStyle = "#0F172A";
    ctx.font = `800 44px ${FONT_DISPLAY}`;
    ctx.fillText(s.value, cx, statsY + 30);
  });

  if (extras.length > 0) {
    const extraY = statsY + 110;
    const extraCol = (cardW - 88) / Math.max(extras.length, 2);
    extras.forEach((s, i) => {
      const cx = cardX + 44 + extraCol * i;
      ctx.fillStyle = "#94A3B8";
      ctx.font = `600 16px ${FONT_TEXT}`;
      ctx.fillText(s.label.toUpperCase(), cx, extraY);
      ctx.fillStyle = "#0F172A";
      ctx.font = `700 32px ${FONT_DISPLAY}`;
      ctx.fillText(s.value, cx, extraY + 26);
    });
  }

  // ---------- Footer (brand URL) ----------
  const footerY = cardY + cardH - 70;
  // Divider
  ctx.strokeStyle = "rgba(15,23,42,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 44, footerY - 16);
  ctx.lineTo(cardX + cardW - 44, footerY - 16);
  ctx.stroke();

  ctx.fillStyle = "#0F172A";
  ctx.textBaseline = "top";
  ctx.font = `700 22px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, cardX + 44, footerY);
  drawIgHandle(ctx, cardX + cardW - 44, footerY + 12, "#0F172A");
  ctx.textAlign = "left";

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/png",
      0.95,
    );
  });
}

// ---------------- distribution ----------------

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function hasNativeBridge(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as any).median !== "undefined" ||
    typeof (window as any).despia !== "undefined" ||
    (navigator as any).standalone === true
  );
}

export async function shareActivity(input: ShareActivityInput): Promise<void> {
  const isZh = input.lang === "zh";
  const loadingId = toast.loading(isZh ? "正在生成分享圖片..." : "Generating share image...");

  let blob: Blob;
  try {
    blob = await renderShareCard(input);
  } catch (err) {
    console.error("[Share] Render failed:", err);
    toast.dismiss(loadingId);
    toast.error(isZh ? "無法生成圖片" : "Failed to create image");
    return;
  }

  toast.dismiss(loadingId);

  // 1. Native bridge → save to camera roll
  if (hasNativeBridge()) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      despia(`savethisimage://?url=${dataUrl}`);
      toast.success(isZh ? "已儲存到相簿" : "Saved to camera roll");
      return;
    } catch (err) {
      console.warn("[Share] Despia save failed, falling back:", err);
    }
  }

  // 2. Web Share API (with file)
  const file = new File([blob], `runward-${Date.now()}.png`, { type: "image/png" });
  const navAny = navigator as any;
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navAny.canShare === "function" &&
    navAny.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: APP_NAME,
        text: isZh
          ? `由 ${APP_NAME} 追蹤 · ${APP_URL}`
          : `Tracked with ${APP_NAME} · ${APP_URL}`,
      });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.warn("[Share] navigator.share failed, falling back:", err);
    }
  }

  // 3. Download fallback
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `runward-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(isZh ? "圖片已下載" : "Image downloaded");
  } catch {
    toast.error(isZh ? "無法分享" : "Unable to share");
  }
}

// ====================================================================
// SPLITS SHARE CARD
// ====================================================================

async function renderSplitsCard(input: ShareSplitsInput): Promise<Blob> {
  const isZh = input.lang === "zh";

  // Filter GPS-noise laps + detect intervals
  const NOISE_DIST_M = 50;
  const NOISE_TIME_S = 10;
  const visible = input.splits.filter(
    (s) => !((s.distance || 0) < NOISE_DIST_M && (s.elapsed_time || 0) < NOISE_TIME_S),
  );

  const speeds = visible.map((s) => s.average_speed).filter((v) => v > 0);
  const hrs = visible.map((s) => s.average_heartrate ?? 0).filter((v) => v > 0);
  const fastestSpeed = speeds.length ? Math.max(...speeds) : 0;
  const slowestSpeed = speeds.length ? Math.min(...speeds) : 0;
  let isInterval = false;
  if (speeds.length >= 3 && slowestSpeed > 0) {
    const ratio = fastestSpeed / slowestSpeed;
    const hrSpread = hrs.length >= 3 ? Math.max(...hrs) - Math.min(...hrs) : 0;
    isInterval = ratio >= 1.4 || (ratio >= 1.25 && hrSpread >= 20);
  }

  // Totals
  const totalDist = visible.reduce((a, s) => a + (s.distance || 0), 0);
  const totalTime = visible.reduce((a, s) => a + (s.elapsed_time || 0), 0);
  const avgSpeedTotal = totalTime > 0 ? totalDist / totalTime : 0;
  const hrWeighted = visible.reduce((a, s) => a + ((s.average_heartrate || 0) * (s.elapsed_time || 0)), 0);
  const hrTimeSum = visible.reduce((a, s) => a + (s.average_heartrate ? (s.elapsed_time || 0) : 0), 0);
  const avgHrTotal = hrTimeSum > 0 ? Math.round(hrWeighted / hrTimeSum) : null;

  const fmtPaceMM = (mps: number) => {
    if (!(mps > 0)) return "--";
    const p = 1000 / mps;
    const m = Math.floor(p / 60);
    const sec = Math.floor(p % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const W = 1080;
  const headerH = 220;
  const rowH = 60;
  const tableHeaderH = 56;
  const totalRowH = 78;
  const footerH = 96;
  const padX = 48;
  const tablePadTop = 18;
  const H = headerH + tableHeaderH + visible.length * rowH + totalRowH + tablePadTop + footerH + 80;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Soft warm background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#FFFFFF");
  bg.addColorStop(1, "#F4F1EC");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Outer card
  const cardX = padX;
  const cardY = padX;
  const cardW = W - padX * 2;
  const cardH = H - padX * 2;
  const cardR = 36;

  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.10)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#FFFFFF";
  roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(15,23,42,0.06)";
  ctx.lineWidth = 1.5;
  roundedRect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, cardR);
  ctx.stroke();

  const innerPad = 40;
  const innerX = cardX + innerPad;
  const innerW = cardW - innerPad * 2;

  // Header
  const headerY = cardY + 36;
  try {
    const icon = await loadImage(appIcon);
    ctx.save();
    roundedRect(ctx, innerX, headerY, 56, 56, 14);
    ctx.clip();
    ctx.drawImage(icon, innerX, headerY, 56, 56);
    ctx.restore();
  } catch { /* ignore */ }

  ctx.fillStyle = "#0F172A";
  ctx.textBaseline = "top";
  ctx.font = `700 28px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, innerX + 72, headerY + 4);
  ctx.fillStyle = "#64748B";
  ctx.font = `500 18px ${FONT_TEXT}`;
  ctx.fillText(isZh ? "AI 跑步教練" : "AI Running Coach", innerX + 72, headerY + 34);

  ctx.textAlign = "right";
  ctx.fillStyle = "#64748B";
  ctx.font = `600 20px ${FONT_TEXT}`;
  ctx.fillText(fmtDate(input.startDate, input.lang), innerX + innerW, headerY + 18);
  ctx.textAlign = "left";

  // Title
  const titleY = headerY + 96;
  ctx.fillStyle = "#0F172A";
  ctx.font = `800 44px ${FONT_DISPLAY}`;
  const titleEnd = wrapText(ctx, isZh ? "分段" : "Intervals", innerX, titleY, innerW, 50, 1);
  ctx.fillStyle = "#FC4C02";
  ctx.fillRect(innerX, titleEnd + 8, 56, 4);

  // Table header
  const tableY = headerH;
  const HR_RIGHT = innerX + innerW;
  const PACE_RIGHT = HR_RIGHT - 150;
  const DIST_RIGHT = PACE_RIGHT - 150;
  const TIME_RIGHT = DIST_RIGHT - 150;
  const NUM_LEFT = innerX;
  const TYPE_LEFT = innerX + 70;

  ctx.fillStyle = "#94A3B8";
  ctx.font = `700 16px ${FONT_TEXT}`;
  ctx.textBaseline = "middle";
  const headerMid = tableY + tableHeaderH / 2;
  ctx.textAlign = "left";
  ctx.fillText("#", NUM_LEFT, headerMid);
  ctx.fillText(isZh ? "類型" : "TYPE", TYPE_LEFT, headerMid);
  ctx.textAlign = "right";
  ctx.fillText(isZh ? "時間" : "TIME", TIME_RIGHT, headerMid);
  ctx.fillText(isZh ? "距離(m)" : "DIST(m)", DIST_RIGHT, headerMid);
  ctx.fillText(isZh ? "配速" : "PACE", PACE_RIGHT, headerMid);
  ctx.fillText("HR", HR_RIGHT, headerMid);

  ctx.strokeStyle = "rgba(15,23,42,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(innerX, tableY + tableHeaderH);
  ctx.lineTo(innerX + innerW, tableY + tableHeaderH);
  ctx.stroke();

  // Rows
  let runNum = 0;
  visible.forEach((s, idx) => {
    const y = tableY + tableHeaderH + tablePadTop + idx * rowH;
    const isRest =
      isInterval && fastestSpeed > 0 && s.average_speed > 0 && s.average_speed < fastestSpeed * 0.7;
    if (!isRest) runNum++;

    if (isRest) {
      ctx.fillStyle = "rgba(15,23,42,0.03)";
      ctx.fillRect(innerX, y, innerW, rowH);
    }

    ctx.strokeStyle = "rgba(15,23,42,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(innerX, y + rowH);
    ctx.lineTo(innerX + innerW, y + rowH);
    ctx.stroke();

    const mid = y + rowH / 2;
    const baseColor = isRest ? "#94A3B8" : "#0F172A";
    const accentWeight = isRest ? "500" : "700";

    if (!isRest) {
      ctx.fillStyle = "#FC4C02";
      ctx.beginPath();
      ctx.arc(NUM_LEFT + 10, mid, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = baseColor;
    ctx.font = `700 22px ${FONT_TEXT}`;
    ctx.textAlign = "left";
    ctx.fillText(isRest ? "" : String(runNum), NUM_LEFT + 24, mid);

    ctx.font = `${accentWeight} 22px ${FONT_TEXT}`;
    ctx.fillStyle = baseColor;
    ctx.fillText(
      isRest ? (isZh ? "休息" : "Rest") : (isZh ? "跑步" : "Run"),
      TYPE_LEFT,
      mid,
    );

    ctx.textAlign = "right";
    ctx.font = `${accentWeight} 22px ${FONT_TEXT}`;
    ctx.fillText(fmtTimeShort(s.elapsed_time, false).replace(/\s/g, ""), TIME_RIGHT, mid);
    ctx.fillText(String(Math.round(s.distance || 0)), DIST_RIGHT, mid);
    ctx.fillText(fmtPaceMM(s.average_speed), PACE_RIGHT, mid);
    ctx.fillText(s.average_heartrate ? String(Math.round(s.average_heartrate)) : "--", HR_RIGHT, mid);
  });

  // Total row
  const totalY = tableY + tableHeaderH + tablePadTop + visible.length * rowH + 10;
  const totalH = totalRowH - 18;
  ctx.save();
  roundedRect(ctx, innerX, totalY, innerW, totalH, 14);
  ctx.fillStyle = "rgba(252,76,2,0.08)";
  ctx.fill();
  ctx.restore();

  const totalMid = totalY + totalH / 2;
  ctx.fillStyle = "#FC4C02";
  ctx.font = `800 22px ${FONT_DISPLAY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Σ", NUM_LEFT + 4, totalMid);
  ctx.fillStyle = "#0F172A";
  ctx.font = `800 22px ${FONT_DISPLAY}`;
  ctx.fillText(isZh ? "總計" : "TOTAL", TYPE_LEFT, totalMid);

  ctx.textAlign = "right";
  ctx.font = `800 22px ${FONT_DISPLAY}`;
  ctx.fillText(fmtTimeShort(totalTime, false).replace(/\s/g, ""), TIME_RIGHT, totalMid);
  ctx.fillText(String(Math.round(totalDist)), DIST_RIGHT, totalMid);
  ctx.fillText(fmtPaceMM(avgSpeedTotal), PACE_RIGHT, totalMid);
  ctx.fillText(avgHrTotal != null ? String(avgHrTotal) : "--", HR_RIGHT, totalMid);

  // Footer
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const footerY = cardY + cardH - 56;
  ctx.strokeStyle = "rgba(15,23,42,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(innerX, footerY - 16);
  ctx.lineTo(innerX + innerW, footerY - 16);
  ctx.stroke();

  ctx.fillStyle = "#0F172A";
  ctx.font = `700 22px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, innerX, footerY);
  drawIgHandle(ctx, innerX + innerW, footerY + 12, "#0F172A");
  ctx.textAlign = "left";


  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/png",
      0.95,
    );
  });
}

async function distributeBlob(blob: Blob, lang: Lang) {
  const isZh = lang === "zh";
  if (hasNativeBridge()) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      despia(`savethisimage://?url=${dataUrl}`);
      toast.success(isZh ? "已儲存到相簿" : "Saved to camera roll");
      return;
    } catch (err) {
      console.warn("[Share] Despia save failed, falling back:", err);
    }
  }
  const file = new File([blob], `runward-${Date.now()}.png`, { type: "image/png" });
  const navAny = navigator as any;
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navAny.canShare === "function" &&
    navAny.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: APP_NAME,
        text: isZh
          ? `由 ${APP_NAME} 追蹤 · ${APP_URL}`
          : `Tracked with ${APP_NAME} · ${APP_URL}`,
      });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.warn("[Share] navigator.share failed, falling back:", err);
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `runward-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(isZh ? "圖片已下載" : "Image downloaded");
  } catch {
    toast.error(isZh ? "無法分享" : "Unable to share");
  }
}

export async function shareSplits(input: ShareSplitsInput): Promise<void> {
  const isZh = input.lang === "zh";
  const loadingId = toast.loading(isZh ? "正在生成分段圖片..." : "Generating splits image...");
  let blob: Blob;
  try {
    blob = await renderSplitsCard(input);
  } catch (err) {
    console.error("[ShareSplits] Render failed:", err);
    toast.dismiss(loadingId);
    toast.error(isZh ? "無法生成圖片" : "Failed to create image");
    return;
  }
  toast.dismiss(loadingId);
  await distributeBlob(blob, input.lang);
}

// ====================================================================
// CHARTS SHARE CARD (Pace + HR)
// ====================================================================

function fmtPaceMin(min: number): string {
  if (!isFinite(min) || min <= 0) return "--";
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface ChartRect { x: number; y: number; w: number; h: number; }

function drawChart(
  ctx: CanvasRenderingContext2D,
  rect: ChartRect,
  points: { x: number; y: number }[],
  opts: {
    title: string;
    unit: string;
    color: string;
    fillColor: string;
    invertY?: boolean; // pace: lower number = faster = visually higher
    yFmt: (v: number) => string;
    xFmt: (v: number) => string;
    isZh: boolean;
  },
) {
  const { x, y, w, h } = rect;

  // Card background — light, matches activity share card
  ctx.fillStyle = "#FFFFFF";
  roundedRect(ctx, x, y, w, h, 24);
  ctx.fill();
  ctx.strokeStyle = "rgba(15,23,42,0.08)";
  ctx.lineWidth = 1.5;
  roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 24);
  ctx.stroke();

  // Title
  ctx.fillStyle = "#0F172A";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `800 30px ${FONT_DISPLAY}`;
  ctx.fillText(opts.title, x + 28, y + 22);
  ctx.fillStyle = "#94A3B8";
  ctx.font = `600 16px ${FONT_TEXT}`;
  ctx.fillText(opts.unit.toUpperCase(), x + 28, y + 60);
  // Accent underline under title
  ctx.fillStyle = opts.color;
  ctx.fillRect(x + 28, y + 56, 36, 3);

  // Plot area
  const padL = 90, padR = 36, padT = 100, padB = 56;
  const plotX = x + padL;
  const plotY = y + padT;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  if (points.length < 2) {
    ctx.fillStyle = "#94A3B8";
    ctx.font = `500 22px ${FONT_TEXT}`;
    ctx.textAlign = "center";
    ctx.fillText(opts.isZh ? "沒有資料" : "No data", x + w / 2, y + h / 2);
    return;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.1;
  yMin -= pad; yMax += pad;

  const sx = (v: number) => plotX + ((v - xMin) / (xMax - xMin)) * plotW;
  const sy = (v: number) => {
    const t = (v - yMin) / (yMax - yMin);
    const ratio = opts.invertY ? t : 1 - t;
    return plotY + ratio * plotH;
  };

  // ---------- Smoothing & downsampling ----------
  // 1) LTTB downsample to ~120 points to remove noise
  // 2) Build monotone-cubic spline path for buttery curves
  const downsample = (pts: { x: number; y: number }[], threshold: number) => {
    if (pts.length <= threshold) return pts;
    const sampled: typeof pts = [];
    const bucketSize = (pts.length - 2) / (threshold - 2);
    let a = 0;
    sampled.push(pts[0]);
    for (let i = 0; i < threshold - 2; i++) {
      const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
      const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, pts.length);
      let avgX = 0, avgY = 0;
      const avgRangeLength = rangeEnd - rangeStart;
      for (let j = rangeStart; j < rangeEnd; j++) { avgX += pts[j].x; avgY += pts[j].y; }
      avgX /= avgRangeLength; avgY /= avgRangeLength;
      const ra = Math.floor(i * bucketSize) + 1;
      const rb = Math.floor((i + 1) * bucketSize) + 1;
      let maxArea = -1, nextA = ra;
      for (let j = ra; j < rb; j++) {
        const area = Math.abs(
          (pts[a].x - avgX) * (pts[j].y - pts[a].y) -
          (pts[a].x - pts[j].x) * (avgY - pts[a].y),
        );
        if (area > maxArea) { maxArea = area; nextA = j; }
      }
      sampled.push(pts[nextA]);
      a = nextA;
    }
    sampled.push(pts[pts.length - 1]);
    return sampled;
  };
  const smooth = downsample(points, 120);

  // Dotted grid + Y labels (4 ticks)
  ctx.fillStyle = "#94A3B8";
  ctx.font = `600 14px ${FONT_TEXT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = "rgba(15,23,42,0.10)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yVal = yMin + ((yMax - yMin) * i) / 4;
    const py = sy(yVal);
    ctx.beginPath();
    ctx.moveTo(plotX, py);
    ctx.lineTo(plotX + plotW, py);
    ctx.stroke();
    ctx.fillText(opts.yFmt(yVal), plotX - 14, py);
  }
  ctx.restore();

  // X labels
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#94A3B8";
  ctx.font = `600 14px ${FONT_TEXT}`;
  for (const t of [0, 0.5, 1]) {
    const xVal = xMin + (xMax - xMin) * t;
    ctx.fillText(opts.xFmt(xVal), sx(xVal), plotY + plotH + 14);
  }

  // ---------- Monotone-cubic spline path ----------
  const screenPts = smooth.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
  const buildSplinePath = (close: boolean) => {
    const n = screenPts.length;
    const dxs: number[] = [], slopes: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = screenPts[i + 1].x - screenPts[i].x;
      dxs.push(dx);
      slopes.push((screenPts[i + 1].y - screenPts[i].y) / (dx || 1));
    }
    const tangents: number[] = new Array(n);
    tangents[0] = slopes[0];
    tangents[n - 1] = slopes[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (slopes[i - 1] * slopes[i] <= 0) tangents[i] = 0;
      else {
        const w1 = 2 * dxs[i] + dxs[i - 1];
        const w2 = dxs[i] + 2 * dxs[i - 1];
        tangents[i] = (w1 + w2) / (w1 / slopes[i - 1] + w2 / slopes[i]);
      }
    }
    ctx.beginPath();
    if (close) ctx.moveTo(screenPts[0].x, plotY + plotH);
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    for (let i = 0; i < n - 1; i++) {
      const dx = dxs[i] / 3;
      const cp1x = screenPts[i].x + dx;
      const cp1y = screenPts[i].y + tangents[i] * dx;
      const cp2x = screenPts[i + 1].x - dx;
      const cp2y = screenPts[i + 1].y - tangents[i + 1] * dx;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, screenPts[i + 1].x, screenPts[i + 1].y);
    }
    if (close) {
      ctx.lineTo(screenPts[n - 1].x, plotY + plotH);
      ctx.lineTo(screenPts[0].x, plotY + plotH);
      ctx.closePath();
    }
  };

  // Area fill (gradient)
  buildSplinePath(true);
  const grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
  grad.addColorStop(0, opts.fillColor);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Soft glow under the line
  ctx.save();
  ctx.shadowColor = opts.color;
  ctx.shadowBlur = 18;
  buildSplinePath(false);
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = 4.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // Crisp top stroke (no glow) for definition
  buildSplinePath(false);
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  // End point dot
  const last = screenPts[screenPts.length - 1];
  ctx.beginPath();
  ctx.fillStyle = "#FFFFFF";
  ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = opts.color;
  ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawInstagramFooter(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  padX: number,
  isZh: boolean,
  iconImg: HTMLImageElement | null,
) {
  const footerH = 140;
  const footerY = H - footerH + 20;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(padX, footerY);
  ctx.lineTo(W - padX, footerY);
  ctx.stroke();

  if (iconImg) {
    ctx.save();
    roundedRect(ctx, padX, footerY + 30, 56, 56, 14);
    ctx.clip();
    ctx.drawImage(iconImg, padX, footerY + 30, 56, 56);
    ctx.restore();
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `800 30px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, padX + 76, footerY + 32);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 20px ${FONT_TEXT}`;
  ctx.fillText(isZh ? "用 AI 訓練得更聰明" : "Train smarter with AI", padX + 76, footerY + 66);

  // Instagram glyph + handle (right)
  const handle = "@runward.app";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 22px ${FONT_TEXT}`;
  const handleY = footerY + 58;
  const handleW = ctx.measureText(handle).width;
  ctx.fillText(handle, W - padX, handleY);
  const igSize = 36;
  const igX = W - padX - handleW - 16 - igSize;
  const igY = handleY - igSize / 2;
  ctx.save();
  ctx.strokeStyle = "#FFFFFF";
  ctx.fillStyle = "#FFFFFF";
  ctx.lineWidth = 2.5;
  roundedRect(ctx, igX, igY, igSize, igSize, 9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(igX + igSize / 2, igY + igSize / 2, igSize * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(igX + igSize - 8, igY + 8, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

async function renderChartsCard(input: ShareChartsInput): Promise<Blob> {
  const isZh = input.lang === "zh";
  const W = 1080;
  const headerH = 240;
  const chartH = 460;
  const chartGap = 28;
  const footerH = 96;
  const padX = 48;
  const innerPad = 40;
  const H = headerH + chartH * 2 + chartGap + footerH + 80;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Soft warm background (matches activity card)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#FFFFFF");
  bg.addColorStop(1, "#F4F1EC");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Outer card
  const cardX = padX;
  const cardY = padX;
  const cardW = W - padX * 2;
  const cardH = H - padX * 2;
  const cardR = 36;
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.10)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#FFFFFF";
  roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(15,23,42,0.06)";
  ctx.lineWidth = 1.5;
  roundedRect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, cardR);
  ctx.stroke();

  const innerX = cardX + innerPad;
  const innerW = cardW - innerPad * 2;

  // Header
  let iconImg: HTMLImageElement | null = null;
  const headerY = cardY + 36;
  try {
    iconImg = await loadImage(appIcon);
    ctx.save();
    roundedRect(ctx, innerX, headerY, 56, 56, 14);
    ctx.clip();
    ctx.drawImage(iconImg, innerX, headerY, 56, 56);
    ctx.restore();
  } catch { /* ignore */ }

  ctx.fillStyle = "#0F172A";
  ctx.textBaseline = "top";
  ctx.font = `700 28px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, innerX + 72, headerY + 4);
  ctx.fillStyle = "#64748B";
  ctx.font = `500 18px ${FONT_TEXT}`;
  ctx.fillText(isZh ? "AI 跑步教練" : "AI Running Coach", innerX + 72, headerY + 34);

  ctx.textAlign = "right";
  ctx.fillStyle = "#64748B";
  ctx.font = `600 20px ${FONT_TEXT}`;
  ctx.fillText(fmtDate(input.startDate, input.lang), innerX + innerW, headerY + 18);
  ctx.textAlign = "left";

  // Title
  const titleY = headerY + 96;
  ctx.fillStyle = "#0F172A";
  ctx.font = `800 44px ${FONT_DISPLAY}`;
  const titleEnd = wrapText(ctx, input.name, innerX, titleY, innerW, 50, 1);
  ctx.fillStyle = "#FC4C02";
  ctx.fillRect(innerX, titleEnd + 8, 56, 4);

  // Build series
  const pacePts = input.data
    .filter((d) => typeof d.pace === "number" && d.pace! > 0)
    .map((d) => ({ x: Number(d.distance_km), y: d.pace as number }));
  const hrPts = input.data
    .filter((d) => typeof d.heartrate === "number" && d.heartrate! > 0)
    .map((d) => ({ x: Number(d.distance_km), y: d.heartrate as number }));

  const xFmt = (v: number) => `${v.toFixed(1)} km`;

  drawChart(
    ctx,
    { x: innerX, y: headerH, w: innerW, h: chartH },
    pacePts,
    {
      title: isZh ? "配速" : "Pace",
      unit: isZh ? "分鐘 / 公里" : "min / km",
      color: "#FC4C02",
      fillColor: "rgba(252,76,2,0.25)",
      invertY: true,
      yFmt: fmtPaceMin,
      xFmt,
      isZh,
    },
  );

  drawChart(
    ctx,
    { x: innerX, y: headerH + chartH + chartGap, w: innerW, h: chartH },
    hrPts,
    {
      title: isZh ? "心率" : "Heart Rate",
      unit: "bpm",
      color: "#EF4444",
      fillColor: "rgba(239,68,68,0.25)",
      yFmt: (v) => String(Math.round(v)),
      xFmt,
      isZh,
    },
  );

  // Footer
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const footerY = cardY + cardH - 56;
  ctx.strokeStyle = "rgba(15,23,42,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(innerX, footerY - 16);
  ctx.lineTo(innerX + innerW, footerY - 16);
  ctx.stroke();

  ctx.fillStyle = "#0F172A";
  ctx.font = `700 22px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, innerX, footerY);
  drawIgHandle(ctx, innerX + innerW, footerY + 12, "#0F172A");
  ctx.textAlign = "left";

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/png",
      0.95,
    );
  });
}

export async function shareCharts(input: ShareChartsInput): Promise<void> {
  const isZh = input.lang === "zh";
  const loadingId = toast.loading(isZh ? "正在生成圖表..." : "Generating charts image...");
  let blob: Blob;
  try {
    blob = await renderChartsCard(input);
  } catch (err) {
    console.error("[ShareCharts] Render failed:", err);
    toast.dismiss(loadingId);
    toast.error(isZh ? "無法生成圖片" : "Failed to create image");
    return;
  }
  toast.dismiss(loadingId);
  await distributeBlob(blob, input.lang);
}

// ====================================================================
// Generic distribution helper (Despia / Web Share / download fallback)
// Used by AI poster generator and any other one-off image share.
// ====================================================================
export async function distributeImageBlob(
  blob: Blob,
  filename: string,
  lang: Lang,
): Promise<void> {
  const isZh = lang === "zh";

  if (hasNativeBridge()) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      despia(`savethisimage://?url=${dataUrl}`);
      toast.success(isZh ? "已儲存到相簿" : "Saved to camera roll");
      return;
    } catch (err) {
      console.warn("[Share] Despia save failed, falling back:", err);
    }
  }

  const file = new File([blob], filename, { type: blob.type || "image/png" });
  const navAny = navigator as any;
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navAny.canShare === "function" &&
    navAny.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: APP_NAME,
        text: isZh ? `由 ${APP_NAME} 追蹤 · ${APP_URL}` : `Tracked with ${APP_NAME} · ${APP_URL}`,
      });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.warn("[Share] navigator.share failed, falling back:", err);
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(isZh ? "圖片已下載" : "Image downloaded");
  } catch {
    toast.error(isZh ? "無法分享" : "Unable to share");
  }
}

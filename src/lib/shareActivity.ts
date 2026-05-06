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
  analysis?: string | null;
  nextWorkout?: string | null;
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

async function renderShareCard(input: ShareActivityInput): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const isZh = input.lang === "zh";

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Base background
  ctx.fillStyle = "#0B0F1A";
  ctx.fillRect(0, 0, W, H);

  // ---------- Hero photo (top ~58%) ----------
  const heroH = 1120;
  const heroSrc = pickHero(input.startDate + input.name);
  let hero: HTMLImageElement | null = null;
  try {
    hero = await loadImage(heroSrc);
    drawCover(ctx, hero, 0, 0, W, heroH);
  } catch {
    // Fallback gradient
    const g = ctx.createLinearGradient(0, 0, W, heroH);
    g.addColorStop(0, "#FC4C02");
    g.addColorStop(1, "#0B0F1A");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, heroH);
  }

  // Dark vignette over photo for legibility
  const vignette = ctx.createLinearGradient(0, 0, 0, heroH);
  vignette.addColorStop(0, "rgba(0,0,0,0.55)");
  vignette.addColorStop(0.45, "rgba(0,0,0,0.15)");
  vignette.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, heroH);

  // ---------- Header (logo + brand) ----------
  try {
    const icon = await loadImage(appIcon);
    // Rounded mask for icon
    ctx.save();
    roundedRect(ctx, 70, 70, 80, 80, 18);
    ctx.clip();
    ctx.drawImage(icon, 70, 70, 80, 80);
    ctx.restore();
  } catch {
    // ignore
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";
  ctx.font = `700 42px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, 170, 80);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `500 24px ${FONT_TEXT}`;
  ctx.fillText(isZh ? "AI 跑步教練" : "AI Running Coach", 170, 130);

  // Date pill (top-right)
  const dateText = fmtDate(input.startDate, input.lang);
  ctx.font = `600 24px ${FONT_TEXT}`;
  const dateW = ctx.measureText(dateText).width;
  const pillW = dateW + 48;
  const pillX = W - 70 - pillW;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundedRect(ctx, pillX, 80, pillW, 56, 28);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(dateText, pillX + 24, 96);

  // ---------- Activity title (over photo, lower-left) ----------
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 72px ${FONT_DISPLAY}`;
  ctx.textBaseline = "alphabetic";
  // Add subtle shadow for legibility
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 4;
  // Manual wrap, max 2 lines
  const titleY = heroH - 280;
  ctx.textBaseline = "top";
  wrapText(ctx, input.name, 70, titleY, W - 140, 80, 2);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // ---------- Stat row (Distance / Pace / Time) over photo ----------
  const stats = [
    {
      label: isZh ? "距離" : "Distance",
      value: `${fmtDistance(input.distanceMeters)} ${isZh ? "公里" : "km"}`,
    },
    { label: isZh ? "配速" : "Pace", value: fmtPace(input.averageSpeed, isZh) },
    { label: isZh ? "時間" : "Time", value: fmtTimeShort(input.movingTimeSeconds, isZh) },
  ];

  const statsY = heroH - 140;
  const colW = (W - 140) / stats.length;

  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 18;
  stats.forEach((s, i) => {
    const cx = 70 + colW * i;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `600 28px ${FONT_TEXT}`;
    ctx.fillText(s.label, cx, statsY);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 56px ${FONT_DISPLAY}`;
    ctx.fillText(s.value, cx, statsY + 44);
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // ---------- Notepad card (AI analysis) ----------
  const padX = 60;
  const padY = heroH + 40;
  const padW = W - 120;
  const padH = H - padY - 200;
  const padR = 28;

  // Paper shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#FAF7EE";
  roundedRect(ctx, padX, padY, padW, padH, padR);
  ctx.fill();
  ctx.restore();

  // Tape strip (top-left)
  ctx.save();
  ctx.translate(padX + 80, padY - 18);
  ctx.rotate(-0.08);
  ctx.fillStyle = "rgba(252, 76, 2, 0.55)";
  ctx.fillRect(-60, -16, 200, 36);
  ctx.restore();

  // Red margin line + ruled lines (notepad feel)
  ctx.strokeStyle = "rgba(220, 38, 38, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX + 90, padY + 30);
  ctx.lineTo(padX + 90, padY + padH - 30);
  ctx.stroke();

  ctx.strokeStyle = "rgba(30, 41, 59, 0.10)";
  ctx.lineWidth = 1.5;
  const lineGap = 50;
  const linesStart = padY + 150;
  for (let ly = linesStart; ly < padY + padH - 40; ly += lineGap) {
    ctx.beginPath();
    ctx.moveTo(padX + 110, ly);
    ctx.lineTo(padX + padW - 50, ly);
    ctx.stroke();
  }

  // Notepad header
  ctx.fillStyle = "#0F172A";
  ctx.textBaseline = "top";
  ctx.font = `700 40px ${FONT_DISPLAY}`;
  ctx.fillText(isZh ? "教練筆記" : "Coach's Notes", padX + 110, padY + 50);

  // Underline accent
  ctx.fillStyle = "#FC4C02";
  ctx.fillRect(padX + 110, padY + 100, 80, 5);

  // Body content
  const bodyX = padX + 110;
  let bodyY = linesStart - 38; // sit text on the ruled lines
  const bodyMaxY = padY + padH - 60;
  const bodyMaxW = padW - 160;
  const bodyLineH = lineGap;

  ctx.fillStyle = "#1E293B";
  ctx.font = `400 30px ${FONT_HAND}`;

  const sections: string[] = [];
  if (input.analysis) {
    sections.push(stripMarkdown(input.analysis));
  }
  if (input.nextWorkout) {
    sections.push(
      (isZh ? "下一步: " : "Next up: ") + stripMarkdown(input.nextWorkout),
    );
  }
  if (sections.length === 0) {
    sections.push(
      isZh ? "繼續加油！每一步都算數。" : "Keep it up! Every step counts.",
    );
  }

  for (const section of sections) {
    const remaining = bodyMaxY - bodyY;
    if (remaining < bodyLineH) break;
    const maxLines = Math.floor(remaining / bodyLineH);
    bodyY = wrapText(ctx, section, bodyX, bodyY, bodyMaxW, bodyLineH, maxLines);
    bodyY += bodyLineH * 0.4; // small gap between sections
  }

  // ---------- Footer ----------
  const footerY = H - 130;

  // Brand row
  try {
    const icon = await loadImage(appIcon);
    ctx.save();
    roundedRect(ctx, 70, footerY, 64, 64, 14);
    ctx.clip();
    ctx.drawImage(icon, 70, footerY, 64, 64);
    ctx.restore();
  } catch {
    // ignore
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";
  ctx.font = `800 36px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, 150, footerY + 4);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `500 22px ${FONT_TEXT}`;
  ctx.fillText(isZh ? "用 AI 訓練得更聰明" : "Train smarter with AI", 150, footerY + 44);

  // URL right-aligned
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 26px ${FONT_TEXT}`;
  ctx.fillText(APP_URL.replace("https://", ""), W - 70, footerY + 18);
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

  // Filter GPS-noise laps + detect intervals (mirrors ActivityDetail logic)
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

  const W = 1080;
  const headerH = 240;
  const rowH = 72;
  const tableHeaderH = 70;
  const footerH = 140;
  const padX = 60;
  const tablePadTop = 30;
  const H = headerH + tableHeaderH + visible.length * rowH + tablePadTop + footerH + 40;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background — clean, no photo
  ctx.fillStyle = "#0B0F1A";
  ctx.fillRect(0, 0, W, H);
  // Subtle gradient accent at top
  const g = ctx.createLinearGradient(0, 0, 0, headerH);
  g.addColorStop(0, "rgba(252, 76, 2, 0.20)");
  g.addColorStop(1, "rgba(252, 76, 2, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, headerH);

  // ---------- Header (logo + brand + title) ----------
  try {
    const icon = await loadImage(appIcon);
    ctx.save();
    roundedRect(ctx, padX, 60, 80, 80, 18);
    ctx.clip();
    ctx.drawImage(icon, padX, 60, 80, 80);
    ctx.restore();
  } catch { /* ignore */ }

  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";
  ctx.font = `700 42px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, padX + 100, 70);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `500 24px ${FONT_TEXT}`;
  ctx.fillText(fmtDate(input.startDate, input.lang), padX + 100, 120);

  // Title
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 52px ${FONT_DISPLAY}`;
  wrapText(ctx, input.name, padX, 170, W - padX * 2, 56, 1);

  // ---------- Table header ----------
  const tableY = headerH;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, tableY, W, tableHeaderH);

  // Column layout — right-aligned numeric columns with generous spacing
  // so HR is never clipped or overlapped.
  // # | Type | ... Time | Dist | Pace | HR (each numeric col 170px apart)
  const HR_RIGHT = W - padX;            // 1020
  const PACE_RIGHT = HR_RIGHT - 170;    // 850
  const DIST_RIGHT = PACE_RIGHT - 170;  // 680
  const TIME_RIGHT = DIST_RIGHT - 170;  // 510
  const NUM_LEFT = padX;                // 60
  const TYPE_LEFT = padX + 80;          // 140

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `700 22px ${FONT_TEXT}`;
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

  // ---------- Rows ----------
  let runNum = 0;
  visible.forEach((s, idx) => {
    const y = tableY + tableHeaderH + tablePadTop + idx * rowH;
    const isRest =
      isInterval && fastestSpeed > 0 && s.average_speed > 0 && s.average_speed < fastestSpeed * 0.7;
    if (!isRest) runNum++;

    if (isRest) {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(0, y, W, rowH);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, y + rowH);
    ctx.lineTo(W - padX, y + rowH);
    ctx.stroke();

    const mid = y + rowH / 2;
    const baseColor = isRest ? "rgba(255,255,255,0.45)" : "#FFFFFF";
    const accentWeight = isRest ? "500" : "700";

    if (!isRest) {
      ctx.fillStyle = "#FC4C02";
      ctx.beginPath();
      ctx.arc(NUM_LEFT + 14, mid, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = baseColor;
    ctx.font = `700 26px ${FONT_TEXT}`;
    ctx.textAlign = "left";
    ctx.fillText(isRest ? "" : String(runNum), NUM_LEFT + 28, mid);

    ctx.font = `${accentWeight} 26px ${FONT_TEXT}`;
    ctx.fillStyle = baseColor;
    ctx.fillText(
      isRest ? (isZh ? "休息" : "Rest") : (isZh ? "跑步" : "Run"),
      TYPE_LEFT,
      mid,
    );

    ctx.textAlign = "right";
    ctx.font = `${accentWeight} 26px ${FONT_TEXT}`;
    ctx.fillText(fmtTimeShort(s.elapsed_time, false).replace(/\s/g, ""), TIME_RIGHT, mid);
    ctx.fillText(String(Math.round(s.distance || 0)), DIST_RIGHT, mid);
    ctx.fillText(
      s.average_speed > 0
        ? (() => {
            const p = 1000 / s.average_speed;
            const m = Math.floor(p / 60);
            const sec = Math.floor(p % 60);
            return `${m}:${String(sec).padStart(2, "0")}`;
          })()
        : "--",
      PACE_RIGHT,
      mid,
    );
    ctx.fillText(s.average_heartrate ? String(Math.round(s.average_heartrate)) : "--", HR_RIGHT, mid);
  });

  // ---------- Footer ----------
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const footerY = H - footerH + 20;

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(padX, footerY);
  ctx.lineTo(W - padX, footerY);
  ctx.stroke();

  try {
    const icon = await loadImage(appIcon);
    ctx.save();
    roundedRect(ctx, padX, footerY + 30, 56, 56, 14);
    ctx.clip();
    ctx.drawImage(icon, padX, footerY + 30, 56, 56);
    ctx.restore();
  } catch { /* ignore */ }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 30px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, padX + 76, footerY + 32);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 20px ${FONT_TEXT}`;
  ctx.fillText(isZh ? "用 AI 訓練得更聰明" : "Train smarter with AI", padX + 76, footerY + 66);

  // Instagram handle (right side): IG glyph + @runward.app
  const handle = "@runward.app";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 22px ${FONT_TEXT}`;
  const handleY = footerY + 58;
  const handleW = ctx.measureText(handle).width;
  ctx.fillText(handle, W - padX, handleY);

  // Draw IG glyph just left of the handle
  const igSize = 36;
  const igX = W - padX - handleW - 16 - igSize;
  const igY = handleY - igSize / 2;
  ctx.save();
  ctx.strokeStyle = "#FFFFFF";
  ctx.fillStyle = "#FFFFFF";
  ctx.lineWidth = 2.5;
  // Rounded square
  roundedRect(ctx, igX, igY, igSize, igSize, 9);
  ctx.stroke();
  // Lens circle
  ctx.beginPath();
  ctx.arc(igX + igSize / 2, igY + igSize / 2, igSize * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  // Top-right dot
  ctx.beginPath();
  ctx.arc(igX + igSize - 8, igY + 8, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

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

  // Card background
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundedRect(ctx, x, y, w, h, 20);
  ctx.fill();

  // Title
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `700 30px ${FONT_DISPLAY}`;
  ctx.fillText(opts.title, x + 28, y + 22);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 18px ${FONT_TEXT}`;
  ctx.fillText(opts.unit, x + 28, y + 60);

  // Plot area
  const padL = 90, padR = 36, padT = 100, padB = 56;
  const plotX = x + padL;
  const plotY = y + padT;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  if (points.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
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

  // Grid + Y labels (4 ticks)
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `500 16px ${FONT_TEXT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const yVal = yMin + ((yMax - yMin) * i) / 4;
    const py = sy(yVal);
    ctx.beginPath();
    ctx.moveTo(plotX, py);
    ctx.lineTo(plotX + plotW, py);
    ctx.stroke();
    ctx.fillText(opts.yFmt(yVal), plotX - 12, py);
  }

  // X labels (start, mid, end)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (const t of [0, 0.5, 1]) {
    const xVal = xMin + (xMax - xMin) * t;
    ctx.fillText(opts.xFmt(xVal), sx(xVal), plotY + plotH + 14);
  }

  // Area fill under curve
  ctx.beginPath();
  ctx.moveTo(sx(points[0].x), plotY + plotH);
  for (const p of points) ctx.lineTo(sx(p.x), sy(p.y));
  ctx.lineTo(sx(points[points.length - 1].x), plotY + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
  grad.addColorStop(0, opts.fillColor);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 0; i < points.length; i++) {
    const px = sx(points[i].x);
    const py = sy(points[i].y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
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
  const chartH = 520;
  const chartGap = 32;
  const footerH = 140;
  const padX = 60;
  const H = headerH + chartH * 2 + chartGap + footerH + 40;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#0B0F1A";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, headerH);
  g.addColorStop(0, "rgba(252, 76, 2, 0.20)");
  g.addColorStop(1, "rgba(252, 76, 2, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, headerH);

  // Header
  let iconImg: HTMLImageElement | null = null;
  try {
    iconImg = await loadImage(appIcon);
    ctx.save();
    roundedRect(ctx, padX, 60, 80, 80, 18);
    ctx.clip();
    ctx.drawImage(iconImg, padX, 60, 80, 80);
    ctx.restore();
  } catch { /* ignore */ }

  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";
  ctx.font = `700 42px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, padX + 100, 70);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `500 24px ${FONT_TEXT}`;
  ctx.fillText(fmtDate(input.startDate, input.lang), padX + 100, 120);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 52px ${FONT_DISPLAY}`;
  wrapText(ctx, input.name, padX, 170, W - padX * 2, 56, 1);

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
    { x: padX, y: headerH, w: W - padX * 2, h: chartH },
    pacePts,
    {
      title: isZh ? "配速" : "Pace",
      unit: isZh ? "分鐘 / 公里" : "min / km",
      color: "#FC4C02",
      fillColor: "rgba(252,76,2,0.35)",
      invertY: true, // faster pace at top
      yFmt: fmtPaceMin,
      xFmt,
      isZh,
    },
  );

  drawChart(
    ctx,
    { x: padX, y: headerH + chartH + chartGap, w: W - padX * 2, h: chartH },
    hrPts,
    {
      title: isZh ? "心率" : "Heart Rate",
      unit: "bpm",
      color: "#EF4444",
      fillColor: "rgba(239,68,68,0.35)",
      yFmt: (v) => String(Math.round(v)),
      xFmt,
      isZh,
    },
  );

  drawInstagramFooter(ctx, W, H, padX, isZh, iconImg);

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

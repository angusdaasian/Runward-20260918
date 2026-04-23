/**
 * Share an activity as a generated image card.
 *
 * Renders a polished summary card on a <canvas>, then:
 *  1. On native (Despia) → saves to camera roll via `savethisimage://`
 *  2. On Web Share API capable browsers → shares the PNG as a File
 *  3. Otherwise → triggers a download of the PNG
 *
 * Always includes Runward branding for marketing purposes.
 */
import despia from "despia-native";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";

const APP_NAME = "Runward";
const APP_URL = "https://runward.app";

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

// ---------------- formatting helpers ----------------

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtPace(avgSpeed: number, isZh: boolean): string {
  if (!avgSpeed || avgSpeed <= 0) return "--";
  const paceSec = 1000 / avgSpeed;
  const min = Math.floor(paceSec / 60);
  const sec = Math.floor(paceSec % 60);
  return `${min}:${String(sec).padStart(2, "0")}${isZh ? "/公里" : "/km"}`;
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

// ---------------- canvas rendering ----------------

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
    // Char-by-char wrap so it works for both CJK and Latin text.
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
    const last = lines[maxLines - 1];
    // Trim last line to fit ellipsis
    let trimmed = last;
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

async function renderShareCard(input: ShareActivityInput): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const isZh = input.lang === "zh";

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background gradient (Runward orange → deep navy)
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#FC4C02");
  bg.addColorStop(0.55, "#7A1F00");
  bg.addColorStop(1, "#0B0F1A");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft radial highlight
  const glow = ctx.createRadialGradient(W * 0.2, H * 0.15, 50, W * 0.2, H * 0.15, 900);
  glow.addColorStop(0, "rgba(255,255,255,0.25)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ---------- Header ----------
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "700 56px -apple-system, 'SF Pro Display', 'PingFang TC', 'Segoe UI', system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(APP_NAME, 80, 90);

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "400 32px -apple-system, 'SF Pro Text', 'PingFang TC', 'Segoe UI', sans-serif";
  ctx.fillText(fmtDate(input.startDate, input.lang), 80, 165);

  // ---------- Activity name ----------
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 76px -apple-system, 'SF Pro Display', 'PingFang TC', 'Segoe UI', sans-serif";
  let y = wrapText(ctx, input.name, 80, 280, W - 160, 86, 2);

  // ---------- Stats card ----------
  const cardX = 60;
  const cardY = y + 60;
  const cardW = W - 120;
  const cardH = 360;
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  roundedRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const km = (input.distanceMeters / 1000).toFixed(2);
  const stats: Array<{ label: string; value: string }> = [
    { label: isZh ? "距離" : "DISTANCE", value: `${km} ${isZh ? "公里" : "km"}` },
    { label: isZh ? "時間" : "TIME", value: fmtDuration(input.movingTimeSeconds) },
    { label: isZh ? "配速" : "PACE", value: fmtPace(input.averageSpeed, isZh) },
  ];

  const colW = cardW / stats.length;
  stats.forEach((s, i) => {
    const cx = cardX + colW * i + colW / 2;
    ctx.textAlign = "center";

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "600 26px -apple-system, 'SF Pro Text', 'PingFang TC', sans-serif";
    ctx.fillText(s.label, cx, cardY + 70);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 78px -apple-system, 'SF Pro Display', 'PingFang TC', sans-serif";
    ctx.fillText(s.value, cx, cardY + 130);

    // divider
    if (i < stats.length - 1) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(cardX + colW * (i + 1) - 1, cardY + 60, 2, cardH - 120);
    }
  });
  ctx.textAlign = "left";

  // ---------- AI analysis section ----------
  let bodyY = cardY + cardH + 70;
  const bodyMaxY = H - 220;

  if (input.analysis) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 36px -apple-system, 'SF Pro Display', 'PingFang TC', sans-serif";
    ctx.fillText(isZh ? "🤖 AI 分析" : "🤖 AI Analysis", 80, bodyY);
    bodyY += 60;

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "400 32px -apple-system, 'SF Pro Text', 'PingFang TC', sans-serif";
    const cleaned = stripMarkdown(input.analysis);
    const remaining = bodyMaxY - bodyY;
    const maxLines = Math.max(0, Math.floor(remaining / 44) - (input.nextWorkout ? 4 : 0));
    bodyY = wrapText(ctx, cleaned, 80, bodyY, W - 160, 44, maxLines);
    bodyY += 40;
  }

  if (input.nextWorkout && bodyY < bodyMaxY - 100) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 36px -apple-system, 'SF Pro Display', 'PingFang TC', sans-serif";
    ctx.fillText(isZh ? "🎯 下一步" : "🎯 Next Up", 80, bodyY);
    bodyY += 60;

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "400 32px -apple-system, 'SF Pro Text', 'PingFang TC', sans-serif";
    const cleaned = stripMarkdown(input.nextWorkout);
    const remaining = bodyMaxY - bodyY;
    const maxLines = Math.max(0, Math.floor(remaining / 44));
    bodyY = wrapText(ctx, cleaned, 80, bodyY, W - 160, 44, maxLines);
  }

  // ---------- Footer ----------
  // Footer divider
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(80, H - 170, W - 160, 2);

  // Footer brand row
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 44px -apple-system, 'SF Pro Display', 'PingFang TC', sans-serif";
  ctx.fillText(APP_NAME, 80, H - 130);

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "500 30px -apple-system, 'SF Pro Text', 'PingFang TC', sans-serif";
  ctx.fillText(isZh ? "AI 跑步教練" : "AI Running Coach", 80, H - 75);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 32px -apple-system, 'SF Pro Text', 'PingFang TC', sans-serif";
  ctx.fillText(APP_URL.replace("https://", ""), W - 80, H - 95);
  ctx.textAlign = "left";

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/png",
      0.95,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Detect whether the Despia native bridge is available. */
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

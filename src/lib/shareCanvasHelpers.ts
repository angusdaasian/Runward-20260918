/**
 * Shared canvas helpers for "share as image" cards.
 * White-card style aligned with shareActivity.ts.
 */
import { Lang } from "@/lib/i18n";
import appIcon from "@/assets/app-icon.png";
import { drawIgHandle } from "@/lib/shareActivity";

export const APP_NAME = "Runward";
export const FONT_DISPLAY =
  "-apple-system, 'SF Pro Display', 'PingFang TC', 'Helvetica Neue', system-ui, sans-serif";
export const FONT_TEXT =
  "-apple-system, 'SF Pro Text', 'PingFang TC', 'Helvetica Neue', system-ui, sans-serif";

export function fmtDistanceKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

export function fmtTimeShort(seconds: number, isZh: boolean): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return isZh ? `${h}時 ${m}分` : `${h}h ${m}m`;
  return isZh ? `${m}分 ${s}秒` : `${m}m ${s}s`;
}

export function fmtPace(avgSpeed: number, isZh: boolean): string {
  if (!avgSpeed || avgSpeed <= 0) return "--";
  const paceSec = 1000 / avgSpeed;
  const min = Math.floor(paceSec / 60);
  const sec = Math.floor(paceSec % 60);
  return `${min}:${String(sec).padStart(2, "0")} ${isZh ? "/公里" : "/km"}`;
}

export function fmtDate(iso: string, lang: Lang, withTime = false): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  } catch {
    return iso;
  }
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Wrap text to fit a max width. Returns line array.
 * Handles CJK by breaking per-character when no spaces are present.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\n/);
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    const hasSpaces = /\s/.test(para);
    if (hasSpaces) {
      const words = para.split(/\s+/);
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width <= maxWidth) {
          line = test;
        } else {
          if (line) lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
    } else {
      // CJK: per-character
      let line = "";
      for (const ch of para) {
        const test = line + ch;
        if (ctx.measureText(test).width <= maxWidth) line = test;
        else {
          if (line) lines.push(line);
          line = ch;
        }
      }
      if (line) lines.push(line);
    }
  }
  return lines;
}

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = Infinity,
): number {
  const lines = wrapText(ctx, text, maxWidth);
  const limited = lines.length > maxLines ? [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ").slice(0, 60) + "…"] : lines;
  let cy = y;
  for (const ln of limited) {
    ctx.fillText(ln, x, cy);
    cy += lineHeight;
  }
  return cy;
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawBrandFooter(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  lang: Lang,
) {
  const isZh = lang === "zh";
  const footerY = canvasHeight - 80;
  try {
    const icon = await loadImage(appIcon);
    ctx.drawImage(icon, 60, footerY - 18, 44, 44);
  } catch {
    /* ignore */
  }
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(APP_NAME, 116, footerY + 4);
  ctx.fillStyle = "#64748b";
  ctx.font = "20px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(isZh ? `由 ${APP_NAME} 製作 · ${APP_URL}` : `Made with ${APP_NAME} · ${APP_URL}`, canvasWidth - 60, footerY + 4);
  ctx.textAlign = "left";
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality);
  });
}

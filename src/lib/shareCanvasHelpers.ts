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

  const pushChars = (token: string, startLine: string): string => {
    let line = startLine;
    for (const ch of token) {
      const test = line + ch;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = ch;
      }
    }
    return line;
  };

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
          // word doesn't fit on current line
          if (ctx.measureText(w).width <= maxWidth) {
            if (line) lines.push(line);
            line = w;
          } else {
            // word itself too long — break per character (handles CJK mixed in)
            if (line) {
              lines.push(line);
              line = "";
            }
            line = pushChars(w, "");
          }
        }
      }
      if (line) lines.push(line);
    } else {
      // pure CJK / no-space text
      const last = pushChars(para, "");
      if (last) lines.push(last);
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
  _lang: Lang,
  opts?: { cardX?: number; cardW?: number },
) {
  const cardX = opts?.cardX ?? 48;
  const cardW = opts?.cardW ?? canvasWidth - 96;
  const footerY = canvasHeight - 110;

  ctx.strokeStyle = "rgba(15,23,42,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 44, footerY - 16);
  ctx.lineTo(cardX + cardW - 44, footerY - 16);
  ctx.stroke();

  try {
    const icon = await loadImage(appIcon);
    ctx.save();
    roundedRect(ctx, cardX + 44, footerY - 6, 36, 36, 8);
    ctx.clip();
    ctx.drawImage(icon, cardX + 44, footerY - 6, 36, 36);
    ctx.restore();
  } catch {
    /* ignore */
  }

  ctx.fillStyle = "#0F172A";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = `700 22px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, cardX + 92, footerY);

  drawIgHandle(ctx, cardX + cardW - 44, footerY + 12, "#0F172A");
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export async function drawWhiteCardBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
): Promise<{ cardX: number; cardY: number; cardW: number; cardH: number; pad: number }> {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#FFFFFF");
  bg.addColorStop(1, "#F4F1EC");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const M = 48;
  const cardX = M, cardY = M, cardW = W - M * 2, cardH = H - M * 2, cardR = 40;

  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.10)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#FFFFFF";
  roundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(15,23,42,0.06)";
  ctx.lineWidth = 1.5;
  roundedRect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, cardR);
  ctx.stroke();

  return { cardX, cardY, cardW, cardH, pad: 44 };
}

export async function drawCardHeader(
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  subtitle: string,
  rightText?: string,
): Promise<number> {
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
  ctx.textAlign = "left";
  ctx.font = `700 28px ${FONT_DISPLAY}`;
  ctx.fillText(APP_NAME, cardX + 116, headerY + 4);
  ctx.fillStyle = "#64748B";
  ctx.font = `500 18px ${FONT_TEXT}`;
  ctx.fillText(subtitle, cardX + 116, headerY + 34);
  if (rightText) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748B";
    ctx.font = `600 20px ${FONT_TEXT}`;
    ctx.fillText(rightText, cardX + cardW - 44, headerY + 18);
    ctx.textAlign = "left";
  }
  return headerY + 80;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality);
  });
}

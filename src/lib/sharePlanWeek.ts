/**
 * Share a week of an AI/custom training plan as a portrait PNG.
 * Mon → Sun ordering, with workout details for each day.
 */
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";
import { distributeImageBlob } from "@/lib/shareActivity";
import {
  drawBrandFooter,
  canvasToBlob,
  roundedRect,
  wrapText,
} from "@/lib/shareCanvasHelpers";

export interface SharePlanDay {
  day: string;        // "Mon", "Tue"...
  date: string;       // ISO yyyy-mm-dd
  type: string;
  title: string;
  description: string;
  distance_km: number | null;
  pace: string | null;
  color: string;
}

export interface SharePlanWeekInput {
  weekIndex: number;       // 0-based
  days: SharePlanDay[];
  lang: Lang;
  raceName?: string | null;
}

const TYPE_LABELS_ZH: Record<string, string> = {
  "Easy Run": "輕鬆跑", "Easy": "輕鬆跑",
  "Tempo Run": "節奏跑", "Tempo": "節奏跑",
  "Interval": "間歇跑",
  "Long Run": "長課", "Long": "長課",
  "Recovery Run": "恢復跑", "Recovery": "恢復跑",
  "Rest": "休息",
  "Cross Training": "交叉訓練",
  "Race Pace": "比賽配速",
  "Race": "比賽",
  "Progression Run": "漸進跑", "Progression": "漸進跑",
};

const DAY_LABELS: Record<string, { en: string; zh: string }> = {
  Mon: { en: "Mon", zh: "週一" },
  Tue: { en: "Tue", zh: "週二" },
  Wed: { en: "Wed", zh: "週三" },
  Thu: { en: "Thu", zh: "週四" },
  Fri: { en: "Fri", zh: "週五" },
  Sat: { en: "Sat", zh: "週六" },
  Sun: { en: "Sun", zh: "週日" },
};

const ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localizeType(type: string, lang: Lang): string {
  if (lang === "zh") return TYPE_LABELS_ZH[type] || type;
  return type;
}

function localizeDate(iso: string, lang: Lang): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export async function shareTrainingWeek(input: SharePlanWeekInput): Promise<void> {
  const { weekIndex, days, lang } = input;
  const isZh = lang === "zh";

  try {
    // Sort Mon → Sun
    const sorted = [...days].sort(
      (a, b) => ORDER.indexOf(a.day) - ORDER.indexOf(b.day),
    );

    const dates = sorted.map((d) => d.date).filter(Boolean).sort();
    const weekStart = dates[0] ?? "";
    const weekEnd = dates[dates.length - 1] ?? "";

    const W = 1080;
    const ROW_H = 200;
    const HEADER_H = 260;
    const FOOTER_H = 140;
    const H = HEADER_H + ROW_H * 7 + FOOTER_H;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#1e293b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.font = "600 36px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(isZh ? "訓練計劃" : "Training Plan", 60, 60);

    ctx.font = "bold 72px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(
      isZh ? `第 ${weekIndex + 1} 週` : `Week ${weekIndex + 1}`,
      60,
      108,
    );

    ctx.fillStyle = "#94a3b8";
    ctx.font = "26px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    if (weekStart && weekEnd) {
      ctx.fillText(`${localizeDate(weekStart, lang)} → ${localizeDate(weekEnd, lang)}`, 60, 200);
    }

    // Day rows
    const rowsTopY = HEADER_H;
    for (let i = 0; i < ORDER.length; i++) {
      const dayName = ORDER[i];
      const day = sorted.find((d) => d.day === dayName);
      const y = rowsTopY + i * ROW_H;

      // Card
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundedRect(ctx, 40, y + 12, W - 80, ROW_H - 24, 24);
      ctx.fill();

      // Left color chip
      const chipColor = day?.color || "#475569";
      ctx.fillStyle = chipColor;
      roundedRect(ctx, 60, y + 36, 12, ROW_H - 72, 6);
      ctx.fill();

      // Day name + date
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(DAY_LABELS[dayName][isZh ? "zh" : "en"], 100, y + 36);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.fillText(day?.date ? localizeDate(day.date, lang) : "—", 100, y + 76);

      // Right: title + meta + desc
      const tx = 240;
      const innerW = W - 80 - tx - 40;

      if (!day || day.type === "Rest" || !day.title) {
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
        ctx.fillText(isZh ? "休息日" : "Rest Day", tx, y + 50);
        ctx.fillStyle = "#64748b";
        ctx.font = "22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
        ctx.fillText(isZh ? "好好恢復" : "Recover well", tx, y + 100);
        continue;
      }

      // Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      const titleLines = wrapText(ctx, day.title, innerW);
      ctx.fillText(titleLines[0] ?? "", tx, y + 36);

      // Meta line
      const metaParts: string[] = [];
      metaParts.push(localizeType(day.type, lang));
      if (day.distance_km) metaParts.push(`${day.distance_km} km`);
      if (day.pace) metaParts.push(day.pace);
      ctx.fillStyle = chipColor;
      ctx.font = "600 22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.fillText(metaParts.join(" · "), tx, y + 80);

      // Description (max 2 lines)
      if (day.description) {
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
        const descLines = wrapText(ctx, day.description, innerW).slice(0, 2);
        let cy = y + 120;
        for (const ln of descLines) {
          ctx.fillText(ln, tx, cy);
          cy += 30;
        }
      }
    }

    // Footer
    await drawBrandFooter(ctx, W, H, lang);

    const blob = await canvasToBlob(canvas);
    await distributeImageBlob(blob, `runward-week-${weekIndex + 1}.png`, lang);
  } catch (err) {
    console.error("[shareTrainingWeek]", err);
    toast.error(isZh ? "無法生成圖片" : "Unable to generate image");
  }
}

/**
 * Share a week of an AI/custom training plan as a portrait PNG (white card style).
 * Mon → Sun ordering.
 */
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";
import { distributeImageBlob } from "@/lib/shareActivity";
import {
  drawBrandFooter,
  drawWhiteCardBackground,
  drawCardHeader,
  canvasToBlob,
  roundedRect,
  wrapText,
  FONT_DISPLAY,
  FONT_TEXT,
} from "@/lib/shareCanvasHelpers";

export interface SharePlanDay {
  day: string;
  date: string;
  type: string;
  title: string;
  description: string;
  distance_km: number | null;
  pace: string | null;
  color: string;
}

export interface SharePlanWeekInput {
  weekIndex: number;
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
  "Trail Run": "越野跑", "Trail Race": "越野賽",
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
  } catch { return iso; }
}

export async function shareTrainingWeek(input: SharePlanWeekInput): Promise<void> {
  const { weekIndex, days, lang } = input;
  const isZh = lang === "zh";

  try {
    const sorted = [...days].sort((a, b) => ORDER.indexOf(a.day) - ORDER.indexOf(b.day));
    const dates = sorted.map((d) => d.date).filter(Boolean).sort();
    const weekStart = dates[0] ?? "";
    const weekEnd = dates[dates.length - 1] ?? "";

    const W = 1080;
    const ROW_H = 168;
    const HEADER_H = 220;
    const FOOTER_H = 180;
    const H = HEADER_H + ROW_H * 7 + FOOTER_H;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");

    const { cardX, cardY, cardW } = await drawWhiteCardBackground(ctx, W, H);
    const afterHeader = await drawCardHeader(
      ctx,
      cardX,
      cardY,
      cardW,
      isZh ? "訓練計劃" : "Training Plan",
      weekStart && weekEnd ? `${localizeDate(weekStart, lang)} → ${localizeDate(weekEnd, lang)}` : undefined,
    );

    // Week title
    ctx.fillStyle = "#0F172A";
    ctx.textBaseline = "top";
    ctx.font = `800 56px ${FONT_DISPLAY}`;
    ctx.fillText(isZh ? `第 ${weekIndex + 1} 週` : `Week ${weekIndex + 1}`, cardX + 44, afterHeader + 12);
    ctx.fillStyle = "#FC4C02";
    ctx.fillRect(cardX + 44, afterHeader + 80, 64, 5);

    // Rows
    const rowsTopY = HEADER_H + 20;
    const rowX = cardX + 44;
    const rowW = cardW - 88;
    for (let i = 0; i < ORDER.length; i++) {
      const dayName = ORDER[i];
      const day = sorted.find((d) => d.day === dayName);
      const y = rowsTopY + i * ROW_H;

      ctx.fillStyle = "rgba(15,23,42,0.03)";
      roundedRect(ctx, rowX, y + 8, rowW, ROW_H - 20, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(15,23,42,0.06)";
      ctx.lineWidth = 1;
      roundedRect(ctx, rowX, y + 8, rowW, ROW_H - 20, 18);
      ctx.stroke();

      // chip
      const chipColor = day?.color || "#94A3B8";
      ctx.fillStyle = chipColor;
      roundedRect(ctx, rowX + 16, y + 28, 8, ROW_H - 60, 4);
      ctx.fill();

      // Day + date
      ctx.fillStyle = "#0F172A";
      ctx.font = `700 26px ${FONT_DISPLAY}`;
      ctx.textBaseline = "top";
      ctx.fillText(DAY_LABELS[dayName][isZh ? "zh" : "en"], rowX + 40, y + 28);
      ctx.fillStyle = "#64748B";
      ctx.font = `500 18px ${FONT_TEXT}`;
      ctx.fillText(day?.date ? localizeDate(day.date, lang) : "—", rowX + 40, y + 62);

      const tx = rowX + 180;
      const innerW = rowW - 180 - 24;

      if (!day || day.type === "Rest" || !day.title) {
        ctx.fillStyle = "#475569";
        ctx.font = `700 28px ${FONT_DISPLAY}`;
        ctx.fillText(isZh ? "休息日" : "Rest Day", tx, y + 40);
        ctx.fillStyle = "#94A3B8";
        ctx.font = `500 20px ${FONT_TEXT}`;
        ctx.fillText(isZh ? "好好恢復" : "Recover well", tx, y + 80);
        continue;
      }

      // Title
      ctx.fillStyle = "#0F172A";
      ctx.font = `700 28px ${FONT_DISPLAY}`;
      const titleLines = wrapText(ctx, day.title, innerW);
      ctx.fillText(titleLines[0] ?? "", tx, y + 28);

      // Meta
      const metaParts: string[] = [];
      metaParts.push(localizeType(day.type, lang));
      if (day.distance_km) metaParts.push(`${day.distance_km} km`);
      if (day.pace) metaParts.push(day.pace);
      ctx.fillStyle = chipColor;
      ctx.font = `600 20px ${FONT_TEXT}`;
      ctx.fillText(metaParts.join(" · "), tx, y + 66);

      // Description
      if (day.description) {
        ctx.fillStyle = "#475569";
        ctx.font = `500 20px ${FONT_TEXT}`;
        const descLines = wrapText(ctx, day.description, innerW).slice(0, 2);
        let cy = y + 100;
        for (const ln of descLines) {
          ctx.fillText(ln, tx, cy);
          cy += 26;
        }
      }
    }

    await drawBrandFooter(ctx, W, H, lang, { cardX, cardW });

    const blob = await canvasToBlob(canvas);
    await distributeImageBlob(blob, `runward-week-${weekIndex + 1}.png`, lang);
  } catch (err) {
    console.error("[shareTrainingWeek]", err);
    toast.error(isZh ? "無法生成圖片" : "Unable to generate image");
  }
}

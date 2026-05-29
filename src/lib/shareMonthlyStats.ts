/**
 * Portrait PNG share card for monthly running stats.
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
  FONT_DISPLAY,
  FONT_TEXT,
} from "@/lib/shareCanvasHelpers";
import { RUN_TYPE_LABELS_EN, RUN_TYPE_LABELS_ZH, type RunTypeSummaryItem } from "@/lib/runClassifier";

export interface ShareMonthlyStatsInput {
  monthLabel: string;     // e.g. "May 2026" / "2026年5月"
  totalKm: number;
  runCount: number;
  totalSeconds: number;
  avgWeeklyKm: number;
  breakdown: RunTypeSummaryItem[];
  lang: Lang;
}

function fmtHm(seconds: number, isZh: boolean): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return isZh ? `${m}分` : `${m}m`;
  return isZh ? `${h}時${m}分` : `${h}h ${m}m`;
}

export async function shareMonthlyStats(input: ShareMonthlyStatsInput): Promise<void> {
  const isZh = input.lang === "zh";
  const W = 1080, H = 1440;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    toast.error(isZh ? "無法生成圖片" : "Could not render image");
    return;
  }

  const { cardX, cardW } = await drawWhiteCardBackground(ctx, W, H);
  const afterHeader = await drawCardHeader(
    ctx,
    cardX,
    48,
    cardW,
    isZh ? "月度跑步報告" : "Monthly Running Report",
    input.monthLabel,
  );

  // Title
  ctx.fillStyle = "#0F172A";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `800 56px ${FONT_DISPLAY}`;
  ctx.fillText(isZh ? "本月總覽" : "This Month", cardX + 44, afterHeader + 8);

  // 2x2 stat grid
  const tiles = [
    { label: isZh ? "總距離" : "Distance", value: input.totalKm.toFixed(1), unit: "km" },
    { label: isZh ? "跑步次數" : "Runs", value: String(input.runCount), unit: isZh ? "次" : "runs" },
    { label: isZh ? "總時長" : "Total Time", value: fmtHm(input.totalSeconds, isZh), unit: "" },
    { label: isZh ? "週均距離" : "Avg / Week", value: input.avgWeeklyKm.toFixed(1), unit: "km" },
  ];

  const gridTop = afterHeader + 90;
  const gap = 22;
  const tileW = (cardW - 44 * 2 - gap) / 2;
  const tileH = 200;

  tiles.forEach((t, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = cardX + 44 + col * (tileW + gap);
    const y = gridTop + row * (tileH + gap);

    ctx.fillStyle = "#F8FAFC";
    roundedRect(ctx, x, y, tileW, tileH, 24);
    ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#64748B";
    ctx.font = `600 22px ${FONT_TEXT}`;
    ctx.fillText(t.label, x + 24, y + 22);

    ctx.fillStyle = "#0F172A";
    ctx.font = `800 64px ${FONT_DISPLAY}`;
    ctx.fillText(t.value, x + 24, y + 70);

    if (t.unit) {
      const valW = ctx.measureText(t.value).width;
      ctx.fillStyle = "#94A3B8";
      ctx.font = `600 24px ${FONT_TEXT}`;
      ctx.fillText(t.unit, x + 24 + valW + 8, y + 110);
    }
  });

  // Breakdown
  const breakdownY = gridTop + tileH * 2 + gap + 36;
  ctx.fillStyle = "#0F172A";
  ctx.font = `800 40px ${FONT_DISPLAY}`;
  ctx.fillText(isZh ? "訓練類型" : "Workout Mix", cardX + 44, breakdownY);

  const labelMap = isZh ? RUN_TYPE_LABELS_ZH : RUN_TYPE_LABELS_EN;
  let chipX = cardX + 44;
  let chipY = breakdownY + 64;
  const chipH = 64;
  const maxChipRight = cardX + cardW - 44;

  ctx.font = `700 26px ${FONT_TEXT}`;
  for (const item of input.breakdown) {
    const text = `${item.count} × ${labelMap[item.type]}`;
    const padX = 22;
    const textW = ctx.measureText(text).width;
    const chipW = textW + padX * 2 + 24; // 24 for swatch
    if (chipX + chipW > maxChipRight) {
      chipX = cardX + 44;
      chipY += chipH + 14;
    }

    // chip background (tinted)
    ctx.fillStyle = item.color + "22";
    roundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.strokeStyle = item.color + "55";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // swatch dot
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(chipX + padX + 6, chipY + chipH / 2, 8, 0, Math.PI * 2);
    ctx.fill();

    // text
    ctx.fillStyle = "#0F172A";
    ctx.textBaseline = "middle";
    ctx.fillText(text, chipX + padX + 24, chipY + chipH / 2 + 1);
    ctx.textBaseline = "top";

    chipX += chipW + 12;
  }

  if (input.breakdown.length === 0) {
    ctx.fillStyle = "#94A3B8";
    ctx.font = `500 26px ${FONT_TEXT}`;
    ctx.fillText(isZh ? "本月暫無跑步活動" : "No runs logged this month", cardX + 44, breakdownY + 64);
  }

  await drawBrandFooter(ctx, W, H, input.lang, { cardX, cardW });

  const blob = await canvasToBlob(canvas, "image/png");
  await distributeImageBlob(blob, `monthly-stats-${input.monthLabel.replace(/\s+/g, "-")}.png`, input.lang);
}

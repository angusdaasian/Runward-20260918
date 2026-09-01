/**
 * Portrait PNG share card for monthly running stats.
 * Layout: header → mini calendar (run days highlighted with km) → stat tiles.
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

export interface ShareMonthlyStatsInput {
  monthLabel: string;     // e.g. "May 2026" / "2026年5月"
  year: number;
  month: number;          // 0-indexed
  totalKm: number;
  runCount: number;
  totalSeconds: number;
  avgWeeklyKm: number;
  /** day-of-month → total km run that day */
  dailyRuns: Array<{ day: number; km: number }>;
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

  // ---------- Mini calendar ----------
  const kmByDay = new Map<number, number>();
  for (const r of input.dailyRuns) {
    kmByDay.set(r.day, (kmByDay.get(r.day) ?? 0) + r.km);
  }
  const maxKm = Math.max(1, ...kmByDay.values());

  const { year, month } = input;
  const firstDow = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calPadX = 44;
  const calX = cardX + calPadX;
  const calW = cardW - calPadX * 2;
  const dowHeaderH = 40;
  const calY = afterHeader + 16;
  const gap = 8;
  const cellW = (calW - gap * 6) / 7;
  const weeks = Math.ceil((firstDow + daysInMonth) / 7);
  const cellH = 88;

  // Day-of-week headers (Mon-first display)
  const DOW_EN = ["M", "T", "W", "T", "F", "S", "S"];
  const DOW_ZH = ["一", "二", "三", "四", "五", "六", "日"];
  const dows = isZh ? DOW_ZH : DOW_EN;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 7; i++) {
    const x = calX + i * (cellW + gap) + cellW / 2;
    ctx.fillStyle = "#94A3B8";
    ctx.font = `600 20px ${FONT_TEXT}`;
    ctx.fillText(dows[i], x, calY + dowHeaderH / 2);
  }

  const gridTop = calY + dowHeaderH + 6;
  // Convert Sunday-first getDay() to Monday-first column index
  const startCol = (firstDow + 6) % 7;

  for (let d = 1; d <= daysInMonth; d++) {
    const idx = startCol + (d - 1);
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const x = calX + col * (cellW + gap);
    const y = gridTop + row * (cellH + gap);

    const km = kmByDay.get(d);
    if (km != null) {
      // intensity based on distance relative to month's longest run
      const t = Math.min(1, km / maxKm);
      const alpha = 0.18 + t * 0.72;
      ctx.fillStyle = `rgba(249, 115, 22, ${alpha.toFixed(2)})`; // brand orange tint
      roundedRect(ctx, x, y, cellW, cellH, 16);
      ctx.fill();

      const textColor = t > 0.45 ? "#FFFFFF" : "#7C2D12";
      ctx.fillStyle = textColor;
      ctx.font = `700 22px ${FONT_DISPLAY}`;
      ctx.fillText(String(d), x + cellW / 2, y + 28);

      ctx.font = `600 19px ${FONT_TEXT}`;
      ctx.fillText(`${km >= 10 ? km.toFixed(0) : km.toFixed(1)}km`, x + cellW / 2, y + cellH - 26);
    } else {
      ctx.fillStyle = "#F1F5F9";
      roundedRect(ctx, x, y, cellW, cellH, 16);
      ctx.fill();

      ctx.fillStyle = "#CBD5E1";
      ctx.font = `600 22px ${FONT_DISPLAY}`;
      ctx.fillText(String(d), x + cellW / 2, y + 28);
    }
  }
  void weeks;

  const calBottom = gridTop + Math.ceil((startCol + daysInMonth) / 7) * (cellH + gap) - gap;

  // ---------- Stats ----------
  const statsTitleY = calBottom + 24;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#0F172A";
  ctx.font = `800 40px ${FONT_DISPLAY}`;
  ctx.fillText(isZh ? "本月總覽" : "Monthly Stats", cardX + 44, statsTitleY);

  const tiles = [
    { label: isZh ? "總距離" : "Distance", value: input.totalKm.toFixed(1), unit: "km" },
    { label: isZh ? "跑步次數" : "Runs", value: String(input.runCount), unit: isZh ? "次" : "runs" },
    { label: isZh ? "總時長" : "Total Time", value: fmtHm(input.totalSeconds, isZh), unit: "" },
    { label: isZh ? "週均距離" : "Avg / Week", value: input.avgWeeklyKm.toFixed(1), unit: "km" },
  ];

  const gridTopY = statsTitleY + 44;
  const tileGap = 22;
  const tileW = (cardW - 44 * 2 - tileGap) / 2;
  const tileH = 158;

  tiles.forEach((t, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = cardX + 44 + col * (tileW + tileGap);
    const y = gridTopY + row * (tileH + tileGap);

    ctx.fillStyle = "#F8FAFC";
    roundedRect(ctx, x, y, tileW, tileH, 24);
    ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#64748B";
    ctx.font = `600 22px ${FONT_TEXT}`;
    ctx.fillText(t.label, x + 24, y + 20);

    ctx.fillStyle = "#0F172A";
    ctx.font = `800 56px ${FONT_DISPLAY}`;
    ctx.fillText(t.value, x + 24, y + 62);

    if (t.unit) {
      const valW = ctx.measureText(t.value).width;
      ctx.fillStyle = "#94A3B8";
      ctx.font = `600 22px ${FONT_TEXT}`;
      ctx.fillText(t.unit, x + 24 + valW + 8, y + 96);
    }
  });

  await drawBrandFooter(ctx, W, H, input.lang, { cardX, cardW });

  const blob = await canvasToBlob(canvas, "image/png");
  await distributeImageBlob(blob, `monthly-stats-${input.monthLabel.replace(/\s+/g, "-")}.png`, input.lang);
}

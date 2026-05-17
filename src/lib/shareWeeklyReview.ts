/**
 * Share a weekly training review as a portrait PNG (white card style).
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

export interface ShareWeeklyReviewInput {
  weekIndex: number;
  weekStart: string;
  weekEnd: string;
  completionPct: number;
  overallScore: number;
  distanceScore: number;
  paceScore: number;
  hrScore: number;
  recoveryScore: number;
  plannedKm?: number | null;
  actualKm?: number | null;
  plannedRuns?: number | null;
  completedRuns?: number | null;
  avgHr?: number | null;
  avgPaceSecPerKm?: number | null;
  insight: string;
  lang: Lang;
}

function scoreColor(v: number): string {
  if (v >= 80) return "#10B981";
  if (v >= 60) return "#F59E0B";
  return "#F43F5E";
}

function fmtPace(s?: number | null) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/km`;
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  value: number,
  strokeWidth: number,
) {
  const pct = Math.max(0, Math.min(100, value)) / 100;
  ctx.strokeStyle = "rgba(15,23,42,0.10)";
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = scoreColor(value);
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.stroke();
}

export async function shareWeeklyReview(input: ShareWeeklyReviewInput): Promise<void> {
  const isZh = input.lang === "zh";

  try {
    const W = 1080;
    const H = 1500;
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
      isZh ? "週訓練回顧" : "Weekly Training Review",
      `${input.weekStart} → ${input.weekEnd}`,
    );

    // Title
    ctx.fillStyle = "#0F172A";
    ctx.textBaseline = "top";
    ctx.font = `800 52px ${FONT_DISPLAY}`;
    ctx.fillText(isZh ? `第 ${input.weekIndex + 1} 週` : `Week ${input.weekIndex + 1}`, cardX + 44, afterHeader + 12);
    ctx.fillStyle = "#FC4C02";
    ctx.fillRect(cardX + 44, afterHeader + 76, 64, 5);

    // Overall card
    const cardTop = afterHeader + 110;
    ctx.fillStyle = "rgba(15,23,42,0.03)";
    roundedRect(ctx, cardX + 44, cardTop, cardW - 88, 240, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,0.06)";
    roundedRect(ctx, cardX + 44, cardTop, cardW - 88, 240, 22);
    ctx.stroke();

    // Ring
    drawRing(ctx, cardX + 170, cardTop + 120, 80, input.overallScore, 16);
    ctx.fillStyle = "#0F172A";
    ctx.font = `800 48px ${FONT_DISPLAY}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(input.overallScore)), cardX + 170, cardTop + 120);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    ctx.fillStyle = "#64748B";
    ctx.font = `500 20px ${FONT_TEXT}`;
    ctx.fillText(isZh ? "總分" : "Overall Score", cardX + 300, cardTop + 40);

    ctx.fillStyle = "#0F172A";
    ctx.font = `800 64px ${FONT_DISPLAY}`;
    ctx.fillText(`${Math.round(input.completionPct)}%`, cardX + 300, cardTop + 70);

    ctx.fillStyle = "#64748B";
    ctx.font = `500 20px ${FONT_TEXT}`;
    ctx.fillText(isZh ? "完成度" : "Completion", cardX + 300, cardTop + 150);

    ctx.fillStyle = "#475569";
    ctx.font = `500 20px ${FONT_TEXT}`;
    const summary = `${input.completedRuns ?? "—"}/${input.plannedRuns ?? "—"} ${isZh ? "次" : "runs"} · ${input.actualKm ?? "—"}/${input.plannedKm ?? "—"} km`;
    ctx.fillText(summary, cardX + 300, cardTop + 180);

    // Sub-tiles
    const tilesY = cardTop + 270;
    const tileW = (cardW - 88 - 24) / 2;
    const tileH = 140;
    const tiles = [
      { label: isZh ? "里程" : "Distance",   score: input.distanceScore, stat: `${input.actualKm ?? "—"}/${input.plannedKm ?? "—"} km` },
      { label: isZh ? "配速" : "Pace",       score: input.paceScore,     stat: fmtPace(input.avgPaceSecPerKm) },
      { label: isZh ? "心率" : "Heart Rate", score: input.hrScore,       stat: input.avgHr != null ? `${input.avgHr} bpm` : "—" },
      { label: isZh ? "恢復" : "Recovery",   score: input.recoveryScore, stat: "—" },
    ];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const tx = cardX + 44 + (i % 2) * (tileW + 24);
      const ty = tilesY + Math.floor(i / 2) * (tileH + 18);
      ctx.fillStyle = "rgba(15,23,42,0.03)";
      roundedRect(ctx, tx, ty, tileW, tileH, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(15,23,42,0.06)";
      roundedRect(ctx, tx, ty, tileW, tileH, 18);
      ctx.stroke();

      drawRing(ctx, tx + 60, ty + 70, 42, t.score, 10);
      ctx.fillStyle = "#0F172A";
      ctx.font = `700 24px ${FONT_DISPLAY}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(t.score)), tx + 60, ty + 70);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      ctx.fillStyle = "#0F172A";
      ctx.font = `700 24px ${FONT_DISPLAY}`;
      ctx.fillText(t.label, tx + 124, ty + 38);
      ctx.fillStyle = "#64748B";
      ctx.font = `500 20px ${FONT_TEXT}`;
      ctx.fillText(t.stat, tx + 124, ty + 72);
    }

    // Insight
    const insightY = tilesY + 2 * (tileH + 18) + 16;
    const insightBottom = H - 160;
    ctx.fillStyle = "rgba(15,23,42,0.03)";
    roundedRect(ctx, cardX + 44, insightY, cardW - 88, insightBottom - insightY, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,0.06)";
    roundedRect(ctx, cardX + 44, insightY, cardW - 88, insightBottom - insightY, 22);
    ctx.stroke();

    ctx.fillStyle = "#64748B";
    ctx.font = `600 22px ${FONT_TEXT}`;
    ctx.fillText(isZh ? "教練分析" : "Coach Insight", cardX + 68, insightY + 22);

    ctx.fillStyle = "#1F2937";
    ctx.font = `500 24px ${FONT_TEXT}`;
    const lineHeight = 34;
    const maxLines = Math.floor((insightBottom - insightY - 80) / lineHeight);
    const text = (input.insight || "").trim() || (isZh ? "暫無分析。" : "No insight available.");
    const lines = wrapText(ctx, text, cardW - 136).slice(0, maxLines);
    let cy = insightY + 68;
    for (const ln of lines) {
      ctx.fillText(ln, cardX + 68, cy);
      cy += lineHeight;
    }

    await drawBrandFooter(ctx, W, H, input.lang, { cardX, cardW });

    const blob = await canvasToBlob(canvas);
    await distributeImageBlob(blob, `runward-week-review-${input.weekIndex + 1}.png`, input.lang);
  } catch (err) {
    console.error("[shareWeeklyReview]", err);
    toast.error(isZh ? "無法生成圖片" : "Unable to generate image");
  }
}

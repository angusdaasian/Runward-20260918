/**
 * Share a weekly training review as a portrait PNG.
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
  if (v >= 80) return "#10b981";
  if (v >= 60) return "#f59e0b";
  return "#f43f5e";
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
  // background
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  // progress
  ctx.strokeStyle = scoreColor(value);
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.stroke();
}

export async function shareWeeklyReview(input: ShareWeeklyReviewInput): Promise<void> {
  const { lang } = input;
  const isZh = lang === "zh";

  try {
    const W = 1080;
    const H = 1700;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#1e293b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.fillStyle = "#94a3b8";
    ctx.textBaseline = "top";
    ctx.font = "600 30px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(isZh ? "週訓練回顧" : "Weekly Training Review", 60, 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(isZh ? `第 ${input.weekIndex + 1} 週` : `Week ${input.weekIndex + 1}`, 60, 100);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "24px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(`${input.weekStart} → ${input.weekEnd}`, 60, 180);

    // Overall card
    const cardY = 250;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundedRect(ctx, 40, cardY, W - 80, 280, 28);
    ctx.fill();

    // Ring
    drawRing(ctx, 220, cardY + 140, 90, input.overallScore, 18);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(input.overallScore)), 220, cardY + 140);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // Right of ring
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(isZh ? "總分" : "Overall Score", 350, cardY + 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 80px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(`${Math.round(input.completionPct)}%`, 350, cardY + 92);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(isZh ? "完成度" : "Completion", 350, cardY + 188);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    const summaryLine = `${input.completedRuns ?? "—"}/${input.plannedRuns ?? "—"} ${isZh ? "次" : "runs"} · ${input.actualKm ?? "—"}/${input.plannedKm ?? "—"} km`;
    ctx.fillText(summaryLine, 350, cardY + 220);

    // 4 sub-score tiles
    const tilesY = cardY + 310;
    const tileW = (W - 80 - 30) / 2;
    const tileH = 180;
    const tiles = [
      { label: isZh ? "里程" : "Distance",    score: input.distanceScore, stat: `${input.actualKm ?? "—"}/${input.plannedKm ?? "—"} km` },
      { label: isZh ? "配速" : "Pace",        score: input.paceScore,     stat: fmtPace(input.avgPaceSecPerKm) },
      { label: isZh ? "心率" : "Heart Rate",  score: input.hrScore,       stat: input.avgHr != null ? `${input.avgHr} bpm` : "—" },
      { label: isZh ? "恢復" : "Recovery",    score: input.recoveryScore, stat: "—" },
    ];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const tx = 40 + (i % 2) * (tileW + 30);
      const ty = tilesY + Math.floor(i / 2) * (tileH + 20);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundedRect(ctx, tx, ty, tileW, tileH, 22);
      ctx.fill();

      // Mini ring
      drawRing(ctx, tx + 70, ty + 90, 50, t.score, 12);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(t.score)), tx + 70, ty + 90);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.fillText(t.label, tx + 140, ty + 50);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.fillText(t.stat, tx + 140, ty + 90);
    }

    // Insight box
    const insightY = tilesY + 2 * (tileH + 20) + 10;
    const insightH = H - insightY - 160;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundedRect(ctx, 40, insightY, W - 80, insightH, 24);
    ctx.fill();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 24px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(isZh ? "教練分析" : "Coach Insight", 70, insightY + 30);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "26px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    const text = (input.insight || "").trim() || (isZh ? "暫無分析。" : "No insight available.");
    const lines = wrapText(ctx, text, W - 140).slice(0, 14);
    let cy = insightY + 80;
    for (const ln of lines) {
      ctx.fillText(ln, 70, cy);
      cy += 36;
    }

    await drawBrandFooter(ctx, W, H, lang);

    const blob = await canvasToBlob(canvas);
    await distributeImageBlob(blob, `runward-week-review-${input.weekIndex + 1}.png`, lang);
  } catch (err) {
    console.error("[shareWeeklyReview]", err);
    toast.error(isZh ? "無法生成圖片" : "Unable to generate image");
  }
}

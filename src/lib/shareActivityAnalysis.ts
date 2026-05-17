/**
 * Share an activity's AI analysis as a portrait PNG.
 */
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";
import { distributeImageBlob } from "@/lib/shareActivity";
import {
  fmtDistanceKm,
  fmtTimeShort,
  fmtPace,
  fmtDate,
  stripMarkdown,
  drawBrandFooter,
  canvasToBlob,
  roundedRect,
  wrapText,
} from "@/lib/shareCanvasHelpers";

export interface ShareActivityAnalysisInput {
  name: string;
  startDate: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  averageSpeed: number;
  analysis: string;
  nextWorkout?: string | null;
  lang: Lang;
}

export async function shareActivityAnalysis(input: ShareActivityAnalysisInput): Promise<void> {
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

    // Header label
    ctx.fillStyle = "#94a3b8";
    ctx.textBaseline = "top";
    ctx.font = "600 28px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(isZh ? "AI 訓練分析" : "AI Workout Analysis", 60, 60);

    // Activity name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 54px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    const titleLines = wrapText(ctx, input.name, W - 120).slice(0, 2);
    let ty = 100;
    for (const ln of titleLines) {
      ctx.fillText(ln, 60, ty);
      ty += 64;
    }

    // Date
    ctx.fillStyle = "#94a3b8";
    ctx.font = "24px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(fmtDate(input.startDate, lang, true), 60, ty + 4);
    const statsY = ty + 60;

    // Stats card
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundedRect(ctx, 40, statsY, W - 80, 180, 24);
    ctx.fill();

    const stats = [
      { label: isZh ? "距離" : "Distance", value: `${fmtDistanceKm(input.distanceMeters)} km` },
      { label: isZh ? "時間" : "Time",     value: fmtTimeShort(input.movingTimeSeconds, isZh) },
      { label: isZh ? "配速" : "Pace",     value: fmtPace(input.averageSpeed, isZh) },
    ];
    const colW = (W - 80) / 3;
    for (let i = 0; i < stats.length; i++) {
      const cx = 40 + colW * i + colW / 2;
      ctx.textAlign = "center";

      ctx.fillStyle = "#94a3b8";
      ctx.font = "22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.fillText(stats[i].label, cx, statsY + 36);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.fillText(stats[i].value, cx, statsY + 78);
    }
    ctx.textAlign = "left";

    // Analysis card
    const aY = statsY + 210;
    const aH = H - aY - (input.nextWorkout ? 360 : 160);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundedRect(ctx, 40, aY, W - 80, aH, 24);
    ctx.fill();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 24px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.fillText(isZh ? "教練分析" : "Coach Analysis", 70, aY + 28);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "26px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    const analysisText = stripMarkdown(input.analysis || "").slice(0, 1200);
    const maxLines = Math.floor((aH - 100) / 36);
    const lines = wrapText(ctx, analysisText, W - 140).slice(0, maxLines);
    let cy = aY + 80;
    for (const ln of lines) {
      ctx.fillText(ln, 70, cy);
      cy += 36;
    }

    // Next workout card
    if (input.nextWorkout) {
      const nY = aY + aH + 20;
      ctx.fillStyle = "rgba(99,102,241,0.18)";
      roundedRect(ctx, 40, nY, W - 80, 160, 22);
      ctx.fill();

      ctx.fillStyle = "#c7d2fe";
      ctx.font = "600 22px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      ctx.fillText(isZh ? "下一次訓練建議" : "Next Workout Suggestion", 70, nY + 24);

      ctx.fillStyle = "#ffffff";
      ctx.font = "26px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      const nwLines = wrapText(ctx, stripMarkdown(input.nextWorkout), W - 140).slice(0, 3);
      let ny = nY + 64;
      for (const ln of nwLines) {
        ctx.fillText(ln, 70, ny);
        ny += 32;
      }
    }

    await drawBrandFooter(ctx, W, H, lang);

    const blob = await canvasToBlob(canvas);
    await distributeImageBlob(blob, `runward-analysis-${Date.now()}.png`, lang);
  } catch (err) {
    console.error("[shareActivityAnalysis]", err);
    toast.error(isZh ? "無法生成圖片" : "Unable to generate image");
  }
}

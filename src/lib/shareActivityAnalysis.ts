/**
 * Share an activity's AI analysis as a portrait PNG (white card style).
 */
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";
import { distributeImageBlob } from "@/lib/shareActivity";
import {
  fmtDate,
  stripMarkdown,
  drawBrandFooter,
  drawWhiteCardBackground,
  drawCardHeader,
  canvasToBlob,
  wrapText,
  FONT_DISPLAY,
  FONT_TEXT,
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
  const isZh = input.lang === "zh";

  try {
    const W = 1080;
    const H = 1350;
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
      isZh ? "AI 訓練分析" : "AI Workout Analysis",
      fmtDate(input.startDate, input.lang, true),
    );

    // Activity title
    ctx.fillStyle = "#0F172A";
    ctx.textBaseline = "top";
    ctx.font = `800 48px ${FONT_DISPLAY}`;
    const titleLines = wrapText(ctx, input.name, cardW - 88).slice(0, 2);
    let ty = afterHeader + 24;
    for (const ln of titleLines) {
      ctx.fillText(ln, cardX + 44, ty);
      ty += 56;
    }

    // Accent underline
    ctx.fillStyle = "#FC4C02";
    ctx.fillRect(cardX + 44, ty + 4, 64, 5);

    // Analysis body
    const bodyY = ty + 40;
    const bodyBottom = H - 160;
    const lineHeight = 38;
    const nextText = stripMarkdown(input.nextWorkout || "");
    const hasNext = nextText.length > 0;

    // Reserve space for "Next workout" section if present
    const nextHeaderH = hasNext ? 56 : 0; // label + spacing
    const nextMaxLines = hasNext ? 6 : 0;
    const nextBlockH = hasNext ? nextHeaderH + nextMaxLines * lineHeight + 24 : 0;

    const analysisBottom = bodyBottom - nextBlockH;

    ctx.fillStyle = "#1F2937";
    ctx.font = `500 26px ${FONT_TEXT}`;
    const maxLines = Math.max(1, Math.floor((analysisBottom - bodyY) / lineHeight));
    const text = stripMarkdown(input.analysis || "");
    const lines = wrapText(ctx, text, cardW - 88).slice(0, maxLines);
    let cy = bodyY;
    for (const ln of lines) {
      ctx.fillText(ln, cardX + 44, cy);
      cy += lineHeight;
    }

    if (hasNext) {
      cy += 16;
      // Divider
      ctx.fillStyle = "#E5E7EB";
      ctx.fillRect(cardX + 44, cy, cardW - 88, 2);
      cy += 20;
      // Section label
      ctx.fillStyle = "#FC4C02";
      ctx.font = `800 22px ${FONT_DISPLAY}`;
      ctx.fillText(isZh ? "建議下一次訓練" : "SUGGESTED NEXT WORKOUT", cardX + 44, cy);
      cy += 32;
      // Body
      ctx.fillStyle = "#1F2937";
      ctx.font = `500 24px ${FONT_TEXT}`;
      const nLines = wrapText(ctx, nextText, cardW - 88).slice(0, nextMaxLines);
      for (const ln of nLines) {
        ctx.fillText(ln, cardX + 44, cy);
        cy += lineHeight;
      }
    }

    await drawBrandFooter(ctx, W, H, input.lang, { cardX, cardW });

    const blob = await canvasToBlob(canvas);
    await distributeImageBlob(blob, `runward-analysis-${Date.now()}.png`, input.lang);
  } catch (err) {
    console.error("[shareActivityAnalysis]", err);
    toast.error(isZh ? "無法生成圖片" : "Unable to generate image");
  }
}

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

    // Analysis body — auto-fit font size so the full text stays inside the card
    const bodyY = ty + 40;
    const bodyBottom = H - 160;
    const availableH = bodyBottom - bodyY;

    ctx.fillStyle = "#1F2937";
    const text = stripMarkdown(input.analysis || "");

    let fontSize = 26;
    let lineHeight = 38;
    let lines: string[] = [];
    const minFontSize = 16;
    while (fontSize >= minFontSize) {
      ctx.font = `500 ${fontSize}px ${FONT_TEXT}`;
      lineHeight = Math.round(fontSize * 1.46);
      lines = wrapText(ctx, text, cardW - 88);
      if (lines.length * lineHeight <= availableH) break;
      fontSize -= 1;
    }
    const maxLines = Math.max(1, Math.floor(availableH / lineHeight));
    if (lines.length > maxLines) lines = lines.slice(0, maxLines);

    let cy = bodyY;
    for (const ln of lines) {
      ctx.fillText(ln, cardX + 44, cy);
      cy += lineHeight;
    }

    await drawBrandFooter(ctx, W, H, input.lang, { cardX, cardW });

    const blob = await canvasToBlob(canvas);
    await distributeImageBlob(blob, `runward-analysis-${Date.now()}.png`, input.lang);
  } catch (err) {
    console.error("[shareActivityAnalysis]", err);
    toast.error(isZh ? "無法生成圖片" : "Unable to generate image");
  }
}

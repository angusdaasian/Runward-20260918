/**
 * Share an activity (with optional AI analysis) to the device's native
 * share sheet via the Despia bridge. Falls back to the Web Share API
 * (or clipboard) when running outside the native shell.
 *
 * Always appends the Runward app name + URL for marketing purposes.
 */
import despia from "despia-native";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";

const APP_NAME = "Runward";
const APP_URL = "https://runward.app";

export interface ShareActivityInput {
  name: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  averageSpeed: number; // m/s
  startDate: string;
  analysis?: string | null;
  nextWorkout?: string | null;
  lang: Lang;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtPace(avgSpeed: number): string {
  if (!avgSpeed || avgSpeed <= 0) return "--";
  const paceSec = 1000 / avgSpeed;
  const min = Math.floor(paceSec / 60);
  const sec = Math.floor(paceSec % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

/** Strip markdown formatting so it reads cleanly in plain-text share sheets. */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildShareMessage(input: ShareActivityInput): string {
  const { name, distanceMeters, movingTimeSeconds, averageSpeed, analysis, nextWorkout, lang } = input;
  const km = (distanceMeters / 1000).toFixed(2);
  const isZh = lang === "zh";

  const header = isZh
    ? `🏃 ${name}\n📏 ${km} 公里 · ⏱ ${fmtDuration(movingTimeSeconds)} · ⚡ ${fmtPace(averageSpeed)}`
    : `🏃 ${name}\n📏 ${km} km · ⏱ ${fmtDuration(movingTimeSeconds)} · ⚡ ${fmtPace(averageSpeed)}`;

  const parts: string[] = [header];

  if (analysis) {
    const cleaned = stripMarkdown(analysis);
    // Cap analysis length so social posts stay readable
    const trimmed = cleaned.length > 600 ? cleaned.slice(0, 600).trimEnd() + "…" : cleaned;
    parts.push(isZh ? `\n🤖 AI 分析\n${trimmed}` : `\n🤖 AI Analysis\n${trimmed}`);
  }

  if (nextWorkout) {
    const cleaned = stripMarkdown(nextWorkout);
    const trimmed = cleaned.length > 300 ? cleaned.slice(0, 300).trimEnd() + "…" : cleaned;
    parts.push(isZh ? `\n🎯 下一步\n${trimmed}` : `\n🎯 Next Up\n${trimmed}`);
  }

  parts.push(
    isZh
      ? `\n— 由 ${APP_NAME} 追蹤 · ${APP_URL}`
      : `\n— Tracked with ${APP_NAME} · ${APP_URL}`
  );

  return parts.join("\n");
}

/** Detect whether the Despia native bridge is available. */
function hasNativeBridge(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as any).median !== "undefined" ||
    typeof (window as any).despia !== "undefined" ||
    (navigator as any).standalone === true
  );
}

export async function shareActivity(input: ShareActivityInput): Promise<void> {
  const message = buildShareMessage(input);
  const url = APP_URL;

  // 1. Native bridge (Despia)
  if (hasNativeBridge()) {
    try {
      despia(`shareapp://message?=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`);
      return;
    } catch (err) {
      console.warn("[Share] Despia bridge failed, falling back:", err);
    }
  }

  // 2. Web Share API
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: APP_NAME, text: message, url });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return; // user cancelled
      console.warn("[Share] navigator.share failed, falling back:", err);
    }
  }

  // 3. Clipboard fallback
  try {
    await navigator.clipboard.writeText(`${message}\n${url}`);
    toast.success(input.lang === "zh" ? "已複製到剪貼簿" : "Copied to clipboard");
  } catch {
    toast.error(input.lang === "zh" ? "無法分享" : "Unable to share");
  }
}

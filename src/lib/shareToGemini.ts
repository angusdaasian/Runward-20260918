import { toast } from "sonner";
import type { StravaActivity } from "@/hooks/use-activities";
import type { Lang } from "@/lib/i18n";
import { forceUnlockUI, keepUIUnlockedForShare } from "@/lib/uiUnlock";

function fmtPace(metersPerSec: number) {
  if (!metersPerSec) return "—";
  const sec = 1000 / metersPerSec;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}
function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildActivitySummary(activity: StravaActivity, lang: Lang = "en"): string {
  const zh = lang === "zh";
  const km = (activity.distance || 0) / 1000;
  const date = new Date(activity.start_date).toLocaleString(zh ? "zh-TW" : "en-US");
  const lines: string[] = [];

  lines.push(`# ${activity.name}`);
  lines.push(`Date: ${date}`);
  lines.push(`Sport: ${activity.sport_type}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Distance: ${km.toFixed(2)} km`);
  lines.push(`- Moving time: ${fmtDuration(activity.moving_time)}`);
  lines.push(`- Elapsed time: ${fmtDuration(activity.elapsed_time || activity.moving_time)}`);
  lines.push(`- Avg pace: ${fmtPace(activity.average_speed)}`);
  if (activity.max_speed) lines.push(`- Max pace: ${fmtPace(activity.max_speed)}`);
  lines.push(`- Elevation gain: ${Math.round(activity.total_elevation_gain || 0)} m`);
  if (activity.average_heartrate) lines.push(`- Avg HR: ${Math.round(activity.average_heartrate)} bpm`);
  if (activity.max_heartrate) lines.push(`- Max HR: ${Math.round(activity.max_heartrate)} bpm`);
  if ((activity as any).calories) lines.push(`- Calories: ${Math.round((activity as any).calories)} kcal`);
  if ((activity as any).avg_cadence) lines.push(`- Avg cadence: ${Math.round((activity as any).avg_cadence)} spm`);

  const laps: any[] = Array.isArray((activity as any).laps) ? (activity as any).laps : [];
  if (laps.length > 0) {
    lines.push("");
    lines.push("## Laps / Splits");
    lines.push("| # | Distance (km) | Time | Pace | Avg HR | Elev gain (m) |");
    lines.push("|---|---|---|---|---|---|");
    laps.forEach((l: any, i: number) => {
      const d = Number(l.distance ?? l.distance_meters) || 0;
      const t = Number(l.elapsed_time ?? l.moving_time ?? l.duration_seconds) || 0;
      const speed = d > 0 && t > 0 ? d / t : 0;
      const hr = l.avg_hr ?? l.average_hr ?? l.average_heartrate ?? null;
      const elev = Number(l.elevation_gain ?? l.total_ascent_meters ?? l.total_ascent ?? 0);
      lines.push(`| ${i + 1} | ${(d / 1000).toFixed(2)} | ${fmtDuration(t)} | ${fmtPace(speed)} | ${hr ? Math.round(hr) : "—"} | ${Math.round(elev)} |`);
    });
  }

  const hrSamples: any[] = Array.isArray((activity as any).hr_samples) ? (activity as any).hr_samples : [];
  const distSamples: any[] = Array.isArray((activity as any).distance_samples) ? (activity as any).distance_samples : [];
  const elevSamples: any[] = Array.isArray((activity as any).elevation_samples) ? (activity as any).elevation_samples : [];
  const maxLen = Math.max(hrSamples.length, distSamples.length, elevSamples.length);
  if (maxLen > 10) {
    const target = 30;
    const step = Math.max(1, Math.floor(maxLen / target));
    lines.push("");
    lines.push("## Timeline (downsampled)");
    lines.push("| t (s) | Distance (km) | HR (bpm) | Elevation (m) |");
    lines.push("|---|---|---|---|");
    for (let i = 0; i < maxLen; i += step) {
      const hr = hrSamples[i]?.bpm ?? "";
      const d = distSamples[i]?.d != null ? (distSamples[i].d / 1000).toFixed(2) : "";
      const e = elevSamples[i]?.e != null ? Math.round(elevSamples[i].e) : "";
      const t = hrSamples[i]?.t ?? distSamples[i]?.t ?? elevSamples[i]?.t ?? i;
      lines.push(`| ${t} | ${d} | ${hr} | ${e} |`);
    }
  }

  lines.push("");
  lines.push(zh
    ? "請根據以上跑步資料回答我的問題："
    : "Using the running data above, please answer my question:");
  lines.push("");
  return lines.join("\n");
}

function installReturnCleanup() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const cleanup = () => forceUnlockUI();
  const cleanupWhenVisible = () => {
    if (document.visibilityState === "visible") {
      cleanup();
      document.removeEventListener("visibilitychange", cleanupWhenVisible);
    }
  };

  // Run cleanup independently of navigator.share() settling. Some Android/Gemini
  // share targets keep the share promise pending even after the user returns.
  [0, 100, 300, 800, 1500, 3000, 6000].forEach((delay) => setTimeout(cleanup, delay));
  window.addEventListener("focus", cleanup, { once: true });
  window.addEventListener("pageshow", cleanup, { once: true });
  document.addEventListener("visibilitychange", cleanupWhenVisible);
}

export async function shareActivityToGemini(activity: StravaActivity, lang: Lang = "en") {
  const zh = lang === "zh";
  const text = buildActivitySummary(activity, lang);
  const title = activity.name || (zh ? "跑步活動" : "Run activity");

  // Defer so the dropdown/menu that triggered us fully unmounts first.
  // Radix cleans up pointer-events on close; running the share sync
  // inside the click can leave the UI in a locked state on return.
  setTimeout(async () => {
    keepUIUnlockedForShare();
    installReturnCleanup();

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          forceUnlockUI();
          await navigator.share({ title, text });
          return;
        } catch (err: any) {
          // AbortError = user dismissed the sheet — that's fine, just unfreeze.
          if (err?.name === "AbortError") return;
          // Fall through to clipboard fallback on other errors.
        }
      }

      // Fallback for browsers without Web Share API (mostly desktop)
      try {
        await navigator.clipboard.writeText(text);
        toast.success(
          zh
            ? "活動資料已複製 — 貼到你的 AI 聊天工具"
            : "Activity data copied — paste into your AI chat",
          { duration: 5000 }
        );
      } catch {
        toast.error(zh ? "無法分享" : "Unable to share");
      }
    } finally {
      forceUnlockUI();
      setTimeout(forceUnlockUI, 300);
      setTimeout(forceUnlockUI, 1500);
    }
  }, 50);
}

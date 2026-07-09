import { toast } from "sonner";
import type { StravaActivity } from "@/hooks/use-activities";
import type { Lang } from "@/lib/i18n";

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

  // Laps
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

  // Downsampled HR + elevation timeline (max ~40 points)
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

// Clear any lingering pointer-events:none that Radix leaves on <body>
// after a dropdown/dialog item triggers navigation to an external tab —
// otherwise the page looks frozen when the user returns.
function unfreezeUI() {
  try {
    document.body.style.pointerEvents = "";
    document.documentElement.style.pointerEvents = "";
    // Remove Radix data attributes that can leave overlays interactive-blocking
    document.body.removeAttribute("data-scroll-locked");
  } catch {
    // ignore
  }
}

function isNativeWebview() {
  const ua = navigator.userAgent || "";
  return /Despia|Capacitor|wv\)/i.test(ua) || (window as any).Capacitor != null;
}

export async function shareActivityToGemini(activity: StravaActivity, lang: Lang = "en") {
  const zh = lang === "zh";
  const text = buildActivitySummary(activity, lang);

  // Defer so the dropdown/menu that triggered us fully unmounts first.
  // Radix cleans up pointer-events on close; running heavy sync work
  // (clipboard + window.open + navigator.share) inside the click freezes the UI.
  setTimeout(async () => {
    try {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // ignore
      }

      toast.success(
        zh
          ? "活動資料已複製到剪貼簿 — 貼到 Gemini 並問你的問題"
          : "Activity data copied — paste into Gemini and ask your question",
        { duration: 6000 }
      );

      if (isNativeWebview()) {
        // In native webviews window.open can hijack the app view.
        // Just copy to clipboard; the user opens Gemini themselves.
        return;
      }

      const win = window.open("https://gemini.google.com/app", "_blank", "noopener,noreferrer");
      if (!win) {
        // Popup blocked — user can still paste from clipboard
      }
    } finally {
      // Belt & suspenders: ensure UI stays interactive on return
      unfreezeUI();
      setTimeout(unfreezeUI, 300);
      setTimeout(unfreezeUI, 1500);
    }
  }, 50);
}

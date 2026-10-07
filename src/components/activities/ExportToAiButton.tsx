import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { shareOrDownloadFile } from "@/lib/fitExport";
import type { StravaActivity } from "@/hooks/use-activities";

interface Props {
  lang: Lang;
  activities: StravaActivity[];
}

function fmtPace(metersPerSec: number) {
  if (!metersPerSec) return "—";
  const sec = 1000 / metersPerSec;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtDur(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const ExportToAiButton = ({ lang, activities }: Props) => {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const zh = lang === "zh";

  const onClick = async () => {
    if (!user || running) return;
    if (!activities || activities.length === 0) {
      toast.info(zh ? "暫時沒有可匯出的活動" : "No activities to export yet");
      return;
    }
    setRunning(true);
    const tid = "export-ai";
    toast.loading(zh ? "正在整理你的數據…" : "Preparing your data…", { id: tid });

    try {
      // Daily health (up to ~1 year of rows)
      const { data: health } = await supabase
        .from("terra_daily_health")
        .select("date, provider, resting_hr, hrv, sleep_seconds, sleep_score, steps, calories, vo2max")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(400);

      const sorted = [...activities].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      );
      const runs = sorted.filter((a) => (a.sport_type || "").toLowerCase().includes("run"));
      const totalKm = runs.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
      const totalSec = runs.reduce((s, a) => s + (a.moving_time || 0), 0);
      const longest = runs.reduce((m, a) => Math.max(m, (a.distance || 0) / 1000), 0);

      const L: string[] = [];
      L.push(zh ? "# RunWard 跑步數據匯出" : "# RunWard running data export");
      L.push(`${zh ? "匯出日期" : "Exported"}: ${new Date().toISOString().slice(0, 10)}`);
      L.push("");
      L.push(zh ? "## 總覽" : "## Overview");
      L.push(`- ${zh ? "跑步次數" : "Total runs"}: ${runs.length}`);
      L.push(`- ${zh ? "總距離" : "Total distance"}: ${totalKm.toFixed(1)} km`);
      L.push(`- ${zh ? "總時間" : "Total time"}: ${fmtDur(totalSec)}`);
      L.push(`- ${zh ? "最長一課" : "Longest run"}: ${longest.toFixed(1)} km`);
      L.push(
        `- ${zh ? "紀錄範圍" : "Period"}: ${sorted[0]?.start_date?.slice(0, 10)} → ${sorted[sorted.length - 1]?.start_date?.slice(0, 10)}`,
      );
      L.push("");

      L.push(zh ? "## 所有跑步紀錄" : "## All runs");
      L.push(
        zh
          ? "| 日期 | 名稱 | 距離 (km) | 時間 | 配速 (/km) | 平均心率 | 爬升 (m) |"
          : "| Date | Name | Distance (km) | Time | Pace (/km) | Avg HR | Elev gain (m) |",
      );
      L.push("|---|---|---|---|---|---|---|");
      for (const a of runs) {
        const km = (a.distance || 0) / 1000;
        L.push(
          `| ${a.start_date?.slice(0, 10)} | ${(a.name || "").replace(/\|/g, "/")} | ${km.toFixed(2)} | ${fmtDur(a.moving_time || 0)} | ${fmtPace(a.average_speed)} | ${a.average_heartrate ? Math.round(a.average_heartrate) : "—"} | ${Math.round(a.total_elevation_gain || 0)} |`,
        );
      }
      L.push("");

      if (health && health.length > 0) {
        L.push(zh ? "## 每日健康數據" : "## Daily health");
        L.push(
          zh
            ? "| 日期 | 靜息心率 | HRV | 睡眠 (小時) | 睡眠分數 | 步數 | 卡路里 | VO2max |"
            : "| Date | Resting HR | HRV | Sleep (h) | Sleep score | Steps | Calories | VO2max |",
        );
        L.push("|---|---|---|---|---|---|---|---|");
        for (const h of health) {
          L.push(
            `| ${h.date} | ${h.resting_hr ?? "—"} | ${h.hrv ?? "—"} | ${h.sleep_seconds ? (h.sleep_seconds / 3600).toFixed(1) : "—"} | ${h.sleep_score ?? "—"} | ${h.steps ?? "—"} | ${h.calories ?? "—"} | ${h.vo2max ?? "—"} |`,
          );
        }
        L.push("");
      }

      L.push(
        zh
          ? "以上是我的完整跑步及健康數據。請根據這些數據回答我的問題、分析我的訓練。"
          : "The above is my complete running and health data. Please use it to answer my questions and analyse my training.",
      );

      const text = L.join("\n");
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `runward-data-${stamp}.md`;
      const blob = new Blob([text], { type: "text/markdown" });
      const result = await shareOrDownloadFile(blob, filename, "text/markdown", zh ? "RunWard 數據" : "RunWard data");

      toast.success(
        result === "shared"
          ? zh
            ? "已分享 — 選擇 ChatGPT、Claude 或 Gemini"
            : "Shared — pick ChatGPT, Claude or Gemini"
          : zh
            ? "已下載 — 把檔案上傳到你的 AI 聊天工具"
            : "Downloaded — upload the file to your AI chat",
        { id: tid, duration: 5000 },
      );
    } catch (err) {
      console.error("[ExportToAi]", err);
      toast.error(zh ? "匯出失敗，請再試一次" : "Export failed, please try again", { id: tid });
    }
    setRunning(false);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={running}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-primary border border-primary/30 hover:bg-primary/10 transition-colors disabled:opacity-60"
      title={zh ? "匯出全部數據給 AI 分析" : "Export all data for AI analysis"}
    >
      {running ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      {zh ? "匯出給 AI" : "Export to AI"}
    </button>
  );
};

export default ExportToAiButton;

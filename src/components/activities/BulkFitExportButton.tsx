import { useState } from "react";
import { Download, Lock, Loader2 } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { toast } from "sonner";
import JSZip from "jszip";
import { buildFitFile, fetchStravaStreams, fitFilenameFor, shareOrDownloadFile } from "@/lib/fitExport";
import type { StravaActivity } from "@/hooks/use-activities";

interface Props {
  lang: Lang;
  activities: StravaActivity[];
  isPremium: boolean;
}

const BulkFitExportButton = ({ lang, activities, isPremium }: Props) => {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Strava's API terms prohibit bulk export of Strava-sourced activities,
  // and we keep Garmin Connect / Apple Health out of bulk export too.
  // Only Terra-routed providers (Garmin/COROS/Polar/Zepp/Fitbit via Terra)
  // and native Suunto are eligible.
  const exportable = (activities || []).filter((a: any) => {
    const prov = (a.provenance || "").toLowerCase();
    return prov === "terra" || prov === "suunto";
  });

  const onClick = async () => {
    if (!isPremium) {
      toast.error(lang === "zh" ? "升級 Premium 以解鎖批量匯出" : "Upgrade to Premium for bulk export");
      return;
    }
    if (!exportable || exportable.length === 0) {
      toast.info(
        lang === "zh"
          ? "沒有可批量匯出的活動（僅支援 Terra、Suunto、Polar）"
          : "No exportable activities (Terra, Suunto, Polar only)",
      );
      return;
    }
    setRunning(true);
    setProgress({ done: 0, total: exportable.length });
    const zip = new JSZip();
    let failed = 0;
    const tid = "bulk-fit";
    toast.loading(
      lang === "zh"
        ? `準備匯出 ${exportable.length} 個活動...`
        : `Preparing ${exportable.length} activities...`,
      { id: tid },
    );

    // Concurrency-limited loop (3 at a time)
    const concurrency = 3;
    let idx = 0;
    let done = 0;
    const worker = async () => {
      while (idx < exportable.length) {
        const i = idx++;
        const a = exportable[i];
        try {
          let streams: any[] | null = null;
          const isStrava = a.provenance === "strava" && (a as any).strava_id && (a as any).strava_id > 0;
          if (isStrava) {
            streams = await fetchStravaStreams((a as any).strava_id);
          }
          const bytes = buildFitFile(
            {
              id: a.id,
              strava_id: (a as any).strava_id,
              name: a.name,
              sport_type: a.sport_type,
              distance: a.distance,
              moving_time: a.moving_time,
              elapsed_time: a.elapsed_time,
              total_elevation_gain: a.total_elevation_gain,
              start_date: a.start_date,
              average_speed: a.average_speed,
              max_speed: (a as any).max_speed ?? null,
              average_heartrate: a.average_heartrate ?? null,
              max_heartrate: (a as any).max_heartrate ?? null,
              source: a.source ?? null,
              provenance: a.provenance ?? null,
              summary_polyline: a.summary_polyline,
              hr_samples: a.hr_samples ?? null,
              distance_samples: (a as any).distance_samples ?? null,
              elevation_samples: (a as any).elevation_samples ?? null,
              cadence_samples: (a as any).cadence_samples ?? null,
            },
            streams,
          );
          zip.file(fitFilenameFor({
            id: a.id,
            name: a.name,
            start_date: a.start_date,
            distance: a.distance,
            moving_time: a.moving_time,
          }), bytes);
        } catch (err) {
          console.error("Bulk fit export failed for activity", a.id, err);
          failed++;
        }
        done++;
        setProgress({ done, total: exportable.length });
        toast.loading(
          lang === "zh"
            ? `匯出中 ${done}/${exportable.length}...`
            : `Exporting ${done}/${exportable.length}...`,
          { id: tid },
        );
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    try {
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `activities-${stamp}.zip`;
      const result = await shareOrDownloadFile(blob, filename, "application/zip", "Activities");
      toast.success(
        lang === "zh"
          ? `${result === "shared" ? "已分享" : "已匯出"} ${done - failed} 個活動${failed ? `（${failed} 個失敗）` : ""}`
          : `${result === "shared" ? "Shared" : "Exported"} ${done - failed} activities${failed ? ` (${failed} failed)` : ""}`,
        { id: tid },
      );
    } catch (err) {
      console.error(err);
      toast.error(lang === "zh" ? "建立 ZIP 失敗" : "Failed to build ZIP", { id: tid });
    }
    setRunning(false);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={running}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-primary border border-primary/30 hover:bg-primary/10 transition-colors disabled:opacity-60"
      title={isPremium
        ? (lang === "zh" ? "匯出全部為 .fit ZIP" : "Export all as .fit ZIP")
        : (lang === "zh" ? "Premium 功能" : "Premium feature")}
    >
      {running ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Download size={12} />
      )}
      {running
        ? `${progress.done}/${progress.total}`
        : (lang === "zh" ? "匯出全部 .fit" : "Export all .fit")}
      {!isPremium && <Lock size={10} className="text-muted-foreground" />}
    </button>
  );
};

export default BulkFitExportButton;

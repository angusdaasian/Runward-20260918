import { useRef, useState } from "react";
import { Upload, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
// @ts-ignore - no types for fit-file-parser
import FitParser from "fit-file-parser";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  onImported: () => void;
  embedded?: boolean;
}

interface ParsedLap {
  start_time: string;
  total_time_seconds: number;
  distance_meters: number;
  average_hr: number | null;
  max_hr: number | null;
  average_speed: number;
  average_pace: number;
}

interface ParsedFit {
  name: string;
  startDate: string;
  distanceMeters: number;
  movingTimeSec: number;
  elevationGain: number;
  avgSpeed: number;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  calories: number | null;
  polyline: string;
  laps: ParsedLap[];
}

function encodePolyline(points: Array<[number, number]>): string {
  let result = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of points) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    const dLat = latE5 - prevLat;
    const dLng = lngE5 - prevLng;
    prevLat = latE5;
    prevLng = lngE5;
    for (const v of [dLat, dLng]) {
      let val = v < 0 ? ~(v << 1) : v << 1;
      while (val >= 0x20) {
        result += String.fromCharCode((0x20 | (val & 0x1f)) + 63);
        val >>= 5;
      }
      result += String.fromCharCode(val + 63);
    }
  }
  return result;
}

function toIso(d: any): string {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

function parseFitBuffer(buffer: ArrayBuffer): Promise<ParsedFit> {
  return new Promise((resolve, reject) => {
    const fitParser = new FitParser({
      force: true,
      speedUnit: "m/s",
      lengthUnit: "m",
      temperatureUnit: "celsius",
      elapsedRecordField: true,
      mode: "list",
    });

    fitParser.parse(buffer, (error: any, data: any) => {
      if (error) {
        reject(new Error(typeof error === "string" ? error : error?.message || "Failed to parse FIT"));
        return;
      }

      try {
        const sessions = data.sessions || [];
        const session = sessions[0] || {};
        const records = data.records || [];
        const lapsRaw = data.laps || [];

        const startDate = toIso(session.start_time || records[0]?.timestamp);
        const movingTimeSec = Math.round(
          session.total_timer_time || session.total_elapsed_time || 0,
        );
        const distanceMeters = Math.round(session.total_distance || 0);
        const elevationGain = Math.round(session.total_ascent || 0);
        const avgSpeed = session.avg_speed || (movingTimeSec > 0 ? distanceMeters / movingTimeSec : 0);
        const avgHr = session.avg_heart_rate ? Math.round(session.avg_heart_rate) : null;
        const maxHr = session.max_heart_rate ? Math.round(session.max_heart_rate) : null;
        const cadenceRaw = session.avg_running_cadence || session.avg_cadence;
        const avgCadence = cadenceRaw ? Math.round(cadenceRaw * 2) : null;
        const calories = session.total_calories ? Math.round(session.total_calories) : null;
        const sport = session.sport || "running";

        const points: Array<[number, number]> = [];
        for (const r of records) {
          if (typeof r.position_lat === "number" && typeof r.position_long === "number") {
            points.push([r.position_lat, r.position_long]);
          }
        }

        const laps: ParsedLap[] = lapsRaw.map((l: any) => {
          const lapTime = l.total_timer_time || l.total_elapsed_time || 0;
          const lapDist = l.total_distance || 0;
          const lapSpeed = lapTime > 0 ? lapDist / lapTime : 0;
          return {
            start_time: toIso(l.start_time),
            total_time_seconds: Math.round(lapTime),
            distance_meters: Math.round(lapDist),
            average_hr: l.avg_heart_rate ? Math.round(l.avg_heart_rate) : null,
            max_hr: l.max_heart_rate ? Math.round(l.max_heart_rate) : null,
            average_speed: lapSpeed,
            average_pace: lapSpeed > 0 ? 1000 / lapSpeed : 0,
          };
        });

        if (movingTimeSec < 1) {
          reject(new Error("No duration found in FIT"));
          return;
        }

        const name = `COROS ${sport.charAt(0).toUpperCase()}${sport.slice(1)}`;

        resolve({
          name,
          startDate,
          distanceMeters,
          movingTimeSec,
          elevationGain,
          avgSpeed,
          avgHr,
          maxHr,
          avgCadence,
          calories,
          polyline: encodePolyline(points),
          laps,
        });
      } catch (e: any) {
        reject(new Error(e?.message || "Failed to extract FIT data"));
      }
    });
  });
}

const CorosFitImport = ({ lang, onImported, embedded = false }: Props) => {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseFitBuffer(buffer);

      const externalId = `coros-${parsed.startDate}-${parsed.distanceMeters}`;

      const { data: existing } = await supabase
        .from("garmin_activities")
        .select("id")
        .eq("user_id", user.id)
        .eq("garmin_activity_id", externalId)
        .maybeSingle();

      if (existing) {
        toast.error(lang === "zh" ? "此活動已匯入過" : "This activity was already imported");
        setLoading(false);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }

      const { error: insertErr } = await supabase.from("garmin_activities").insert([{
        user_id: user.id,
        garmin_activity_id: externalId,
        activity_name: parsed.name,
        activity_type: "running",
        start_time: parsed.startDate,
        duration_seconds: parsed.movingTimeSec,
        distance_meters: parsed.distanceMeters,
        elevation_gain: parsed.elevationGain,
        average_speed: parsed.avgSpeed,
        average_pace: parsed.avgSpeed > 0 ? 1000 / parsed.avgSpeed : null,
        average_hr: parsed.avgHr,
        max_hr: parsed.maxHr,
        avg_cadence: parsed.avgCadence,
        calories: parsed.calories,
        has_gps: parsed.polyline.length > 0,
        has_details: true,
        summary_polyline: parsed.polyline || null,
        laps: parsed.laps as any,
      }]);

      if (insertErr) throw insertErr;

      toast.success(
        lang === "zh"
          ? `已匯入 ${(parsed.distanceMeters / 1000).toFixed(2)} km · ${parsed.laps.length} 段`
          : `Imported ${(parsed.distanceMeters / 1000).toFixed(2)} km · ${parsed.laps.length} splits`,
      );
      setExpanded(false);
      onImported();
    } catch (err: any) {
      console.error("COROS FIT import error:", err);
      toast.error(
        lang === "zh"
          ? `匯入失敗：${err?.message || "未知錯誤"}`
          : `Import failed: ${err?.message || "unknown error"}`,
      );
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const formBody = (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {lang === "zh"
          ? "在 COROS App 中分享活動 → 匯出為 FIT → 儲存到「檔案」。然後在這裡選擇該 FIT 檔案，我們會擷取距離、時間、配速、爬升、心率、步頻、卡路里、路線地圖以及每段分割。"
          : "In the COROS app: share activity → export as FIT → save to Files. Then pick that FIT file here. We'll extract distance, time, pace, elevation, HR, cadence, calories, route map, and per-lap splits."}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".fit,application/octet-stream"
        onChange={handleFileSelected}
        disabled={loading}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium px-3 py-2 rounded-lg text-primary-foreground bg-primary disabled:opacity-50"
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {loading
          ? (lang === "zh" ? "匯入中..." : "Importing...")
          : (lang === "zh" ? "選擇 FIT 檔案" : "Choose FIT File")}
      </button>
    </div>
  );

  if (embedded) return formBody;

  return (
    <div className="bg-card border border-border rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Upload size={18} className="text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {lang === "zh" ? "匯入 COROS 活動 (FIT)" : "Import COROS Activity (FIT)"}
            </div>
            <div className="text-xs text-muted-foreground">
              {lang === "zh" ? "包含分段、配速、心率、步頻、路線" : "Includes splits, pace, HR, cadence, route"}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          {formBody}
        </div>
      )}
    </div>
  );
};

export default CorosFitImport;

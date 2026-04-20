import { useRef, useState } from "react";
import { Upload, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  onImported: () => void;
}

interface ParsedLap {
  start_time: string;
  total_time_seconds: number;
  distance_meters: number;
  average_hr: number | null;
  max_hr: number | null;
  average_speed: number; // m/s
  average_pace: number; // s/km
}

interface ParsedTcx {
  name: string;
  startDate: string;
  distanceMeters: number;
  movingTimeSec: number;
  elevationGain: number;
  avgSpeed: number;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  polyline: string;
  laps: ParsedLap[];
}

// Encode lat/lng pairs into Google encoded polyline format
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

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function textOf(parent: Element | null | undefined, tag: string): string | null {
  if (!parent) return null;
  const el = parent.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() || null;
}

function parseTcx(xmlText: string): ParsedTcx {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserErr = doc.querySelector("parsererror");
  if (parserErr) throw new Error("Invalid TCX file");

  const activity = doc.getElementsByTagName("Activity")[0];
  if (!activity) throw new Error("No Activity element found");

  const startDate = textOf(activity, "Id") || new Date().toISOString();
  const sportAttr = activity.getAttribute("Sport") || "Running";

  const lapEls = Array.from(activity.getElementsByTagName("Lap"));
  const laps: ParsedLap[] = [];

  const allPoints: Array<[number, number]> = [];
  const allElevations: number[] = [];
  const allHrValues: number[] = [];
  const allCadenceValues: number[] = [];

  let totalTime = 0;
  let totalDistance = 0;

  for (const lap of lapEls) {
    const lapStart = lap.getAttribute("StartTime") || startDate;
    const lapTime = parseFloat(textOf(lap, "TotalTimeSeconds") || "0");
    const lapDist = parseFloat(textOf(lap, "DistanceMeters") || "0");
    const lapAvgHr = parseFloat(
      lap.getElementsByTagName("AverageHeartRateBpm")[0]?.getElementsByTagName("Value")[0]?.textContent || "",
    );
    const lapMaxHr = parseFloat(
      lap.getElementsByTagName("MaximumHeartRateBpm")[0]?.getElementsByTagName("Value")[0]?.textContent || "",
    );

    totalTime += lapTime;
    totalDistance += lapDist;

    const lapSpeed = lapTime > 0 ? lapDist / lapTime : 0;
    const lapPace = lapSpeed > 0 ? 1000 / lapSpeed : 0;

    laps.push({
      start_time: lapStart,
      total_time_seconds: Math.round(lapTime),
      distance_meters: Math.round(lapDist),
      average_hr: isFinite(lapAvgHr) && lapAvgHr > 0 ? Math.round(lapAvgHr) : null,
      max_hr: isFinite(lapMaxHr) && lapMaxHr > 0 ? Math.round(lapMaxHr) : null,
      average_speed: lapSpeed,
      average_pace: lapPace,
    });

    const tps = Array.from(lap.getElementsByTagName("Trackpoint"));
    for (const tp of tps) {
      const pos = tp.getElementsByTagName("Position")[0];
      if (pos) {
        const lat = parseFloat(textOf(pos, "LatitudeDegrees") || "");
        const lng = parseFloat(textOf(pos, "LongitudeDegrees") || "");
        if (isFinite(lat) && isFinite(lng)) {
          allPoints.push([lat, lng]);
        }
      }
      const ele = parseFloat(textOf(tp, "AltitudeMeters") || "");
      if (isFinite(ele)) allElevations.push(ele);

      const hrEl = tp.getElementsByTagName("HeartRateBpm")[0];
      const hrVal = hrEl ? parseFloat(hrEl.getElementsByTagName("Value")[0]?.textContent || "") : NaN;
      if (isFinite(hrVal) && hrVal > 0) allHrValues.push(hrVal);

      const cad = parseFloat(textOf(tp, "Cadence") || "");
      if (isFinite(cad) && cad > 0) allCadenceValues.push(cad);
    }
  }

  if (totalTime < 1) throw new Error("No duration found in TCX");

  let elevationGain = 0;
  for (let i = 1; i < allElevations.length; i++) {
    const diff = allElevations[i] - allElevations[i - 1];
    if (diff > 0) elevationGain += diff;
  }

  if (totalDistance === 0 && allPoints.length >= 2) {
    for (let i = 1; i < allPoints.length; i++) {
      totalDistance += haversine(allPoints[i - 1][0], allPoints[i - 1][1], allPoints[i][0], allPoints[i][1]);
    }
  }

  const avgSpeed = totalDistance / totalTime;
  const avgHr = allHrValues.length > 0 ? allHrValues.reduce((a, b) => a + b, 0) / allHrValues.length : null;
  const maxHr = allHrValues.length > 0 ? Math.max(...allHrValues) : null;
  const avgCadence = allCadenceValues.length > 0 ? allCadenceValues.reduce((a, b) => a + b, 0) / allCadenceValues.length : null;

  const creatorName = textOf(activity.getElementsByTagName("Creator")[0], "Name");
  const name = creatorName ? `${sportAttr} - ${creatorName}` : `COROS ${sportAttr}`;

  return {
    name,
    startDate,
    distanceMeters: Math.round(totalDistance),
    movingTimeSec: Math.round(totalTime),
    elevationGain: Math.round(elevationGain),
    avgSpeed,
    avgHr: avgHr ? Math.round(avgHr) : null,
    maxHr: maxHr ? Math.round(maxHr) : null,
    avgCadence: avgCadence ? Math.round(avgCadence) : null,
    polyline: encodePolyline(allPoints),
    laps,
  };
}

const CorosTcxImport = ({ lang, onImported }: Props) => {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setLoading(true);
    try {
      const text = await file.text();
      const parsed = parseTcx(text);

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

      const { error: insertErr } = await supabase.from("garmin_activities").insert({
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
        has_gps: parsed.polyline.length > 0,
        has_details: true,
        summary_polyline: parsed.polyline || null,
        laps: parsed.laps,
      });

      if (insertErr) throw insertErr;

      toast.success(
        lang === "zh"
          ? `已匯入 ${(parsed.distanceMeters / 1000).toFixed(2)} km · ${parsed.laps.length} 段`
          : `Imported ${(parsed.distanceMeters / 1000).toFixed(2)} km · ${parsed.laps.length} splits`,
      );
      setExpanded(false);
      onImported();
    } catch (err: any) {
      console.error("COROS TCX import error:", err);
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
              {lang === "zh" ? "匯入 COROS 活動 (TCX)" : "Import COROS Activity (TCX)"}
            </div>
            <div className="text-xs text-muted-foreground">
              {lang === "zh" ? "包含每公里分段、配速、心率、路線" : "Includes splits, pace, HR, and route"}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? "在 COROS App 中分享活動 → 匯出為 TCX → 儲存到「檔案」。然後在這裡選擇該 TCX 檔案，我們會擷取距離、時間、配速、爬升、心率、路線地圖以及每段分割。"
              : "In the COROS app: share activity → export as TCX → save to Files. Then pick that TCX file here. We'll extract distance, time, pace, elevation, heart rate, route map, and per-lap splits."}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".tcx,application/vnd.garmin.tcx+xml,application/xml,text/xml"
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
              : (lang === "zh" ? "選擇 TCX 檔案" : "Choose TCX File")}
          </button>
        </div>
      )}
    </div>
  );
};

export default CorosTcxImport;

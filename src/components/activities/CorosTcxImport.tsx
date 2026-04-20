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

interface ParsedGpx {
  name: string;
  startDate: string;
  distanceMeters: number;
  movingTimeSec: number;
  elevationGain: number;
  avgSpeed: number;
  avgHr: number | null;
  maxHr: number | null;
  polyline: string;
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

function parseGpx(xmlText: string): ParsedGpx {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserErr = doc.querySelector("parsererror");
  if (parserErr) throw new Error("Invalid GPX file");

  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  if (trkpts.length === 0) throw new Error("No track points found in GPX");

  const points: Array<[number, number]> = [];
  const times: Date[] = [];
  const elevations: number[] = [];
  const hrValues: number[] = [];

  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute("lat") || "");
    const lng = parseFloat(pt.getAttribute("lon") || "");
    if (!isFinite(lat) || !isFinite(lng)) continue;
    points.push([lat, lng]);

    const eleEl = pt.getElementsByTagName("ele")[0];
    if (eleEl?.textContent) elevations.push(parseFloat(eleEl.textContent));

    const timeEl = pt.getElementsByTagName("time")[0];
    if (timeEl?.textContent) times.push(new Date(timeEl.textContent));

    const hrEl = pt.getElementsByTagName("gpxtpx:hr")[0] || pt.getElementsByTagName("hr")[0];
    if (hrEl?.textContent) {
      const hr = parseFloat(hrEl.textContent);
      if (isFinite(hr) && hr > 0) hrValues.push(hr);
    }
  }

  if (points.length < 2) throw new Error("Not enough GPS points");

  // Distance
  let distanceMeters = 0;
  for (let i = 1; i < points.length; i++) {
    distanceMeters += haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }

  // Time
  const startDate = times[0] || new Date();
  const endDate = times[times.length - 1] || startDate;
  const movingTimeSec = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 1000));

  // Elevation gain
  let elevationGain = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) elevationGain += diff;
  }

  const avgSpeed = distanceMeters / movingTimeSec;
  const avgHr = hrValues.length > 0 ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : null;
  const maxHr = hrValues.length > 0 ? Math.max(...hrValues) : null;

  // Track name
  const nameEl = doc.querySelector("trk > name") || doc.querySelector("metadata > name");
  const name = nameEl?.textContent?.trim() || "COROS Activity";

  return {
    name,
    startDate: startDate.toISOString(),
    distanceMeters: Math.round(distanceMeters),
    movingTimeSec,
    elevationGain: Math.round(elevationGain),
    avgSpeed,
    avgHr: avgHr ? Math.round(avgHr) : null,
    maxHr: maxHr ? Math.round(maxHr) : null,
    polyline: encodePolyline(points),
  };
}

const CorosGpxImport = ({ lang, onImported }: Props) => {
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
      const parsed = parseGpx(text);

      // Insert into garmin_activities (reusing the table since COROS exports same GPX format).
      // Use a deterministic id based on filename + start to detect duplicates.
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
        has_gps: true,
        has_details: true,
        summary_polyline: parsed.polyline,
      });

      if (insertErr) throw insertErr;

      toast.success(
        lang === "zh"
          ? `已匯入 ${(parsed.distanceMeters / 1000).toFixed(2)} km`
          : `Imported ${(parsed.distanceMeters / 1000).toFixed(2)} km`,
      );
      setExpanded(false);
      onImported();
    } catch (err: any) {
      console.error("COROS GPX import error:", err);
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
              {lang === "zh" ? "匯入 COROS 活動 (GPX)" : "Import COROS Activity (GPX)"}
            </div>
            <div className="text-xs text-muted-foreground">
              {lang === "zh" ? "從檔案選擇 GPX 檔案" : "Pick a GPX file from your device"}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? "在 COROS App 中分享活動 → 匯出為 GPX → 儲存到「檔案」。然後在這裡選擇該 GPX 檔案，我們會擷取距離、時間、配速、爬升、心率與路線地圖。"
              : "In the COROS app: share activity → export as GPX → save to Files. Then pick that GPX file here. We'll extract distance, time, pace, elevation, heart rate and the route map."}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
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
              : (lang === "zh" ? "選擇 GPX 檔案" : "Choose GPX File")}
          </button>
        </div>
      )}
    </div>
  );
};

export default CorosGpxImport;

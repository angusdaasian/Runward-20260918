// Fetch a Suunto workout FIT file and parse out per-sample streams + polyline.
import FitParser from "npm:fit-file-parser@1.20.1";
import { SUUNTO_API_BASE } from "./suunto.ts";

type LatLng = [number, number];

// Standard Google encoded polyline algorithm.
function encodePolyline(points: LatLng[]): string {
  let prevLat = 0, prevLng = 0;
  let out = "";
  const encode = (v: number) => {
    v = v < 0 ? ~(v << 1) : (v << 1);
    let s = "";
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    s += String.fromCharCode(v + 63);
    return s;
  };
  for (const [lat, lng] of points) {
    const lat5 = Math.round(lat * 1e5);
    const lng5 = Math.round(lng * 1e5);
    out += encode(lat5 - prevLat) + encode(lng5 - prevLng);
    prevLat = lat5; prevLng = lng5;
  }
  return out;
}

function downsample<T>(arr: T[], maxLen: number): T[] {
  if (arr.length <= maxLen) return arr;
  const step = arr.length / maxLen;
  const out: T[] = [];
  for (let i = 0; i < maxLen; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

export type FitDetails = {
  hr_samples: { t: number; bpm: number }[] | null;
  distance_samples: { t: number; d: number }[] | null;
  elevation_samples: { t: number; ele: number }[] | null;
  cadence_samples: { t: number; rpm: number }[] | null;
  summary_polyline: string | null;
  has_gps: boolean;
};

export async function fetchSuuntoFit(
  accessToken: string,
  subKey: string,
  workoutKey: string,
): Promise<ArrayBuffer | null> {
  const url = `${SUUNTO_API_BASE}/workout/exportFit/${workoutKey}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Ocp-Apim-Subscription-Key": subKey,
    },
  });
  if (!res.ok) {
    console.error("[suunto-fit] fetch failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  return await res.arrayBuffer();
}

export function parseFit(buffer: ArrayBuffer): Promise<FitDetails> {
  return new Promise((resolve) => {
    try {
      const parser = new (FitParser as any)({
        force: true,
        speedUnit: "m/s",
        lengthUnit: "m",
        temperatureUnit: "celsius",
        elapsedRecordField: false,
        mode: "list",
      });
      const u8 = new Uint8Array(buffer);
      parser.parse(u8, (err: any, data: any) => {
        if (err) {
          console.error("[suunto-fit] parse error", err);
          resolve({
            hr_samples: null, distance_samples: null,
            elevation_samples: null, cadence_samples: null,
            summary_polyline: null, has_gps: false,
          });
          return;
        }
        const records: any[] = Array.isArray(data?.records) ? data.records : [];
        if (records.length === 0) {
          resolve({
            hr_samples: null, distance_samples: null,
            elevation_samples: null, cadence_samples: null,
            summary_polyline: null, has_gps: false,
          });
          return;
        }
        const start = new Date(records[0].timestamp).getTime();
        const hr: { t: number; bpm: number }[] = [];
        const dist: { t: number; d: number }[] = [];
        const ele: { t: number; ele: number }[] = [];
        const cad: { t: number; rpm: number }[] = [];
        const latlngs: LatLng[] = [];

        for (const r of records) {
          const ts = new Date(r.timestamp).getTime();
          if (!isFinite(ts)) continue;
          const t = Math.max(0, Math.round((ts - start) / 1000));
          if (typeof r.heart_rate === "number") hr.push({ t, bpm: r.heart_rate });
          if (typeof r.distance === "number") dist.push({ t, d: r.distance });
          if (typeof r.altitude === "number") ele.push({ t, ele: r.altitude });
          else if (typeof r.enhanced_altitude === "number") ele.push({ t, ele: r.enhanced_altitude });
          if (typeof r.cadence === "number") cad.push({ t, rpm: r.cadence });
          const lat = r.position_lat;
          const lng = r.position_long;
          if (typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0)) {
            latlngs.push([lat, lng]);
          }
        }

        const polyPoints = downsample(latlngs, 300);
        const polyline = polyPoints.length > 1 ? encodePolyline(polyPoints) : null;

        resolve({
          hr_samples: hr.length ? downsample(hr, 1000) : null,
          distance_samples: dist.length ? downsample(dist, 1000) : null,
          elevation_samples: ele.length ? downsample(ele, 1000) : null,
          cadence_samples: cad.length ? downsample(cad, 1000) : null,
          summary_polyline: polyline,
          has_gps: latlngs.length > 0,
        });
      });
    } catch (e) {
      console.error("[suunto-fit] parse exception", e);
      resolve({
        hr_samples: null, distance_samples: null,
        elevation_samples: null, cadence_samples: null,
        summary_polyline: null, has_gps: false,
      });
    }
  });
}

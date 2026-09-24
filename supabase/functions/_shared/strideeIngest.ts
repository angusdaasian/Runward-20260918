// Shared Stridee activity ingestion (used by stridee-sync and stridee-webhook).
import FitParserModule from "npm:fit-file-parser@1.21.0";
import { strideeFetch } from "./stridee.ts";

const MAX_SAMPLES = 1200;

// fit-file-parser is published as transpiled CommonJS with `exports.default`.
// Deno's npm interop therefore returns either the constructor itself or a
// module object containing it, depending on the edge-runtime version.
const FitParser = ((FitParserModule as unknown as { default?: unknown }).default
  ?? FitParserModule) as new (options: Record<string, unknown>) => {
    parse: (content: ArrayBuffer, callback: (error: unknown, data: unknown) => void) => void;
  };

function encodePolyline(points: Array<[number, number]>): string {
  let out = "", pLat = 0, pLng = 0;
  const enc = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const a = Math.round(lat * 1e5), b = Math.round(lng * 1e5);
    out += enc(a - pLat) + enc(b - pLng); pLat = a; pLng = b;
  }
  return out;
}

function downsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}

export function parseFit(buf: ArrayBuffer): Promise<any> {
  return new Promise((resolve, reject) => {
    const p = new FitParser({ force: true, speedUnit: "m/s", lengthUnit: "m", mode: "list" });
    p.parse(buf, (err: unknown, data: unknown) => (err ? reject(err) : resolve(data)));
  });
}

export async function downloadFile(fileUrl: string): Promise<ArrayBuffer | null> {
  const path = fileUrl.replace("https://api.stridee.com", "");
  const res = await strideeFetch("GET", path, undefined, { redirect: "manual" });
  let final: Response = res;
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) return null;
    final = await fetch(loc);
  }
  if (!final.ok) { console.error("[stridee-sync] file", final.status); return null; }
  return await final.arrayBuffer();
}

export function mapActivity(a: any, fit: any) {
  const session = fit?.sessions?.[0] ?? {};
  const records: any[] = fit?.records ?? [];
  const t0 = records[0]?.timestamp ? new Date(records[0].timestamp).getTime() : 0;
  const sportRaw = String(a.sport ?? session.sport ?? "running").toLowerCase();
  // FIT running cadence is per-leg (strides/min); double to steps/min like Garmin Connect.
  const cadMul = /run|walk|hik/.test(sportRaw) ? 2 : 1;
  const cadOf = (c: any, frac?: any) => typeof c === "number" ? Math.round((c + (typeof frac === "number" ? frac : 0)) * cadMul) : null;
  const rel = (r: any) => Math.round((new Date(r.timestamp).getTime() - t0) / 1000);
  const hr: any[] = [], dist: any[] = [], elev: any[] = [], cad: any[] = [], pts: Array<[number, number]> = [];
  for (const r of records) {
    if (!r.timestamp) continue;
    const t = rel(r);
    if (typeof r.heart_rate === "number") hr.push({ t, bpm: r.heart_rate });
    if (typeof r.distance === "number") dist.push({ t, d: Math.round(r.distance * 10) / 10 });
    const alt = r.enhanced_altitude ?? r.altitude;
    if (typeof alt === "number") elev.push({ t, e: Math.round(alt * 10) / 10 });
    if (typeof r.cadence === "number") cad.push({ t, rpm: cadOf(r.cadence, r.fractional_cadence) });
    if (typeof r.position_lat === "number" && typeof r.position_long === "number") pts.push([r.position_lat, r.position_long]);
  }
  const laps = (fit?.laps ?? []).map((l: any, i: number) => ({
    lap_index: i + 1,
    distance: l.total_distance ?? null,
    elapsed_time: l.total_elapsed_time != null ? Math.round(l.total_elapsed_time) : null,
    moving_time: l.total_timer_time != null ? Math.round(l.total_timer_time) : null,
    average_heartrate: l.avg_heart_rate ?? null,
    max_heartrate: l.max_heart_rate ?? null,
    average_cadence: cadOf(l.avg_cadence, l.avg_fractional_cadence),
  }));
  const sport = String(a.sport ?? session.sport ?? "running").toLowerCase();
  return {
    terra_activity_id: `stridee_${a.id}`,
    provider: "GARMIN",
    activity_name: a.name ?? null,
    activity_type: sport === "run" ? "running" : sport,
    start_time: a.start_time ?? session.start_time ?? null,
    device_model: a.device ?? null,
    distance_meters: session.total_distance ?? null,
    duration_seconds: session.total_timer_time != null ? Math.round(session.total_timer_time) : null,
    average_hr: session.avg_heart_rate ?? null,
    max_hr: session.max_heart_rate ?? null,
    average_speed: session.enhanced_avg_speed ?? session.avg_speed ?? null,
    avg_cadence: cadOf(session.avg_cadence, session.avg_fractional_cadence),
    elevation_gain: session.total_ascent ?? null,
    calories: session.total_calories ?? null,
    has_gps: pts.length > 0,
    summary_polyline: pts.length > 1 ? encodePolyline(downsample(pts, 600)) : null,
    laps,
    hr_samples: hr.length ? downsample(hr, MAX_SAMPLES) : null,
    distance_samples: dist.length ? downsample(dist, MAX_SAMPLES) : null,
    elevation_samples: elev.length ? downsample(elev, MAX_SAMPLES) : null,
    cadence_samples: cad.length ? downsample(cad, MAX_SAMPLES) : null,
    raw_json: { cadence_spm: true, source: "stridee", stridee_activity_id: a.id, provider_activity_id: a.provider_activity_id, received_at: a.received_at },
  };
}


// Downloads + parses the FIT and upserts one activity. Throws on FIT failure.
export async function ingestStrideeActivity(admin: any, uid: string, a: any) {
  let fit: any = null;
  if (a.file?.url) {
    const buf = await downloadFile(a.file.url);
    if (!buf) throw new Error("FIT download returned no data");
    fit = await parseFit(buf);
  }
  const row = { user_id: uid, ...mapActivity(a, fit) };
  const { error } = await admin.from("terra_activities").upsert(row, { onConflict: "user_id,terra_activity_id" });
  if (error) throw error;
}

export async function isPremium(admin: any, uid: string): Promise<boolean> {
  const { data } = await admin.from("premium_subscriptions").select("expires_at").eq("user_id", uid).maybeSingle();
  return !!data && new Date(data.expires_at) > new Date();
}

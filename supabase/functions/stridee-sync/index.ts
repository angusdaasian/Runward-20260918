// Pulls Garmin activities granted via Stridee (GET /v1/activities), parses the
// FIT recording and upserts into terra_activities (provider GARMIN) so they
// show with the existing Garmin attribution. Called by cron every 5 minutes.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import FitParserModule from "npm:fit-file-parser@1.21.0";
import { strideeFetch } from "../_shared/stridee.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_PER_RUN = 15;
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

function parseFit(buf: ArrayBuffer): Promise<any> {
  return new Promise((resolve, reject) => {
    const p = new FitParser({ force: true, speedUnit: "m/s", lengthUnit: "m", mode: "list" });
    p.parse(buf, (err: unknown, data: unknown) => (err ? reject(err) : resolve(data)));
  });
}

async function downloadFile(fileUrl: string): Promise<ArrayBuffer | null> {
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

function mapActivity(a: any, fit: any) {
  const session = fit?.sessions?.[0] ?? {};
  const records: any[] = fit?.records ?? [];
  const t0 = records[0]?.timestamp ? new Date(records[0].timestamp).getTime() : 0;
  const rel = (r: any) => Math.round((new Date(r.timestamp).getTime() - t0) / 1000);
  const hr: any[] = [], dist: any[] = [], elev: any[] = [], cad: any[] = [], pts: Array<[number, number]> = [];
  for (const r of records) {
    if (!r.timestamp) continue;
    const t = rel(r);
    if (typeof r.heart_rate === "number") hr.push({ t, bpm: r.heart_rate });
    if (typeof r.distance === "number") dist.push({ t, d: Math.round(r.distance * 10) / 10 });
    const alt = r.enhanced_altitude ?? r.altitude;
    if (typeof alt === "number") elev.push({ t, e: Math.round(alt * 10) / 10 });
    if (typeof r.cadence === "number") cad.push({ t, rpm: r.cadence });
    if (typeof r.position_lat === "number" && typeof r.position_long === "number") pts.push([r.position_lat, r.position_long]);
  }
  const laps = (fit?.laps ?? []).map((l: any, i: number) => ({
    lap_index: i + 1,
    distance: l.total_distance ?? null,
    elapsed_time: l.total_elapsed_time != null ? Math.round(l.total_elapsed_time) : null,
    moving_time: l.total_timer_time != null ? Math.round(l.total_timer_time) : null,
    average_heartrate: l.avg_heart_rate ?? null,
    max_heartrate: l.max_heart_rate ?? null,
    average_cadence: l.avg_cadence ?? null,
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
    avg_cadence: session.avg_cadence ?? null,
    elevation_gain: session.total_ascent ?? null,
    calories: session.total_calories ?? null,
    has_gps: pts.length > 0,
    summary_polyline: pts.length > 1 ? encodePolyline(downsample(pts, 600)) : null,
    laps,
    hr_samples: hr.length ? downsample(hr, MAX_SAMPLES) : null,
    distance_samples: dist.length ? downsample(dist, MAX_SAMPLES) : null,
    elevation_samples: elev.length ? downsample(elev, MAX_SAMPLES) : null,
    cadence_samples: cad.length ? downsample(cad, MAX_SAMPLES) : null,
    raw_json: { source: "stridee", stridee_activity_id: a.id, provider_activity_id: a.provider_activity_id, received_at: a.received_at },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: state } = await admin.from("stridee_sync_state").select("last_received_at").eq("id", "global").maybeSingle();
    const since = state?.last_received_at ?? new Date(Date.now() - 90 * 86400_000).toISOString();
    const until = new Date().toISOString();

    const all: any[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const qs = new URLSearchParams({ since, until, limit: "200" });
      if (cursor) qs.set("starting_after", cursor);
      const res = await strideeFetch("GET", `/v1/activities?${qs}`);
      const text = await res.text();
      if (!res.ok) { console.error("[stridee-sync] list", res.status, text); return json({ error: "list failed", status: res.status, detail: text.slice(0, 500) }, 502); }
      const body = JSON.parse(text);
      all.push(...(body.activities ?? []));
      cursor = body.has_more ? body.next_starting_after : undefined;
      if (!cursor) break;
    }
    // Oldest first so the bookmark only moves forward.
    all.sort((x, y) => String(x.received_at).localeCompare(String(y.received_at)));
    const batch = all.slice(0, MAX_PER_RUN);

    let stored = 0, skipped = 0;
    let lastReceived = state?.last_received_at ?? null;
    for (const a of batch) {
      const uid = a.external_user_id;
      if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) { skipped++; continue; }
      let fit: any = null;
      if (a.file?.url) {
        try {
          const buf = await downloadFile(a.file.url);
          if (!buf) throw new Error("FIT download returned no data");
          fit = await parseFit(buf);
        } catch (e) {
          // Never store a hollow activity or move the bookmark past a failed
          // FIT file. A later sync can safely retry the same activity.
          console.error("[stridee-sync] fit parse", a.id, e);
          return json({ error: "FIT parsing failed", activity_id: a.id, stored, skipped }, 502);
        }
      }
      const row = { user_id: uid, ...mapActivity(a, fit) };
      const { error } = await admin.from("terra_activities").upsert(row, { onConflict: "user_id,terra_activity_id" });
      if (error) { console.error("[stridee-sync] upsert", error); skipped++; continue; }
      stored++;
      lastReceived = a.received_at ?? lastReceived;
      await admin.from("stridee_connections").update({ last_synced_at: new Date().toISOString(), status: "connected" }).eq("user_id", uid);
    }
    // Only jump to `until` when everything in the window was processed.
    const nextBookmark = all.length > batch.length ? lastReceived : until;
    await admin.from("stridee_sync_state").upsert({ id: "global", last_received_at: nextBookmark, updated_at: new Date().toISOString() });
    return json({ found: all.length, stored, skipped, remaining: all.length - batch.length });
  } catch (e) {
    console.error("[stridee-sync]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

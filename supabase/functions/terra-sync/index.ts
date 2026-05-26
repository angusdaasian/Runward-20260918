import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";
import { ingestTrustedTerraPayload } from "../_shared/terraWebhookHandler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function encodePolyline(points: Array<[number, number]>): string {
  let lastLat = 0, lastLng = 0, result = "";
  const encode = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    s += String.fromCharCode(v + 63);
    return s;
  };
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    result += encode(iLat - lastLat) + encode(iLng - lastLng);
    lastLat = iLat;
    lastLng = iLng;
  }
  return result;
}

function extractGpsPoints(a: any): Array<[number, number]> {
  const samples = a?.position_data?.position_samples ?? a?.position_data?.coords_samples ?? a?.gps_data?.samples ?? [];
  const pts: Array<[number, number]> = [];
  if (!Array.isArray(samples)) return pts;
  for (const s of samples) {
    const ll = s?.coords_lat_lng_deg;
    const lat = Array.isArray(ll) ? ll[0] : s?.coords?.latitude ?? s?.latitude ?? s?.lat;
    const lng = Array.isArray(ll) ? ll[1] : s?.coords?.longitude ?? s?.longitude ?? s?.lng ?? s?.lon;
    if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) pts.push([lat, lng]);
  }
  return pts;
}

function extractPolyline(a: any): string | null {
  const pre = a?.polyline_map_data?.summary_polyline;
  if (typeof pre === "string" && pre.length > 0) return pre;
  const pts = extractGpsPoints(a);
  return pts.length > 1 ? encodePolyline(pts) : null;
}

function extractElevationSamples(a: any): Array<{ timestampMs: number | null; timerSeconds: number | null; elevMeters: number }> {
  const samples = a?.distance_data?.detailed?.elevation_samples ?? a?.distance_data?.elevation_samples ?? [];
  if (!Array.isArray(samples)) return [];
  return samples
    .map((s: any) => {
      const timestampMs = s?.timestamp ? new Date(s.timestamp).getTime() : NaN;
      const elevMeters = toFiniteNumber(s?.elev_meters ?? s?.elevation_meters ?? s?.altitude_meters);
      return {
        timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
        timerSeconds: toFiniteNumber(s?.timer_duration_seconds),
        elevMeters: elevMeters ?? NaN,
      };
    })
    .filter((s: any) => Number.isFinite(s.elevMeters));
}

function computeElevationGain(samples: Array<{ elevMeters: number }>): number | null {
  if (samples.length < 2) return null;
  let gain = 0;
  for (let i = 1; i < samples.length; i++) {
    const diff = samples[i].elevMeters - samples[i - 1].elevMeters;
    if (diff > 0) gain += diff;
  }
  return Math.round(gain * 10) / 10;
}

function lapElevationGain(lap: any, elevationSamples: ReturnType<typeof extractElevationSamples>, activityStartTime?: string | null): number | null {
  if (elevationSamples.length < 2) return null;
  const startMs = lap?.start_time ? new Date(lap.start_time).getTime() : NaN;
  const endMs = lap?.end_time ? new Date(lap.end_time).getTime() : NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
    const byTimestamp = computeElevationGain(elevationSamples.filter((s) => s.timestampMs !== null && s.timestampMs >= startMs && s.timestampMs <= endMs));
    if (byTimestamp !== null) return byTimestamp;
  }

  const activityStartMs = activityStartTime ? new Date(activityStartTime).getTime() : NaN;
  if (!Number.isFinite(activityStartMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const startSeconds = (startMs - activityStartMs) / 1000;
  const endSeconds = (endMs - activityStartMs) / 1000;
  return computeElevationGain(elevationSamples.filter((s) => s.timerSeconds !== null && s.timerSeconds >= startSeconds && s.timerSeconds <= endSeconds));
}

function extractLaps(a: any): any[] {
  const rawLaps = a?.lap_data?.laps ?? a?.laps_data?.laps ?? a?.laps ?? [];
  if (!Array.isArray(rawLaps)) return [];
  const elevationSamples = extractElevationSamples(a);
  const activityStartTime = a?.metadata?.start_time ?? null;
  return rawLaps.map((l: any, idx: number) => ({
    lap_index: l?.lap_index ?? idx + 1,
    start_time: l?.start_time ?? null,
    end_time: l?.end_time ?? null,
    duration_seconds: l?.total_timer_time_seconds ?? l?.duration_seconds ?? l?.active_duration_seconds ?? null,
    distance_meters: l?.total_distance_meters ?? l?.distance_meters ?? null,
    avg_hr: l?.avg_hr_bpm ?? l?.average_hr_bpm ?? null,
    max_hr: l?.max_hr_bpm ?? null,
    avg_speed: l?.avg_speed_meters_per_second ?? l?.average_speed_meters_per_second ?? null,
    max_speed: l?.max_speed_meters_per_second ?? null,
    avg_cadence: l?.avg_cadence_rpm ?? l?.avg_cadence ?? null,
    calories: l?.total_calories ?? l?.calories ?? null,
    elevation_gain: l?.total_ascent_meters ?? l?.elevation_gain_meters ?? lapElevationGain(l, elevationSamples, activityStartTime),
  }));
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function secondsBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const seconds = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function extractDurationSeconds(a: any, distanceMeters?: number | null): number | null {
  const meta = a?.metadata ?? {};
  const duration = toFiniteNumber(a?.active_durations_data?.activity_seconds)
    ?? toFiniteNumber(a?.active_durations_data?.duration_activity_seconds)
    ?? toFiniteNumber(a?.active_durations_data?.active_seconds)
    ?? toFiniteNumber(meta?.active_duration_seconds)
    ?? secondsBetween(meta?.start_time, meta?.end_time);
  if (duration && duration > 0) return Math.round(duration);

  const speed = toFiniteNumber(a?.movement_data?.avg_speed_meters_per_second);
  if (distanceMeters && distanceMeters > 0 && speed && speed > 0) {
    return Math.round(distanceMeters / speed);
  }
  return null;
}

function extractHrSamples(a: any): Array<{ t: number; bpm: number }> {
  const hrd = a?.heart_rate_data ?? {};
  const sources: any[] = [
    hrd?.detailed?.hr_samples,
    hrd?.detailed?.hr_samples_data,
    hrd?.detailed?.heart_rate_samples,
    hrd?.detailed?.samples,
    hrd?.samples,
    hrd?.hr_samples,
    a?.hr_data?.samples,
    a?.heart_rate_samples,
  ];
  const samples = sources.find((s) => Array.isArray(s) && s.length > 0) ?? findHrSampleArray(a);
  if (!samples) {
    try {
      console.log("[terra-sync] no hr samples; heart_rate_data keys =", JSON.stringify(Object.keys(hrd ?? {})));
      if (hrd?.detailed) console.log("[terra-sync] detailed keys =", JSON.stringify(Object.keys(hrd.detailed)));
      console.log("[terra-sync] activity top-level keys =", JSON.stringify(Object.keys(a ?? {})));
    } catch {}
    return [];
  }
  console.log(`[terra-sync] hr samples found: ${samples.length}, first =`, JSON.stringify(samples[0]).slice(0, 300));
  const startMs = a?.metadata?.start_time ? new Date(a.metadata.start_time).getTime() : NaN;
  const bySecond = new Map<number, number>();
  for (const s of samples as any[]) {
    const bpm = toFiniteNumber(s?.bpm ?? s?.heart_rate_bpm ?? s?.heart_rate ?? s?.value);
    if (bpm == null || bpm <= 0) continue;
    let t: number | null = toFiniteNumber(s?.timer_duration_seconds ?? s?.timer_seconds ?? s?.elapsed_seconds);
    if (t == null && s?.timestamp && Number.isFinite(startMs)) {
      t = (new Date(s.timestamp).getTime() - startMs) / 1000;
    }
    if (t == null && s?.start_time && Number.isFinite(startMs)) {
      t = (new Date(s.start_time).getTime() - startMs) / 1000;
    }
    if (t == null || !Number.isFinite(t) || t < 0) continue;
    bySecond.set(Math.floor(t), Math.round(bpm));
  }
  const out = Array.from(bySecond.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, bpm]) => ({ t, bpm }));
  return out;
}

function extractDistanceSamples(a: any): Array<{ t: number; d: number }> {
  const sources: any[] = [
    a?.distance_data?.detailed?.distance_samples,
    a?.distance_data?.distance_samples,
    a?.distance_data?.detailed?.samples,
  ];
  const samples = sources.find((s) => Array.isArray(s) && s.length > 0);
  if (!samples) return [];
  const startMs = a?.metadata?.start_time ? new Date(a.metadata.start_time).getTime() : NaN;
  const bySecond = new Map<number, number>();
  for (const s of samples as any[]) {
    const d = toFiniteNumber(s?.distance_meters ?? s?.distance);
    if (d == null || d < 0) continue;
    let t: number | null = toFiniteNumber(s?.timer_duration_seconds ?? s?.timer_seconds ?? s?.elapsed_seconds);
    if (t == null && s?.timestamp && Number.isFinite(startMs)) {
      t = (new Date(s.timestamp).getTime() - startMs) / 1000;
    }
    if (t == null || !Number.isFinite(t) || t < 0) continue;
    bySecond.set(Math.floor(t), Math.round(d * 100) / 100);
  }
  return Array.from(bySecond.entries()).sort((a, b) => a[0] - b[0]).map(([t, d]) => ({ t, d }));
}

function extractElevationSamplesForChart(a: any): Array<{ t: number; e: number }> {
  const raw = extractElevationSamples(a);
  if (!raw.length) return [];
  const startMs = a?.metadata?.start_time ? new Date(a.metadata.start_time).getTime() : NaN;
  const bySecond = new Map<number, number>();
  for (const s of raw) {
    let t: number | null = s.timerSeconds;
    if (t == null && s.timestampMs != null && Number.isFinite(startMs)) {
      t = (s.timestampMs - startMs) / 1000;
    }
    if (t == null || !Number.isFinite(t) || t < 0) continue;
    bySecond.set(Math.floor(t), Math.round(s.elevMeters * 10) / 10);
  }
  return Array.from(bySecond.entries()).sort((a, b) => a[0] - b[0]).map(([t, e]) => ({ t, e }));
}

function extractCadenceSamples(a: any): Array<{ t: number; rpm: number }> {
  const candidates = [
    a?.movement_data?.cadence_samples,
    a?.cadence_data?.detailed?.cadence_samples,
    a?.cadence_data?.cadence_samples,
  ];
  const samples = candidates.find((s) => Array.isArray(s) && s.length > 0);
  if (!Array.isArray(samples)) return [];
  const startMs = a?.metadata?.start_time ? new Date(a.metadata.start_time).getTime() : NaN;
  const bySecond = new Map<number, number>();
  for (const s of samples as any[]) {
    const rpm = toFiniteNumber(s?.cadence_rpm ?? s?.cadence ?? s?.value);
    if (rpm == null || rpm <= 0) continue;
    let t: number | null = toFiniteNumber(s?.timer_duration_seconds ?? s?.timer_seconds ?? s?.elapsed_seconds);
    if (t == null && s?.timestamp && Number.isFinite(startMs)) {
      t = (new Date(s.timestamp).getTime() - startMs) / 1000;
    }
    if (t == null || !Number.isFinite(t) || t < 0) continue;
    bySecond.set(Math.floor(t), Math.round(rpm * 10) / 10);
  }
  return Array.from(bySecond.entries()).sort((a, b) => a[0] - b[0]).map(([t, rpm]) => ({ t, rpm }));
}

function looksLikeHrSample(s: any): boolean {
  return !!s && typeof s === "object" && toFiniteNumber(s?.bpm ?? s?.heart_rate_bpm ?? s?.heart_rate ?? s?.value) != null
    && (s?.timestamp || toFiniteNumber(s?.timer_duration_seconds ?? s?.timer_seconds ?? s?.elapsed_seconds) != null);
}

function findHrSampleArray(root: any): any[] | undefined {
  const seen = new Set<any>();
  const queue = [root];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length > 0 && looksLikeHrSample(node[0])) return node;
      continue;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key.toLowerCase().includes("hrv")) continue;
      queue.push(value);
    }
  }
  return undefined;
}

function recomputeLapAvgHr(laps: any[], samples: Array<{ t: number; bpm: number }>, activityStartTime: string | null): any[] {
  if (!samples.length || !laps.length) return laps;
  const startMs = activityStartTime ? new Date(activityStartTime).getTime() : NaN;
  if (!Number.isFinite(startMs)) return laps;
  return laps.map((lap) => {
    const lapStartMs = lap?.start_time ? new Date(lap.start_time).getTime() : NaN;
    const dur = toFiniteNumber(lap?.duration_seconds);
    if (!Number.isFinite(lapStartMs) || dur == null) return lap;
    const startSec = (lapStartMs - startMs) / 1000;
    const endSec = startSec + dur;
    const inWindow = samples.filter((s) => s.t >= startSec && s.t <= endSec);
    if (inWindow.length < 5) return lap;
    const avg = Math.round(inWindow.reduce((sum, s) => sum + s.bpm, 0) / inWindow.length);
    return { ...lap, avg_hr: avg };
  });
}

async function deleteMatchingGarminDuplicate(admin: any, userId: string, startTime: string | null, distanceMeters: number | null) {
  if (!startTime || !distanceMeters || distanceMeters <= 0) return;
  const start = new Date(startTime);
  if (!Number.isFinite(start.getTime())) return;
  const from = new Date(start.getTime() - 5 * 60 * 1000).toISOString();
  const to = new Date(start.getTime() + 5 * 60 * 1000).toISOString();
  await admin
    .from("garmin_activities")
    .delete()
    .eq("user_id", userId)
    .gte("start_time", from)
    .lte("start_time", to)
    .gte("distance_meters", Math.max(0, distanceMeters - 100))
    .lte("distance_meters", distanceMeters + 100);
}

async function upsertTerraActivity(admin: any, c: any, a: any) {
  const meta = a?.metadata ?? {};
  const dist = a?.distance_data?.summary ?? {};
  const hr = a?.heart_rate_data?.summary ?? {};
  const cal = a?.calories_data ?? {};
  const distanceMeters = toFiniteNumber(dist?.distance_meters);
  const durationSeconds = extractDurationSeconds(a, distanceMeters);
  const aid = String(meta?.upload_type ?? "") + ":" + String(meta?.summary_id ?? meta?.id ?? meta?.start_time ?? crypto.randomUUID());
  const polyline = extractPolyline(a);
  const rawLaps = extractLaps(a);
  const hrSamples = extractHrSamples(a);
  const distanceSamples = extractDistanceSamples(a);
  const elevationSamples = extractElevationSamplesForChart(a);
  const laps = hrSamples.length > 0 && rawLaps.length > 0
    ? recomputeLapAvgHr(rawLaps, hrSamples, meta?.start_time ?? null)
    : rawLaps;
  const cadenceSamples = extractCadenceSamples(a);
  const { data: existing } = await admin
    .from("terra_activities")
    .select("summary_polyline, laps, has_gps, hr_samples, distance_samples, elevation_samples, cadence_samples")
    .eq("user_id", c.user_id)
    .eq("terra_activity_id", aid)
    .maybeSingle();
  const finalPolyline = polyline ?? existing?.summary_polyline ?? null;
  const finalLaps = laps.length > 0 ? laps : (Array.isArray(existing?.laps) && existing!.laps.length > 0 ? existing!.laps : []);
  const finalHrSamples = hrSamples.length > 0
    ? hrSamples
    : (Array.isArray(existing?.hr_samples) ? existing!.hr_samples : null);
  const finalDistanceSamples = distanceSamples.length > 0
    ? distanceSamples
    : (Array.isArray((existing as any)?.distance_samples) ? (existing as any).distance_samples : null);
  const finalElevationSamples = elevationSamples.length > 0
    ? elevationSamples
    : (Array.isArray((existing as any)?.elevation_samples) ? (existing as any).elevation_samples : null);
  const finalCadenceSamples = cadenceSamples.length > 0
    ? cadenceSamples
    : (Array.isArray((existing as any)?.cadence_samples) ? (existing as any).cadence_samples : null);
  await admin.from("terra_activities").upsert({
    user_id: c.user_id,
    provider: c.provider,
    terra_activity_id: aid,
    activity_name: meta?.name ?? null,
    activity_type: meta?.type ?? null,
    start_time: meta?.start_time ?? null,
    duration_seconds: durationSeconds,
    distance_meters: distanceMeters,
    calories: cal?.total_burned_calories ? Math.round(cal.total_burned_calories) : null,
    average_hr: hr?.avg_hr_bpm ? Math.round(hr.avg_hr_bpm) : null,
    max_hr: hr?.max_hr_bpm ? Math.round(hr.max_hr_bpm) : null,
    elevation_gain: dist?.elevation?.gain_actual_meters ?? null,
    average_speed: a?.movement_data?.avg_speed_meters_per_second ?? null,
    avg_cadence: (() => {
      const c = a?.cadence_data?.summary?.avg_cadence
        ?? a?.cadence_data?.summary?.avg_cadence_rpm
        ?? a?.movement_data?.avg_cadence
        ?? a?.movement_data?.avg_cadence_rpm
        ?? null;
      const n = typeof c === "number" ? c : (c != null ? Number(c) : NaN);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    summary_polyline: finalPolyline,
    has_gps: !!finalPolyline || !!existing?.has_gps,
    laps: finalLaps,
    hr_samples: finalHrSamples,
    distance_samples: finalDistanceSamples,
    elevation_samples: finalElevationSamples,
    cadence_samples: finalCadenceSamples,
    raw_json: null,
  }, { onConflict: "user_id,terra_activity_id" });
  await deleteMatchingGarminDuplicate(admin, c.user_id, meta?.start_time ?? null, distanceMeters);
  return { terraActivityId: aid, startTime: meta?.start_time ?? null, distanceMeters, hrSampleCount: hrSamples.length };
}

async function applyHistoricalActivityWebhook(admin: any, c: any, headers: Record<string, string>, startStr: string, endStr: string) {
  const variants = [
    { start_date: startStr },
    { start_date: startStr, end_date: startStr },
    { start_date: startStr, end_date: endStr },
  ];
  const results = [];
  for (const params of variants) {
    const qs = new URLSearchParams({ user_id: c.terra_user_id, to_webhook: "true", with_samples: "true", ...params });
    const url = `https://api.tryterra.co/v2/activity?${qs.toString()}`;
    console.log(`[terra-sync] historical activity webhook ${c.provider} url=${url}`);
    const response = await fetch(url, { headers });
    const terraReference = response.headers.get("terra-reference");
    const body = await response.json().catch(() => null);
    const result = { status: response.status, terraReference, responseType: body?.type ?? null, ...params };
    results.push(result);
    console.log(`[terra-sync] historical activity webhook ${c.provider} status=${response.status} type=${body?.type} terraReference=${terraReference ?? "none"}`);
  }
  await admin.from("terra_webhook_events").insert({
    type: "terra_historical_request",
    terra_user_id: c.terra_user_id,
    reference_id: c.reference_id ?? c.user_id,
    signature_valid: true,
    payload: { provider: c.provider, endpoint: "activity", with_samples: true, requests: results },
  });
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const providerFilter: string | undefined = body.provider ? String(body.provider).toUpperCase() : undefined;
    const healthOnly = body.healthOnly === true;
    const dayOnly = body.dayOnly === true;
    const forceWebhook = body.forceWebhook === true;
    const latestWithSamples = body.latestWithSamples === true;
    const historicalActivity = body.historicalActivity === true;
    const targetUserId: string | undefined = typeof body.targetUserId === "string" ? body.targetUserId : undefined;

    // Admin override: allow targeting another user (used to backfill specific accounts).
    let connUserId = user.id;
    if (targetUserId && targetUserId !== user.id) {
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      connUserId = targetUserId;
    }

    const q = admin.from("terra_connections").select("*").eq("user_id", connUserId).eq("active", true);
    const { data: conns } = providerFilter ? await q.eq("provider", providerFilter) : await q;
    if (!conns || conns.length === 0) {
      return new Response(JSON.stringify({ ok: true, synced: 0, message: "no active connections" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const forceProd = body.forceEnv === "prod" || body.useProd === true;
    const resolvedEnv = forceProd ? "prod" : pickEnvFromRequest(req);
    const { devId, apiKey, env } = getTerraCreds(resolvedEnv);
    console.log(`[terra-sync] env=${env}${forceProd ? " (forced)" : ""}`);
    const end = new Date();
    end.setDate(end.getDate() + 1);
    const start = new Date();
    if (dayOnly) {
      // Terra's range endpoint behaves inconsistently on narrow windows
      // (likely dedups items it has previously delivered). The 7-day window
      // reliably returns recent activities including ones whose UTC date is
      // the previous day relative to the user's local "today" (e.g. a
      // 21:38 HKT run = 13:38 UTC the day before). Use the same width here
      // and rely on (provider, terra_activity_id) dedup to make repeat
      // ingests a no-op.
      start.setDate(start.getDate() - 7);
    } else {
      start.setDate(start.getDate() - 30);
    }
    let startStr = start.toISOString().slice(0, 10);
    let endStr = end.toISOString().slice(0, 10);
    // Optional explicit date window override (testing / single-activity backfill).
    if (typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) startStr = body.startDate;
    if (typeof body.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate)) endStr = body.endDate;
    console.log(`[terra-sync] window ${startStr} -> ${endStr} dayOnly=${dayOnly}`);

    let activityCount = 0;
    let dailyCount = 0;
    const healthFields = { sleep: 0, vo2max: 0, resting_hr: 0, hrv: 0, steps: 0 };

    for (const c of conns) {
      const headers = { "dev-id": devId, "x-api-key": apiKey };
      // activity (skipped when caller only wants health stats)
      if (!healthOnly) {
      if (historicalActivity) {
        console.warn(`[terra-sync] historicalActivity webhook request skipped for ${c.provider}; use direct sync only`);
      }
      try {
        // Never ask Terra to redeliver range activity data via webhook here:
        // sampled historical payloads are huge and inflate Terra dashboard
        // response time. Fetch directly and process inline instead.
        const toWebhookFlag = "false";
        const url = `https://api.tryterra.co/v2/activity?user_id=${c.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=${toWebhookFlag}&with_samples=true`;
        console.log(`[terra-sync] activity fetch ${c.provider} url=${url}`);
        const r = await fetch(url, { headers });
        const j = await r.json();
        let items: any[] = Array.isArray(j?.data) ? j.data : [];
        if (latestWithSamples) {
          // Pick the TRULY latest activity by start_time, regardless of whether
          // Terra's range endpoint included HR samples (it often returns 0
          // samples for activities it already delivered via webhook).
          items = items
            .slice()
            .sort((a, b) => Date.parse(b?.metadata?.start_time ?? "") - Date.parse(a?.metadata?.start_time ?? ""))
            .slice(0, 1);
          // If the latest item is missing HR samples, hydrate via the
          // per-activity endpoint which reads from Terra's S3 payload store
          // and reliably returns the full sample arrays.
          if (items.length > 0 && extractHrSamples(items[0]).length === 0) {
            const meta = items[0]?.metadata ?? {};
            const rawSummaryId = String(meta.summary_id ?? meta.upload_id ?? "");
            // Try several id shapes — Terra's per-activity GET is finicky about
            // provider-prefixed ids (e.g. Garmin "1:23008025282" vs "23008025282").
            const candidates: string[] = [];
            if (rawSummaryId) {
              candidates.push(rawSummaryId);
              if (rawSummaryId.includes(":")) candidates.push(rawSummaryId.split(":").slice(1).join(":"));
              else candidates.push(`1:${rawSummaryId}`);
            }
            let hydrated: any = null;
            for (const sid of candidates) {
              try {
                const hurl = `https://api.tryterra.co/v2/activity/${encodeURIComponent(sid)}?user_id=${c.terra_user_id}&with_samples=true`;
                console.log(`[terra-sync] latestWithSamples hydrate ${c.provider} try=${sid} url=${hurl}`);
                const hr = await fetch(hurl, { headers });
                const hj = await hr.json();
                const cand = Array.isArray(hj?.data) ? hj.data[0] : hj?.data;
                const cnt = cand ? extractHrSamples(cand).length : 0;
                console.log(`[terra-sync] latestWithSamples hydrate ${c.provider} try=${sid} status=${hr.status} hrSamples=${cnt}`);
                if (cand && cnt > 0) { hydrated = cand; break; }
                if (cand && !hydrated) hydrated = cand;
              } catch (e) {
                console.error(`[terra-sync] latestWithSamples hydrate try=${sid} threw`, e);
              }
            }
            if (hydrated) items[0] = hydrated;

            // Last-resort: if direct GETs still produced no samples, ask Terra
            // to redeliver this date via webhook with samples=true. The webhook
            // path uses S3 payloads which reliably include the full HR series.
            if (extractHrSamples(items[0]).length === 0) {
              const startDate = String(meta.start_time ?? "").slice(0, 10);
              if (startDate) {
                const endDate = new Date(startDate); endDate.setUTCDate(endDate.getUTCDate() + 1);
                const endStr2 = endDate.toISOString().slice(0, 10);
                const wurl = `https://api.tryterra.co/v2/activity?user_id=${c.terra_user_id}&start_date=${startDate}&end_date=${endStr2}&to_webhook=true&with_samples=true`;
                console.log(`[terra-sync] latestWithSamples webhook redeliver url=${wurl}`);
                try {
                  const wr = await fetch(wurl, { headers });
                  console.log(`[terra-sync] latestWithSamples webhook redeliver status=${wr.status}`);
                } catch (e) {
                  console.error(`[terra-sync] latestWithSamples webhook redeliver threw`, e);
                }
              }
            }
          }
        }
        const terraReference = r.headers.get("terra-reference");
        const itemIds = items.map((it: any) => String(it?.metadata?.summary_id ?? it?.metadata?.upload_id ?? it?.metadata?.start_time ?? "")).filter(Boolean);
        console.log(`[terra-sync] activity ${c.provider} items=${items.length} status=${r.status} type=${j?.type} terraReference=${terraReference ?? "none"} forceWebhookRequested=${forceWebhook} ids=${JSON.stringify(itemIds).slice(0, 1000)}`);
        let ingestedHere = 0;
        let skippedHere = 0;
        for (const a of items) {
          // Route through the trusted webhook ingest pipeline so manual sync
          // produces the same row shape (full hr/distance/elev/cadence samples)
          // as a real webhook delivery. Dedup via (provider, terra_activity_id).
          const envelope = {
            type: "activity",
            user: { user_id: c.terra_user_id, reference_id: c.reference_id, provider: c.provider },
            data: [a],
          };
          const aid = String(a?.metadata?.summary_id ?? a?.metadata?.upload_id ?? "");
          try {
            const ing = await ingestTrustedTerraPayload(JSON.stringify(envelope), "prod", "manual_sync");
            if (ing.ok) { activityCount++; ingestedHere++; }
            else { skippedHere++; console.warn(`[terra-sync] trusted ingest err ${c.provider} id=${aid}: ${ing.error}`); }
          } catch (e) {
            skippedHere++;
            console.error(`[terra-sync] trusted ingest threw ${c.provider} id=${aid}`, e);
          }
        }
        console.log(`[terra-sync] activity ingest summary ${c.provider} returned=${items.length} ingested=${ingestedHere} skipped=${skippedHere}`);

        if (latestWithSamples && items.length === 0) {
          const { data: withSamples } = await admin
            .from("terra_activities")
            .select("id")
            .eq("user_id", c.user_id)
            .eq("provider", c.provider)
            .gte("start_time", `${startStr}T00:00:00Z`)
            .lt("start_time", `${endStr}T00:00:00Z`)
            .not("hr_samples", "is", null)
            .limit(1);
          if ((withSamples?.length ?? 0) > 0) activityCount++;
        }
      } catch (e) { console.error("activity fetch failed", c.provider, e); }

      // Backfill hr_samples for existing rows missing samples in window via the
      // per-activity endpoint (range endpoint dedupes after first delivery).
      try {
        const { data: missing } = await admin
          .from("terra_activities")
          .select("id, terra_activity_id, laps")
          .eq("user_id", c.user_id)
          .eq("provider", c.provider)
          .gte("start_time", `${startStr}T00:00:00Z`)
          .lt("start_time", `${endStr}T00:00:00Z`)
          .is("hr_samples", null);
        console.log(`[terra-sync] backfill ${c.provider} candidates=${missing?.length ?? 0}`);
        for (const row of missing ?? []) {
          const aid = String(row.terra_activity_id || "");
          const summaryId = aid.includes(":") ? aid.split(":").slice(1).join(":") : aid;
          if (!summaryId) continue;
          const url = `https://api.tryterra.co/v2/activity/${encodeURIComponent(summaryId)}?user_id=${c.terra_user_id}&with_samples=true`;
          const rr = await fetch(url, { headers });
          const jj = await rr.json();
          const item = Array.isArray(jj?.data) ? jj.data[0] : jj?.data;
          if (!item) { console.log(`[terra-sync] backfill ${summaryId} no data status=${rr.status}`); continue; }
          const meta = item?.metadata ?? {};
          const hrSamples = extractHrSamples(item);
          const rawLaps = extractLaps(item);
          const laps = hrSamples.length > 0 && rawLaps.length > 0
            ? recomputeLapAvgHr(rawLaps, hrSamples, meta?.start_time ?? null)
            : (rawLaps.length > 0 ? rawLaps : (Array.isArray(row.laps) ? row.laps : []));
          console.log(`[terra-sync] backfill ${summaryId} hr=${hrSamples.length} laps=${laps.length} status=${rr.status}`);
          if (hrSamples.length === 0) continue;
          await admin.from("terra_activities").update({ hr_samples: hrSamples, laps }).eq("id", row.id);
        }
      } catch (e) { console.error("backfill failed", c.provider, e); }
      }

      if (dayOnly) {
        // Skip health endpoints when only validating activity capture for today.
        await admin.from("terra_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", c.id);
        continue;
      }

      // daily (steps, resting hr, vo2max)
      const dailyByDate: Record<string, any> = {};
      try {
        const r = await fetch(`https://api.tryterra.co/v2/daily?user_id=${c.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=false`, { headers });
        const j = await r.json();
        const items = Array.isArray(j?.data) ? j.data : [];
        for (const d of items) {
          const meta = d?.metadata ?? {};
          const date = (meta?.start_time ?? "").slice(0, 10);
          if (!date) continue;
          // VO2max lives in oxygen_data per Terra spec (ml/kg/min).
          // Prefer the day's stored value, then the day-avg over samples.
          const vo2Samples = Array.isArray(d?.oxygen_data?.vo2_samples) ? d.oxygen_data.vo2_samples : [];
          const lastVo2Sample = vo2Samples.length > 0
            ? toFiniteNumber(vo2Samples[vo2Samples.length - 1]?.vo2max_ml_per_min_per_kg)
            : null;
          const vo2 =
            toFiniteNumber(d?.oxygen_data?.vo2max_ml_per_min_per_kg) ??
            toFiniteNumber(d?.oxygen_data?.day_avg_vo2max_ml_per_min_per_kg) ??
            lastVo2Sample;
          const dailyHrv = toFiniteNumber(d?.heart_rate_data?.summary?.avg_hrv_rmssd);
          dailyByDate[date] = {
            user_id: c.user_id,
            provider: c.provider,
            date,
            resting_hr: toFiniteNumber(d?.heart_rate_data?.summary?.resting_hr_bpm) ?? null,
            steps: d?.distance_data?.steps ?? null,
            vo2max: vo2,
            hrv: dailyHrv != null ? Math.round(dailyHrv * 10) / 10 : null,
            sleep_seconds: null,
            sleep_score: null,
          };
        }
      } catch (e) { console.error("daily fetch failed", c.provider, e); }

      // body (vo2max) — Garmin exposes VO2max via /v2/body measurements_data
      try {
        const r = await fetch(`https://api.tryterra.co/v2/body?user_id=${c.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=false`, { headers });
        const j = await r.json();
        const items = Array.isArray(j?.data) ? j.data : [];
        console.log(`[terra-sync] body ${c.provider} items=${items.length}`);
        for (const d of items) {
          const meta = d?.metadata ?? {};
          const date = (meta?.start_time ?? meta?.end_time ?? "").slice(0, 10);
          if (!date) continue;
          const measurements = Array.isArray(d?.measurements_data?.measurements) ? d.measurements_data.measurements : [];
          let vo2: number | null = null;
          for (const m of measurements) {
            const v = toFiniteNumber(m?.VO2max_ml_per_min_per_kg ?? m?.vo2max_ml_per_min_per_kg);
            if (v != null) vo2 = v;
          }
          if (vo2 == null) {
            const samples = Array.isArray(d?.oxygen_data?.vo2_samples) ? d.oxygen_data.vo2_samples : [];
            const lastSample = samples.length > 0
              ? toFiniteNumber(samples[samples.length - 1]?.vo2max_ml_per_min_per_kg)
              : null;
            vo2 = toFiniteNumber(d?.oxygen_data?.vo2max_ml_per_min_per_kg)
              ?? toFiniteNumber(d?.oxygen_data?.day_avg_vo2max_ml_per_min_per_kg)
              ?? lastSample;
          }
          if (vo2 == null) continue;
          const existing = dailyByDate[date] ?? {
            user_id: c.user_id, provider: c.provider, date,
            resting_hr: null, steps: null, vo2max: null,
            sleep_seconds: null, sleep_score: null, hrv: null,
          };
          if (existing.vo2max == null) existing.vo2max = vo2;
          dailyByDate[date] = existing;
        }
      } catch (e) { console.error("body fetch failed", c.provider, e); }

      // sleep (sleep_seconds, sleep_score) — Terra returns one record per sleep session.
      // We aggregate per night (using end_time date as the "wake day") and pick the longest.
      try {
        const r = await fetch(`https://api.tryterra.co/v2/sleep?user_id=${c.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=false`, { headers });
        const j = await r.json();
        const items = Array.isArray(j?.data) ? j.data : [];
        console.log(`[terra-sync] sleep ${c.provider} items=${items.length}`);
        if (items.length > 0) {
          console.log(`[terra-sync] sleep sample keys ${c.provider}:`, JSON.stringify(Object.keys(items[0] ?? {})));
          console.log(`[terra-sync] sleep durations sample ${c.provider}:`, JSON.stringify(items[0]?.sleep_durations_data ?? null).slice(0, 800));
        }
        for (const d of items) {
          const meta = d?.metadata ?? {};
          // Use end_time so a sleep that ends in the morning is attributed to that day.
          const date = (meta?.end_time ?? meta?.start_time ?? "").slice(0, 10);
          if (!date) continue;
          const sd = d?.sleep_durations_data ?? {};
          const asleep = sd?.asleep ?? {};
          const other = sd?.other ?? {};
          const awake = sd?.awake ?? {};
          const directAsleep = toFiniteNumber(asleep?.duration_asleep_state_seconds);
          const deep = toFiniteNumber(asleep?.duration_deep_sleep_state_seconds);
          const light = toFiniteNumber(asleep?.duration_light_sleep_state_seconds);
          const rem = toFiniteNumber(asleep?.duration_REM_sleep_state_seconds);
          const sumStages =
            deep != null || light != null || rem != null
              ? (deep ?? 0) + (light ?? 0) + (rem ?? 0)
              : null;
          const inBedSec = toFiniteNumber(other?.duration_in_bed_seconds);
          const awakeSec = toFiniteNumber(awake?.duration_awake_state_seconds);
          const fromInBed = inBedSec != null
            ? inBedSec - (awakeSec ?? 0)
            : null;
          // Final fallback: end_time - start_time (raw session window) minus awake time.
          let fromWindow: number | null = null;
          const st = meta?.start_time ? Date.parse(meta.start_time) : NaN;
          const et = meta?.end_time ? Date.parse(meta.end_time) : NaN;
          if (Number.isFinite(st) && Number.isFinite(et) && et > st) {
            fromWindow = Math.round((et - st) / 1000) - (awakeSec ?? 0);
          }
          const totalSec = directAsleep ?? sumStages ?? fromInBed ?? fromWindow;
          const score =
            toFiniteNumber(d?.scores?.sleep) ??
            toFiniteNumber(d?.scores?.overall) ??
            toFiniteNumber(d?.scores?.sleep_score) ??
            toFiniteNumber(d?.sleep_score);
          // Sleep summary also carries overnight RHR + HRV (RMSSD) — the only
          // place Garmin exposes HRV via Terra. Use as fallback / primary source.
          const sleepHrSummary = d?.heart_rate_data?.summary ?? {};
          const sleepRhr = toFiniteNumber(sleepHrSummary?.resting_hr_bpm);
          const sleepHrv = toFiniteNumber(sleepHrSummary?.avg_hrv_rmssd);
          const existing = dailyByDate[date] ?? {
            user_id: c.user_id, provider: c.provider, date,
            resting_hr: null, steps: null, vo2max: null,
            sleep_seconds: null, sleep_score: null, hrv: null,
          };
          const newSec = totalSec ? Math.round(totalSec) : null;
          // Keep the longest sleep session for the day.
          if (newSec != null && (existing.sleep_seconds == null || newSec > existing.sleep_seconds)) {
            existing.sleep_seconds = newSec;
            if (score != null) existing.sleep_score = Math.round(score);
            if (sleepRhr != null) existing.resting_hr = Math.round(sleepRhr);
            if (sleepHrv != null) existing.hrv = Math.round(sleepHrv * 10) / 10;
          } else {
            if (existing.sleep_score == null && score != null) existing.sleep_score = Math.round(score);
            if (existing.resting_hr == null && sleepRhr != null) existing.resting_hr = Math.round(sleepRhr);
            if (existing.hrv == null && sleepHrv != null) existing.hrv = Math.round(sleepHrv * 10) / 10;
          }
          dailyByDate[date] = existing;
        }
      } catch (e) { console.error("sleep fetch failed", c.provider, e); }

      const sleepRows = Object.values(dailyByDate).filter((r: any) => r.sleep_seconds != null).length;
      console.log(`[terra-sync] daily upsert ${c.provider}: total=${Object.values(dailyByDate).length} withSleep=${sleepRows}`);
      for (const row of Object.values(dailyByDate)) {
        const r: any = row;
        const { error: upErr } = await admin.from("terra_daily_health").upsert(row, { onConflict: "user_id,provider,date" });
        if (upErr) console.error(`[terra-sync] upsert failed for ${r.date}:`, upErr.message, JSON.stringify(row));
        else {
          if (r.sleep_seconds != null) healthFields.sleep++;
          if (r.vo2max != null) healthFields.vo2max++;
          if (r.resting_hr != null) healthFields.resting_hr++;
          if (r.hrv != null) healthFields.hrv++;
          if (r.steps != null) healthFields.steps++;
        }
        dailyCount++;
      }

      await admin.from("terra_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", c.id);
    }

    return new Response(JSON.stringify({ ok: true, activities: activityCount, daily: dailyCount, health: healthFields }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

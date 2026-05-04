import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

function extractLaps(a: any): any[] {
  const rawLaps = a?.lap_data?.laps ?? a?.laps_data?.laps ?? a?.laps ?? [];
  if (!Array.isArray(rawLaps)) return [];
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
    elevation_gain: l?.total_ascent_meters ?? l?.elevation_gain_meters ?? null,
  }));
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

    const q = admin.from("terra_connections").select("*").eq("user_id", user.id).eq("active", true);
    const { data: conns } = providerFilter ? await q.eq("provider", providerFilter) : await q;
    if (!conns || conns.length === 0) {
      return new Response(JSON.stringify({ ok: true, synced: 0, message: "no active connections" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const devId = Deno.env.get("TERRA_DEV_ID")!;
    const apiKey = Deno.env.get("TERRA_API_KEY")!;
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 30);
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    let activityCount = 0;
    let dailyCount = 0;

    for (const c of conns) {
      const headers = { "dev-id": devId, "x-api-key": apiKey };
      // activity
      try {
        const r = await fetch(`https://api.tryterra.co/v2/activity?user_id=${c.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=true`, { headers });
        const j = await r.json();
        const items = Array.isArray(j?.data) ? j.data : [];
        for (const a of items) {
          const meta = a?.metadata ?? {};
          const dist = a?.distance_data?.summary ?? {};
          const hr = a?.heart_rate_data?.summary ?? {};
          const cal = a?.calories_data ?? {};
          const aid = String(meta?.upload_type ?? "") + ":" + String(meta?.summary_id ?? meta?.id ?? meta?.start_time ?? crypto.randomUUID());
          const polyline = extractPolyline(a);
          const laps = extractLaps(a);
          const { data: existing } = await admin
            .from("terra_activities")
            .select("summary_polyline, laps, has_gps")
            .eq("user_id", c.user_id)
            .eq("terra_activity_id", aid)
            .maybeSingle();
          const finalPolyline = polyline ?? existing?.summary_polyline ?? null;
          const finalLaps = laps.length > 0 ? laps : (Array.isArray(existing?.laps) && existing!.laps.length > 0 ? existing!.laps : []);
          await admin.from("terra_activities").upsert({
            user_id: c.user_id,
            provider: c.provider,
            terra_activity_id: aid,
            activity_name: meta?.name ?? null,
            activity_type: meta?.type ?? null,
            start_time: meta?.start_time ?? null,
            duration_seconds: meta?.active_duration_seconds ? Math.round(meta.active_duration_seconds) : null,
            distance_meters: dist?.distance_meters ?? null,
            calories: cal?.total_burned_calories ? Math.round(cal.total_burned_calories) : null,
            average_hr: hr?.avg_hr_bpm ? Math.round(hr.avg_hr_bpm) : null,
            max_hr: hr?.max_hr_bpm ? Math.round(hr.max_hr_bpm) : null,
            elevation_gain: dist?.elevation?.gain_actual_meters ?? null,
            average_speed: a?.movement_data?.avg_speed_meters_per_second ?? null,
            summary_polyline: finalPolyline,
            has_gps: !!finalPolyline || !!existing?.has_gps,
            laps: finalLaps,
            raw_json: null,
          }, { onConflict: "user_id,terra_activity_id" });
          activityCount++;
        }
      } catch (e) { console.error("activity fetch failed", c.provider, e); }

      // daily
      try {
        const r = await fetch(`https://api.tryterra.co/v2/daily?user_id=${c.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=false`, { headers });
        const j = await r.json();
        const items = Array.isArray(j?.data) ? j.data : [];
        for (const d of items) {
          const meta = d?.metadata ?? {};
          const date = (meta?.start_time ?? "").slice(0, 10);
          if (!date) continue;
          await admin.from("terra_daily_health").upsert({
            user_id: c.user_id,
            provider: c.provider,
            date,
            resting_hr: d?.heart_rate_data?.summary?.resting_hr_bpm ?? null,
            steps: d?.distance_data?.steps ?? null,
            vo2max: d?.MET_data?.avg_level ?? null,
          }, { onConflict: "user_id,provider,date" });
          dailyCount++;
        }
      } catch (e) { console.error("daily fetch failed", c.provider, e); }

      await admin.from("terra_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", c.id);
    }

    return new Response(JSON.stringify({ ok: true, activities: activityCount, daily: dailyCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

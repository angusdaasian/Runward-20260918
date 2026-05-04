import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, terra-signature",
};

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function verifySignature(secret: string, header: string | null, raw: string): Promise<boolean> {
  if (!header) return false;
  // header format: "t=<timestamp>,v1=<signature>"
  const entries = header
    .split(",")
    .map((p) => p.trim().split("=") as [string, string])
    .filter(([key, value]) => key && value);
  const parts = Object.fromEntries(entries);
  const t = parts.t;
  const signatures = entries.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!t || signatures.length === 0) return false;
  const payload = `${t}.${raw}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => hex === signature);
}

function mapProvider(resource: string | undefined | null): string {
  return (resource ?? "").toUpperCase();
}

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
  const samples =
    a?.position_data?.position_samples ??
    a?.position_data?.coords_samples ??
    a?.gps_data?.samples ??
    [];
  const pts: Array<[number, number]> = [];
  if (Array.isArray(samples)) {
    for (const s of samples) {
      // Terra v2: coords_lat_lng_deg = [lat, lng]
      const ll = s?.coords_lat_lng_deg;
      let lat: number | undefined;
      let lng: number | undefined;
      if (Array.isArray(ll) && ll.length >= 2) {
        lat = ll[0];
        lng = ll[1];
      } else {
        lat = s?.coords?.latitude ?? s?.latitude ?? s?.lat;
        lng = s?.coords?.longitude ?? s?.longitude ?? s?.lng ?? s?.lon;
      }
      if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
        pts.push([lat, lng]);
      }
    }
  }
  return pts;
}

function extractPolyline(a: any): string | null {
  // Prefer Terra's pre-encoded polyline (no samples needed)
  const pre = a?.polyline_map_data?.summary_polyline;
  if (typeof pre === "string" && pre.length > 0) return pre;
  const pts = extractGpsPoints(a);
  return pts.length > 1 ? encodePolyline(pts) : null;
}

function extractLaps(a: any): any[] {
  const rawLaps =
    a?.lap_data?.laps ??
    a?.laps_data?.laps ??
    a?.laps ??
    [];
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

async function findUserId(terraUserId: string | null, referenceId: string | null): Promise<string | null> {
  if (referenceId) return referenceId;
  if (!terraUserId) return null;
  const { data } = await supa.from("terra_connections").select("user_id").eq("terra_user_id", terraUserId).maybeSingle();
  return data?.user_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const raw = await req.text();
  const sigHeader = req.headers.get("terra-signature");
  const secret = Deno.env.get("TERRA_SIGNING_SECRET") ?? "";
  let signatureValid = false;
  try { signatureValid = secret ? await verifySignature(secret, sigHeader, raw) : false; } catch { signatureValid = false; }

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { payload = { _parse_error: true, raw }; }

  const type: string = payload?.type ?? "unknown";
  const user = payload?.user ?? {};
  const terraUserId: string | null = user?.user_id ?? null;
  const referenceId: string | null = user?.reference_id ?? null;
  const provider: string = mapProvider(user?.provider ?? payload?.resource);

  let processingError: string | null = null;
  try {
    if (!signatureValid && secret) {
      processingError = "invalid signature";
    } else {
      const appUserId = await findUserId(terraUserId, referenceId);

      if (type === "auth" && appUserId && terraUserId) {
        const rawScopes = user?.scopes;
        const scopesArr = Array.isArray(rawScopes)
          ? rawScopes
          : typeof rawScopes === "string" && rawScopes.length > 0
            ? rawScopes.split(",").map((s: string) => s.trim()).filter(Boolean)
            : null;
        const { error: upsertErr } = await supa.from("terra_connections").upsert({
          user_id: appUserId,
          terra_user_id: terraUserId,
          provider,
          reference_id: referenceId,
          scopes: scopesArr,
          active: true,
          last_webhook_at: new Date().toISOString(),
        }, { onConflict: "user_id,provider" });
        if (upsertErr) {
          console.error("terra_connections upsert failed", upsertErr);
          processingError = `connection upsert: ${upsertErr.message}`;
        }

        // Garmin-only: wipe the recent Railway Garmin window and trigger
        // Terra historical re-fetch (data streams back via this same webhook).
        if (provider === "GARMIN") {
          const days = 7;
          const since = new Date(Date.now() - days * 86400_000);
          const sinceISO = since.toISOString();
          const sinceDate = sinceISO.slice(0, 10);
          const endDate = new Date().toISOString().slice(0, 10);
          const startDate = sinceDate;

          // Wipe Railway Garmin window (don't await failures — keep webhook fast)
          (async () => {
            try {
              await supa.from("garmin_activities").delete().eq("user_id", appUserId).gte("start_time", sinceISO);
              await supa.from("garmin_daily_health").delete().eq("user_id", appUserId).gte("date", sinceDate);
            } catch (e) {
              console.error("garmin wipe failed", e);
            }
          })();

          // Fire historical re-fetch (to_webhook=true → Terra streams payloads back)
          const devId = Deno.env.get("TERRA_DEV_ID") ?? "";
          const apiKey = Deno.env.get("TERRA_API_KEY") ?? "";
          const headers = { "dev-id": devId, "x-api-key": apiKey };
          const endpoints = ["activity", "daily", "sleep"] as const;
          (async () => {
            const results = await Promise.allSettled(
              endpoints.map((ep) => {
                const withSamples = ep === "activity" ? "true" : "false";
                return fetch(
                  `https://api.tryterra.co/v2/${ep}?user_id=${terraUserId}&start_date=${startDate}&end_date=${endDate}&to_webhook=true&with_samples=${withSamples}`,
                  { headers },
                ).then((r) => ({ ep, status: r.status }));
              }),
            );
            const summary = results.map((r, i) =>
              r.status === "fulfilled" ? r.value : { ep: endpoints[i], error: String((r as any).reason) }
            );
            try {
              await supa.from("terra_webhook_events").insert({
                type: "garmin_backfill",
                terra_user_id: terraUserId,
                reference_id: referenceId,
                signature_valid: true,
                payload: { window_days: days, start_date: startDate, end_date: endDate, results: summary } as any,
              });
            } catch (e) {
              console.error("garmin_backfill log insert failed", e);
            }
          })();
        }
      } else if ((type === "deauth" || type === "access_revoked") && terraUserId) {
        await supa.from("terra_connections").update({ active: false, last_webhook_at: new Date().toISOString() }).eq("terra_user_id", terraUserId);
      } else if ((type === "activity" || type === "processed_activity") && appUserId) {
        const acts = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        for (const a of acts) {
          const meta = a?.metadata ?? {};
          const dist = a?.distance_data?.summary ?? {};
          const hr = a?.heart_rate_data?.summary ?? {};
          const cal = a?.calories_data ?? {};
          const elev = a?.distance_data?.summary?.elevation ?? {};
          const aid = String(meta?.upload_type ?? "") + ":" + String(meta?.summary_id ?? meta?.id ?? meta?.start_time ?? crypto.randomUUID());
          const polyline = extractPolyline(a);
          const laps = extractLaps(a);
          // Read existing row so we don't overwrite good polyline/laps with empty
          const { data: existing } = await supa
            .from("terra_activities")
            .select("summary_polyline, laps, has_gps")
            .eq("user_id", appUserId)
            .eq("terra_activity_id", aid)
            .maybeSingle();
          const finalPolyline = polyline ?? existing?.summary_polyline ?? null;
          const finalLaps = (laps && laps.length > 0)
            ? laps
            : (Array.isArray(existing?.laps) && existing!.laps.length > 0 ? existing!.laps : []);
          const finalHasGps = !!finalPolyline || !!existing?.has_gps;
          await supa.from("terra_activities").upsert({
            user_id: appUserId,
            provider,
            terra_activity_id: aid,
            activity_name: meta?.name ?? null,
            activity_type: meta?.type ?? meta?.activity_type ?? null,
            start_time: meta?.start_time ?? null,
            duration_seconds: meta?.active_duration_seconds ? Math.round(meta.active_duration_seconds) : null,
            distance_meters: dist?.distance_meters ?? null,
            calories: cal?.total_burned_calories ? Math.round(cal.total_burned_calories) : null,
            average_hr: hr?.avg_hr_bpm ? Math.round(hr.avg_hr_bpm) : null,
            max_hr: hr?.max_hr_bpm ? Math.round(hr.max_hr_bpm) : null,
            elevation_gain: elev?.gain_actual_meters ?? null,
            average_speed: a?.movement_data?.avg_speed_meters_per_second ?? null,
            summary_polyline: finalPolyline,
            has_gps: finalHasGps,
            laps: finalLaps,
            raw_json: null,
          }, { onConflict: "user_id,terra_activity_id" });
        }
      } else if (type === "daily" && appUserId) {
        const items = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        for (const d of items) {
          const meta = d?.metadata ?? {};
          const date = (meta?.start_time ?? "").slice(0, 10) || (meta?.end_time ?? "").slice(0, 10);
          if (!date) continue;
          await supa.from("terra_daily_health").upsert({
            user_id: appUserId,
            provider,
            date,
            resting_hr: d?.heart_rate_data?.summary?.resting_hr_bpm ?? null,
            steps: d?.distance_data?.steps ?? null,
            vo2max: d?.MET_data?.avg_level ?? null,
          }, { onConflict: "user_id,provider,date" });
        }
      } else if (type === "sleep" && appUserId) {
        const items = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        for (const s of items) {
          const meta = s?.metadata ?? {};
          const date = (meta?.start_time ?? "").slice(0, 10);
          if (!date) continue;
          await supa.from("terra_daily_health").upsert({
            user_id: appUserId,
            provider,
            date,
            sleep_seconds: s?.sleep_durations_data?.asleep?.duration_asleep_state_seconds ?? null,
            sleep_score: s?.sleep_durations_data?.sleep_efficiency ?? null,
          }, { onConflict: "user_id,provider,date" });
        }
      }
    }
  } catch (e) {
    processingError = String(e);
    console.error("terra-webhook processing error", e);
  }

  await supa.from("terra_webhook_events").insert({
    type,
    terra_user_id: terraUserId,
    reference_id: referenceId,
    signature_valid: signatureValid,
    payload: { type, user: payload?.user, count: Array.isArray(payload?.data) ? payload.data.length : (payload?.data ? 1 : 0) },
    processing_error: processingError,
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

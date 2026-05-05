import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, terra-signature",
};

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── XP / rank computation (mirrors garmin-sync) ──
function percentVO2(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}
function vo2Cost(velocity: number): number {
  return -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
}
function calculateVdot(distanceMeters: number, timeSeconds: number): number {
  const minutes = timeSeconds / 60;
  if (minutes <= 0) return 0;
  const velocity = distanceMeters / minutes;
  return vo2Cost(velocity) / percentVO2(minutes);
}
const RANK_TIERS = ["Bronze", "Silver", "Gold", "Diamond"];
const DIVISIONS = ["V", "IV", "III", "II", "I"];
const XP_PER_DIVISION = 2000;
function computeRankFromXP(monthlyXp: number) {
  const divisionIndex = Math.min(Math.floor(monthlyXp / XP_PER_DIVISION), RANK_TIERS.length * DIVISIONS.length - 1);
  const tierIndex = Math.min(Math.floor(divisionIndex / DIVISIONS.length), RANK_TIERS.length - 1);
  const divIndex = divisionIndex % DIVISIONS.length;
  return { tier: RANK_TIERS[tierIndex], division: DIVISIONS[divIndex] };
}
const RUNNING_TYPES = new Set([
  "Run", "TrailRun", "VirtualRun", "Treadmill", "Workout",
  "running", "trail_running", "treadmill_running", "RUNNING", "TRAIL_RUNNING",
]);
function isRunning(t: unknown): boolean {
  if (typeof t !== "string") return false;
  return RUNNING_TYPES.has(t) || t.toLowerCase().includes("run");
}

async function recalcUserXp(userId: string) {
  try {
    // Compute training_score from VDOT of recent terra running activities
    const { data: recent } = await supa
      .from("terra_activities")
      .select("distance_meters, duration_seconds, activity_type, start_time")
      .eq("user_id", userId)
      .order("start_time", { ascending: false })
      .limit(50);

    const vdots: number[] = [];
    for (const act of recent || []) {
      if (
        isRunning(act.activity_type) &&
        (act.distance_meters || 0) >= 400 &&
        (act.duration_seconds || 0) >= 60
      ) {
        const v = calculateVdot(act.distance_meters || 0, act.duration_seconds || 0);
        if (v >= 5 && v <= 100 && isFinite(v)) vdots.push(v);
      }
      if (vdots.length >= 20) break;
    }
    const trainingScore = vdots.length > 0
      ? Math.round(vdots.reduce((a, b) => a + b, 0) / vdots.length)
      : 0;

    await supa.from("profiles").update({ training_score: trainingScore }).eq("user_id", userId);

    // Sum monthly XP from terra_activities for current month
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
    const { data: monthActs } = await supa
      .from("terra_activities")
      .select("distance_meters, duration_seconds")
      .eq("user_id", userId)
      .gte("start_time", monthStart)
      .lt("start_time", monthEnd);

    let totalMonthlyXp = 0;
    for (const act of monthActs || []) {
      const km = (act.distance_meters || 0) / 1000;
      const minutes = (act.duration_seconds || 0) / 60;
      const xp = Math.round(km * 20) + Math.round(minutes * 10) + Math.round(trainingScore * 5);
      if (xp > 0) totalMonthlyXp += xp;
    }

    // Add social-reward bonuses claimed this month so we don't wipe them.
    const { data: socialRewards } = await supa
      .from("social_rewards_claimed")
      .select("xp_awarded")
      .eq("user_id", userId)
      .gte("claimed_at", monthStart)
      .lt("claimed_at", monthEnd);
    for (const r of socialRewards || []) totalMonthlyXp += (r.xp_awarded || 0);

    const { data: profile } = await supa
      .from("profiles")
      .select("monthly_xp, lifetime_xp")
      .eq("user_id", userId)
      .single();
    if (!profile) return;

    const oldMonthlyXp = profile.monthly_xp || 0;
    const xpDelta = totalMonthlyXp - oldMonthlyXp;
    const newLifetimeXp = Math.max(0, (profile.lifetime_xp || 0) + xpDelta);
    const rank = computeRankFromXP(totalMonthlyXp);

    await supa.from("profiles").update({
      monthly_xp: totalMonthlyXp,
      lifetime_xp: newLifetimeXp,
      rank_tier: rank.tier,
      division: rank.division,
    }).eq("user_id", userId);
  } catch (e) {
    console.error("terra-webhook recalcUserXp failed", e);
  }
}

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
  const rawLaps =
    a?.lap_data?.laps ??
    a?.laps_data?.laps ??
    a?.laps ??
    [];
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

function extractSleepDate(s: any): string {
  const meta = s?.metadata ?? {};
  return (meta?.end_time ?? meta?.start_time ?? "").slice(0, 10);
}

function extractSleepSeconds(s: any): number | null {
  const sd = s?.sleep_durations_data ?? {};
  const asleep = sd?.asleep ?? {};
  const awake = sd?.awake ?? {};
  const other = sd?.other ?? {};
  const directAsleep = toFiniteNumber(asleep?.duration_asleep_state_seconds);
  const deep = toFiniteNumber(asleep?.duration_deep_sleep_state_seconds);
  const light = toFiniteNumber(asleep?.duration_light_sleep_state_seconds);
  const rem = toFiniteNumber(asleep?.duration_REM_sleep_state_seconds);
  const sumStages = deep != null || light != null || rem != null ? (deep ?? 0) + (light ?? 0) + (rem ?? 0) : null;
  const inBedSec = toFiniteNumber(other?.duration_in_bed_seconds);
  const awakeSec = toFiniteNumber(awake?.duration_awake_state_seconds);
  const fromInBed = inBedSec != null ? inBedSec - (awakeSec ?? 0) : null;
  const meta = s?.metadata ?? {};
  const st = meta?.start_time ? Date.parse(meta.start_time) : NaN;
  const et = meta?.end_time ? Date.parse(meta.end_time) : NaN;
  const fromWindow = Number.isFinite(st) && Number.isFinite(et) && et > st
    ? Math.round((et - st) / 1000) - (awakeSec ?? 0)
    : null;
  const total = directAsleep ?? sumStages ?? fromInBed ?? fromWindow;
  return total != null && total > 0 ? Math.round(total) : null;
}

function extractSleepScore(s: any): number | null {
  const score = toFiniteNumber(s?.scores?.sleep)
    ?? toFiniteNumber(s?.scores?.overall)
    ?? toFiniteNumber(s?.scores?.sleep_score)
    ?? toFiniteNumber(s?.sleep_score);
  return score != null ? Math.round(score) : null;
}

async function deleteMatchingGarminDuplicate(userId: string, startTime: string | null, distanceMeters: number | null) {
  if (!startTime || !distanceMeters || distanceMeters <= 0) return;
  const start = new Date(startTime);
  if (!Number.isFinite(start.getTime())) return;
  const from = new Date(start.getTime() - 5 * 60 * 1000).toISOString();
  const to = new Date(start.getTime() + 5 * 60 * 1000).toISOString();
  await supa
    .from("garmin_activities")
    .delete()
    .eq("user_id", userId)
    .gte("start_time", from)
    .lte("start_time", to)
    .gte("distance_meters", Math.max(0, distanceMeters - 100))
    .lte("distance_meters", distanceMeters + 100);
}

async function pushActivityUploadedNotification(appUserId: string) {
  try {
    const { data: profile } = await supa
      .from("profiles")
      .select("activity_notifications")
      .eq("user_id", appUserId)
      .single();
    if (!profile?.activity_notifications) {
      console.log(`[terra-webhook] notifications disabled for ${appUserId}, skipping`);
      return;
    }
    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!onesignalAppId || !onesignalApiKey) return;

    // Detect language from auth user_metadata
    let lang: "zh" | "en" = "en";
    try {
      const { data } = await supa.auth.admin.getUserById(appUserId);
      const meta: any = (data?.user as any)?.user_metadata ?? {};
      const raw = String(meta.lang ?? meta.language ?? meta.locale ?? "").toLowerCase();
      if (raw.startsWith("zh")) lang = "zh";
    } catch (_) { /* default en */ }

    const title = lang === "zh" ? "新活動已同步" : "New activity synced";
    const message = lang === "zh"
      ? "你的最新活動已上傳。"
      : "Your latest activity has been uploaded.";

    await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${onesignalApiKey}`,
      },
      body: JSON.stringify({
        app_id: onesignalAppId,
        include_external_user_ids: [appUserId],
        headings: { en: title },
        contents: { en: message },
      }),
    });
  } catch (e) {
    console.error("terra-webhook push notification failed", e);
  }
}

async function findUserId(terraUserId: string | null, referenceId: string | null): Promise<string | null> {
  if (referenceId) return referenceId;
  if (!terraUserId) return null;
  const { data } = await supa.from("terra_connections").select("user_id").eq("terra_user_id", terraUserId).maybeSingle();
  return data?.user_id ?? null;
}

async function processWebhook(
  payload: any,
  signatureValid: boolean,
  secret: string,
  type: string,
  terraUserId: string | null,
  referenceId: string | null,
  provider: string,
): Promise<string | null> {
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

        // Garmin-only: trigger Terra historical re-fetch. Matching Railway Garmin
        // duplicates are deleted per Terra activity as each payload arrives.
        if (provider === "GARMIN") {
          const days = 7;
          const since = new Date(Date.now() - days * 86400_000);
          const sinceDate = since.toISOString().slice(0, 10);
          const endDate = new Date().toISOString().slice(0, 10);
          const startDate = sinceDate;

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
        let newActivityCount = 0;
        for (const a of acts) {
          const meta = a?.metadata ?? {};
          const dist = a?.distance_data?.summary ?? {};
          const hr = a?.heart_rate_data?.summary ?? {};
          const cal = a?.calories_data ?? {};
          const elev = a?.distance_data?.summary?.elevation ?? {};
          const distanceMeters = toFiniteNumber(dist?.distance_meters);
          const durationSeconds = extractDurationSeconds(a, distanceMeters);
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
          const isNew = !existing;
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
            duration_seconds: durationSeconds,
            distance_meters: distanceMeters,
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
          await deleteMatchingGarminDuplicate(appUserId, meta?.start_time ?? null, distanceMeters);
          if (isNew && (distanceMeters ?? 0) > 0) newActivityCount++;
        }
        // Recalculate XP & leaderboard rank from terra_activities
        await recalcUserXp(appUserId);
        if (newActivityCount > 0) {
          await pushActivityUploadedNotification(appUserId);
        }
      } else if (type === "daily" && appUserId) {
        const items = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        for (const d of items) {
          const meta = d?.metadata ?? {};
          const date = (meta?.start_time ?? "").slice(0, 10) || (meta?.end_time ?? "").slice(0, 10);
          if (!date) continue;
          const { data: existing } = await supa
            .from("terra_daily_health")
            .select("sleep_seconds, sleep_score")
            .eq("user_id", appUserId)
            .eq("provider", provider)
            .eq("date", date)
            .maybeSingle();
          await supa.from("terra_daily_health").upsert({
            user_id: appUserId,
            provider,
            date,
            resting_hr: d?.heart_rate_data?.summary?.resting_hr_bpm ?? null,
            steps: d?.distance_data?.steps ?? null,
            vo2max:
              toFiniteNumber(d?.oxygen_data?.vo2max_ml_per_min_per_kg) ??
              toFiniteNumber(d?.oxygen_data?.day_avg_vo2max_ml_per_min_per_kg),
            sleep_seconds: existing?.sleep_seconds ?? null,
            sleep_score: existing?.sleep_score ?? null,
          }, { onConflict: "user_id,provider,date" });
        }
      } else if (type === "sleep" && appUserId) {
        const items = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        for (const s of items) {
          const date = extractSleepDate(s);
          if (!date) continue;
          const sleepSeconds = extractSleepSeconds(s);
          const sleepScore = extractSleepScore(s);
          await supa.from("terra_daily_health").upsert({
            user_id: appUserId,
            provider,
            date,
            sleep_seconds: sleepSeconds,
            sleep_score: sleepScore,
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

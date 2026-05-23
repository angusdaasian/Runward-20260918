import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, type TerraEnv } from "./terraEnv.ts";

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
  if (!samples) return [];
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
  return Array.from(bySecond.entries()).sort((a, b) => a[0] - b[0]).map(([t, bpm]) => ({ t, bpm }));
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

async function pushActivityUploadedNotification(appUserId: string, activityKey: string) {
  try {
    // Idempotency guard: only the first call for this (user, activity) wins.
    // Concurrent webhook deliveries for the same activity will conflict here
    // and be skipped, preventing duplicate push notifications.
    const { data: claim, error: claimErr } = await supa
      .from("activity_push_log")
      .insert({ user_id: appUserId, activity_key: activityKey })
      .select("id")
      .maybeSingle();
    if (claimErr || !claim) {
      console.log(`[terra-webhook] push already sent for ${appUserId} ${activityKey}, skipping`);
      return;
    }
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

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function requestActivityHrSamplesWebhook(terraUserId: string, referenceId: string | null, provider: string, summaryId: string, startTime: string | null, env: TerraEnv = "prod", explicitStartDate?: string) {
  // Prefer explicit start date, then derive from startTime, else fall back to today UTC
  let startDate = explicitStartDate || (startTime ?? "").slice(0, 10);
  if (!startDate) {
    startDate = new Date().toISOString().slice(0, 10);
    // Widen window: yesterday -> tomorrow for empty-payload pings
    const y = new Date(); y.setUTCDate(y.getUTCDate() - 1);
    startDate = y.toISOString().slice(0, 10);
  }

  const { data: recent } = await supa
    .from("terra_webhook_events")
    .select("received_at, payload")
    .eq("terra_user_id", terraUserId)
    .eq("type", "terra_hr_samples_retry")
    .order("received_at", { ascending: false })
    .limit(20);
  const alreadyRequested = (recent ?? []).some((row: any) =>
    row?.payload?.summary_id === summaryId &&
    Date.now() - new Date(row.received_at).getTime() < 2 * 60 * 1000
  );
  if (alreadyRequested) return;

  // Empty-payload retry: widen end date by 2 days; otherwise just next day
  const endDate = explicitStartDate ? nextDate(nextDate(startDate)) : nextDate(startDate);
  const creds = getTerraCreds(env);
  const url = `https://api.tryterra.co/v2/activity?user_id=${terraUserId}&start_date=${startDate}&end_date=${endDate}&to_webhook=true&with_samples=true`;
  const response = await fetch(url, {
    headers: {
      "dev-id": creds.devId,
      "x-api-key": creds.apiKey,
    },
  });
  await supa.from("terra_webhook_events").insert({
    type: "terra_hr_samples_retry",
    terra_user_id: terraUserId,
    reference_id: referenceId,
    signature_valid: true,
    payload: {
      provider,
      summary_id: summaryId,
      start_date: startDate,
      end_date: endDate,
      to_webhook: true,
      with_samples: true,
      env,
      status: response.status,
      terra_reference: response.headers.get("terra-reference"),
    },
  });
  console.log(`[terra-webhook] requested HR samples webhook env=${env} summary=${summaryId} status=${response.status}`);
}

async function processWebhook(
  payload: any,
  signatureValid: boolean,
  secret: string,
  type: string,
  terraUserId: string | null,
  referenceId: string | null,
  provider: string,
  user: any,
  env: TerraEnv = "prod",
  oldUser: any = null,
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

        // All Terra providers: on auth, fetch past 7 days of activities
        // + today's daily/sleep snapshot. Skip historical daily/sleep
        // backfill — those payloads are huge and cause 504s.
        // Garmin Railway duplicates are deleted per Terra activity as
        // each payload arrives.
        {
          const today = new Date().toISOString().slice(0, 10);
          const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

          const creds = getTerraCreds(env);
          const devId = creds.devId;
          const apiKey = creds.apiKey;
          const headers = { "dev-id": devId, "x-api-key": apiKey };
          const calls: Array<{ ep: string; url: string }> = [
            {
              ep: "activity",
              url: `https://api.tryterra.co/v2/activity?user_id=${terraUserId}&start_date=${since}&end_date=${today}&to_webhook=true&with_samples=true`,
            },
            {
              ep: "daily",
              url: `https://api.tryterra.co/v2/daily?user_id=${terraUserId}&start_date=${today}&end_date=${today}&to_webhook=true&with_samples=false`,
            },
            {
              ep: "sleep",
              url: `https://api.tryterra.co/v2/sleep?user_id=${terraUserId}&start_date=${today}&end_date=${today}&to_webhook=true&with_samples=false`,
            },
          ];
          (async () => {
            const results = await Promise.allSettled(
              calls.map((c) => fetch(c.url, { headers }).then((r) => ({ ep: c.ep, status: r.status }))),
            );
            const summary = results.map((r, i) =>
              r.status === "fulfilled" ? r.value : { ep: calls[i].ep, error: String((r as any).reason) }
            );
            try {
              await supa.from("terra_webhook_events").insert({
                type: "terra_backfill",
                terra_user_id: terraUserId,
                reference_id: referenceId,
                signature_valid: true,
                payload: { provider, activity_window_days: 7, daily_date: today, results: summary } as any,
              });
            } catch (e) {
              console.error("terra_backfill log insert failed", e);
            }
          })();
        }
      } else if ((type === "deauth" || type === "access_revoked") && terraUserId) {
        await supa.from("terra_connections").update({ active: false, last_webhook_at: new Date().toISOString() }).eq("terra_user_id", terraUserId);
      } else if (type === "user_reauth" && terraUserId) {
        // Per Terra spec: update stored user_id to new_user.user_id, then stop.
        // Do NOT launch a new auth flow / widget. Do NOT trigger backfill —
        // Terra continues sending data for the new id automatically.
        const oldTerraId: string | null = oldUser?.user_id ?? null;
        const rawScopes = user?.scopes;
        const scopesArr = Array.isArray(rawScopes)
          ? rawScopes
          : typeof rawScopes === "string" && rawScopes.length > 0
            ? rawScopes.split(",").map((s: string) => s.trim()).filter(Boolean)
            : undefined;
        const patch: Record<string, unknown> = {
          terra_user_id: terraUserId,
          active: true,
          last_webhook_at: new Date().toISOString(),
        };
        if (referenceId) patch.reference_id = referenceId;
        if (scopesArr !== undefined) patch.scopes = scopesArr;

        if (oldTerraId) {
          const { error } = await supa.from("terra_connections")
            .update(patch)
            .eq("terra_user_id", oldTerraId);
          if (error) {
            console.error("user_reauth update by old terra_user_id failed", error);
            processingError = `user_reauth update: ${error.message}`;
          }
        } else if (referenceId) {
          // Fallback: match by app user id + provider when old_user is missing.
          const { error } = await supa.from("terra_connections")
            .update(patch)
            .eq("user_id", referenceId)
            .eq("provider", provider);
          if (error) {
            console.error("user_reauth update by reference_id failed", error);
            processingError = `user_reauth update: ${error.message}`;
          }
        } else {
          processingError = "user_reauth: missing old_user.user_id and reference_id";
        }
      } else if ((type === "activity" || type === "processed_activity") && appUserId) {
        const acts = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        // Empty-payload ping: Garmin/Terra notify us that activities exist
        // without sending the actual data. Re-request with samples=true.
        if (acts.length === 0 && terraUserId) {
          const today = new Date().toISOString().slice(0, 10);
          const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
          await requestActivityHrSamplesWebhook(
            terraUserId, referenceId, provider,
            `empty:${terraUserId}:${today}`,
            null, env, yesterday,
          );
        }
        let newActivityCount = 0;
        const newActivityKeys: string[] = [];
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
          const rawLaps = extractLaps(a);
          const hrSamples = extractHrSamples(a);
          const distanceSamples = extractDistanceSamples(a);
          const elevationSamples = extractElevationSamplesForChart(a);
          const cadenceSamples = extractCadenceSamples(a);
          const laps = hrSamples.length > 0 && rawLaps.length > 0
            ? recomputeLapAvgHr(rawLaps, hrSamples, meta?.start_time ?? null)
            : rawLaps;
          // Read existing row so we don't overwrite good polyline/laps/hr_samples with empty
          const { data: existing } = await supa
            .from("terra_activities")
            .select("summary_polyline, laps, has_gps, hr_samples, distance_samples, elevation_samples, cadence_samples")
            .eq("user_id", appUserId)
            .eq("terra_activity_id", aid)
            .maybeSingle();
          const isNew = !existing;
          const finalPolyline = polyline ?? existing?.summary_polyline ?? null;
          const finalLaps = (laps && laps.length > 0)
            ? laps
            : (Array.isArray(existing?.laps) && existing!.laps.length > 0 ? existing!.laps : []);
          const finalHasGps = !!finalPolyline || !!existing?.has_gps;
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
          console.log(`[terra-webhook] activity upsert ${aid} hr_samples=${hrSamples.length} dist_samples=${distanceSamples.length} elev_samples=${elevationSamples.length} cad_samples=${cadenceSamples.length} laps=${rawLaps.length}`);
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
            average_speed: (distanceMeters && durationSeconds && durationSeconds > 0)
              ? distanceMeters / durationSeconds
              : (a?.movement_data?.avg_speed_meters_per_second ?? null),
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
            has_gps: finalHasGps,
            laps: finalLaps,
            hr_samples: finalHrSamples,
            distance_samples: finalDistanceSamples,
            elevation_samples: finalElevationSamples,
            cadence_samples: finalCadenceSamples,
            raw_json: null,
          }, { onConflict: "user_id,terra_activity_id" });
          await deleteMatchingGarminDuplicate(appUserId, meta?.start_time ?? null, distanceMeters);
          if (hrSamples.length === 0 && terraUserId && (meta?.summary_id ?? meta?.id)) {
            await requestActivityHrSamplesWebhook(terraUserId, referenceId, provider, String(meta.summary_id ?? meta.id), meta?.start_time ?? null, env);
          }
          if (isNew && (distanceMeters ?? 0) > 0) {
            newActivityCount++;
            newActivityKeys.push(`terra:${provider}:${aid}`);
          }
        }
        // Recalculate XP & leaderboard rank from terra_activities
        await recalcUserXp(appUserId);
        if (newActivityCount > 0) {
          // Send one push per new activity, deduped by activity_push_log
          for (const key of newActivityKeys) {
            await pushActivityUploadedNotification(appUserId, key);
          }
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
          const newRestingHr = toFiniteNumber(d?.heart_rate_data?.summary?.resting_hr_bpm);
          const newSteps = toFiniteNumber(d?.distance_data?.steps);
          const vo2SamplesArr = Array.isArray(d?.oxygen_data?.vo2_samples) ? d.oxygen_data.vo2_samples : [];
          const lastVo2 = vo2SamplesArr.length > 0
            ? toFiniteNumber(vo2SamplesArr[vo2SamplesArr.length - 1]?.vo2max_ml_per_min_per_kg)
            : null;
          const newVo2max =
            toFiniteNumber(d?.oxygen_data?.vo2max_ml_per_min_per_kg) ??
            toFiniteNumber(d?.oxygen_data?.day_avg_vo2max_ml_per_min_per_kg) ??
            lastVo2;
          const newHrv =
            toFiniteNumber(d?.heart_rate_data?.summary?.avg_hrv_rmssd) ??
            toFiniteNumber(d?.heart_rate_data?.summary?.hrv_rmssd) ??
            toFiniteNumber(d?.heart_rate_data?.summary?.avg_hrv_sdnn) ??
            toFiniteNumber(d?.heart_rate_data?.summary?.avg_hrv);

          // Re-read existing row including current numeric stats so we don't blow them away with nulls.
          const { data: existingFull } = await supa
            .from("terra_daily_health")
            .select("resting_hr, steps, vo2max, hrv")
            .eq("user_id", appUserId)
            .eq("provider", provider)
            .eq("date", date)
            .maybeSingle();

          await supa.from("terra_daily_health").upsert({
            user_id: appUserId,
            provider,
            date,
            // Only overwrite if the new payload actually has a value; otherwise keep existing.
            resting_hr: newRestingHr ?? existingFull?.resting_hr ?? null,
            steps: newSteps ?? existingFull?.steps ?? null,
            vo2max: newVo2max ?? existingFull?.vo2max ?? null,
            hrv: newHrv ?? existingFull?.hrv ?? null,
            sleep_seconds: existing?.sleep_seconds ?? null,
            sleep_score: existing?.sleep_score ?? null,
          }, { onConflict: "user_id,provider,date" });
        }
      } else if (type === "sleep" && appUserId) {
        const items = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
        for (const s of items) {
          const date = extractSleepDate(s);
          if (!date) continue;

          // Skip naps so they don't overwrite the main nightly sleep record.
          const meta = s?.metadata ?? {};
          const isNap =
            meta?.is_nap === true ||
            meta?.nap === true ||
            (typeof meta?.sleep_type === "string" && meta.sleep_type.toLowerCase().includes("nap"));
          if (isNap) {
            console.log(`[terra-webhook] skipping nap sleep for ${appUserId} ${date}`);
            continue;
          }

          const sleepSeconds = extractSleepSeconds(s);
          const sleepScore = extractSleepScore(s);
          const sum = s?.heart_rate_data?.summary ?? {};
          const sleepHrv = toFiniteNumber(sum?.avg_hrv_rmssd);
          const sleepRhr = toFiniteNumber(sum?.resting_hr_bpm);

          // Defensive: very short sleep (<3h) is almost certainly a nap mis-tagged.
          if (sleepSeconds != null && sleepSeconds < 3 * 3600) {
            console.log(`[terra-webhook] skipping short sleep (${sleepSeconds}s) for ${appUserId} ${date}`);
            continue;
          }

          // Don't overwrite a longer existing sleep with a shorter one for the same date.
          const { data: existingSleep } = await supa
            .from("terra_daily_health")
            .select("sleep_seconds, sleep_score, hrv, resting_hr")
            .eq("user_id", appUserId)
            .eq("provider", provider)
            .eq("date", date)
            .maybeSingle();

          const useNew =
            sleepSeconds != null &&
            (existingSleep?.sleep_seconds == null || sleepSeconds >= existingSleep.sleep_seconds);
          const finalSleepSeconds = useNew ? sleepSeconds : (existingSleep?.sleep_seconds ?? null);
          const finalSleepScore = useNew
            ? (sleepScore ?? existingSleep?.sleep_score ?? null)
            : (existingSleep?.sleep_score ?? null);
          const finalHrv = useNew
            ? (sleepHrv ?? existingSleep?.hrv ?? null)
            : (existingSleep?.hrv ?? sleepHrv ?? null);
          const finalRhr = useNew
            ? (sleepRhr ?? existingSleep?.resting_hr ?? null)
            : (existingSleep?.resting_hr ?? sleepRhr ?? null);

          console.log(`[terra-webhook] sleep ${appUserId} ${date} hrv=${sleepHrv} rhr=${sleepRhr} sec=${sleepSeconds}`);

          await supa.from("terra_daily_health").upsert({
            user_id: appUserId,
            provider,
            date,
            sleep_seconds: finalSleepSeconds,
            sleep_score: finalSleepScore,
            hrv: finalHrv != null ? Math.round(Number(finalHrv) * 10) / 10 : null,
            resting_hr: finalRhr != null ? Math.round(Number(finalRhr)) : null,
          }, { onConflict: "user_id,provider,date" });
        }
      }
    }
  } catch (e) {
    processingError = String(e);
    console.error("terra-webhook processing error", e);
  }
  return processingError;
}

/**
 * Webhook handler — enqueue ONLY.
 *
 * Terra enforces an 8s timeout + circuit breaker. We do ZERO processing
 * here: no signature verification, no S3 fetch, no JSON parsing, no
 * upserts. We just drop the raw body into a queue and ACK 200. A separate
 * worker (`process-terra-queue`) drains the queue on a cron.
 */
export async function handleTerraWebhook(req: Request, env: TerraEnv = "prod"): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const raw = await req.text();
    const sigHeader = req.headers.get("terra-signature");
    const { error } = await supa.from("terra_webhook_queue").insert({
      env,
      raw_body: raw,
      signature_header: sigHeader,
    });
    if (error) console.error("[terra-webhook] enqueue failed", error);
  } catch (e) {
    console.error("[terra-webhook] enqueue threw", e);
  }

  // Always ACK so Terra's circuit breaker stays closed; the reconciler
  // cron will re-fetch anything we lose.
  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/**
 * Worker entry point — called by `process-terra-queue` for each claimed
 * queue row. Contains the full pipeline that used to run inside the
 * webhook background task: signature verify, S3 ping fetch, event log
 * insert, and `processWebhook`.
 */
export async function processQueuedTerraWebhook(
  raw: string,
  sigHeader: string | null,
  env: TerraEnv = "prod",
): Promise<{ ok: boolean; error?: string }> {
  const secret = getTerraCreds(env).signingSecret;

  let signatureValid = false;
  try { signatureValid = secret ? await verifySignature(secret, sigHeader, raw) : false; } catch { signatureValid = false; }

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { payload = { _parse_error: true, raw }; }

  // ── Ping mode (S3 payload delivery) ──
  if (payload?.type === "s3_payload" && typeof payload?.url === "string") {
    const pingUrl: string = payload.url;
    try {
      const resp = await fetch(pingUrl);
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error("[terra-worker] ping fetch failed", resp.status, body);
        await supa.from("terra_webhook_events").insert({
          type: "s3_payload_fetch_error",
          payload: { url: pingUrl, status: resp.status, env },
          signature_valid: signatureValid,
          processing_error: `ping fetch ${resp.status}`,
        });
        return { ok: false, error: `ping fetch ${resp.status}` };
      }
      payload = await resp.json();
    } catch (e: any) {
      console.error("[terra-worker] ping fetch threw", e?.message ?? e);
      await supa.from("terra_webhook_events").insert({
        type: "s3_payload_fetch_error",
        payload: { url: pingUrl, env },
        signature_valid: signatureValid,
        processing_error: String(e?.message ?? e),
      });
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  const type: string = payload?.type ?? "unknown";
  const isReauth = type === "user_reauth";
  const user = isReauth ? (payload?.new_user ?? {}) : (payload?.user ?? {});
  const oldUser = isReauth ? (payload?.old_user ?? null) : null;
  const terraUserId: string | null = user?.user_id ?? null;
  const referenceId: string | null = user?.reference_id ?? null;
  const provider: string = mapProvider(user?.provider ?? payload?.resource);

  const dataArr: any[] = Array.isArray(payload?.data)
    ? payload.data
    : payload?.data ? [payload.data] : [];
  const payloadIds: string[] = dataArr
    .map((d: any) => d?.metadata?.summary_id ?? d?.summary_id ?? d?.metadata?.upload_id ?? d?.metadata?.id ?? null)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);

  const { data: eventRow, error: eventInsertErr } = await supa
    .from("terra_webhook_events")
    .insert({
      type,
      terra_user_id: terraUserId,
      reference_id: referenceId,
      signature_valid: signatureValid,
      payload_ids: payloadIds.length > 0 ? payloadIds : null,
      payload: isReauth
        ? { type, old_user: payload?.old_user, new_user: payload?.new_user, env }
        : { type, user: payload?.user, env, count: Array.isArray(payload?.data) ? payload.data.length : (payload?.data ? 1 : 0) },
      processing_error: null,
    })
    .select("id")
    .single();
  if (eventInsertErr) console.error("terra_webhook_events insert failed", eventInsertErr);

  const err = await processWebhook(payload, signatureValid, secret, type, terraUserId, referenceId, provider, user, env, oldUser);
  if (err && eventRow?.id) {
    await supa.from("terra_webhook_events").update({ processing_error: err }).eq("id", eventRow.id);
  }

  return err ? { ok: false, error: err } : { ok: true };
}

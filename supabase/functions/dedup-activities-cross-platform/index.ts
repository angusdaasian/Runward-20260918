// Cross-platform activity deduplication.
// Auth: requires x-webhook-key header (WEBHOOK_AUTH_KEY) OR a valid admin JWT.
// Body: { userId?: string, sinceDays?: number, dryRun?: boolean }
//   - userId omitted => sweep every user
//   - dryRun true => report only, no deletes (default: false)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

type Src =
  | "garmin"
  | "suunto"
  | "polar"
  | "strava"
  | "terra"
  | "apple_health"
  | "intervals";

interface Row {
  source: Src;
  id: string;               // primary key on that table
  userId: string;
  startMs: number;
  distanceM: number;
  durationS: number;
  sport: string | null;
  richness: number;         // fill-score for tiebreak
}

// Higher = prefer to keep. Terra is highest — richest normalized data.
const SOURCE_PRIORITY: Record<Src, number> = {
  terra: 100,
  garmin: 90,
  suunto: 80,
  polar: 75,
  strava: 70,
  apple_health: 40,
  intervals: 30,
};


const RUN_SPORTS = new Set([
  "Run", "TrailRun", "VirtualRun", "Treadmill", "Workout",
  "running", "trail_running", "virtual_running", "treadmill_running",
  "RUNNING", "TRAIL_RUNNING", "TREADMILL_RUNNING",
]);

function fillScore(o: Record<string, unknown>): number {
  let n = 0;
  for (const v of Object.values(o)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.length === 0) continue;
    n++;
  }
  return n;
}

async function loadUserActivities(supabase: any, userId: string, sinceIso: string): Promise<Row[]> {
  const rows: Row[] = [];

  const [strava, apple, garmin, terra, suunto, polar, intervals] = await Promise.all([
    supabase.from("strava_activities").select("id,distance,moving_time,start_date,sport_type,name,average_heartrate,total_elevation_gain,summary_polyline").eq("user_id", userId).gte("start_date", sinceIso),
    supabase.from("apple_health_activities").select("id,distance,moving_time,start_date,sport_type,name,average_heartrate,total_elevation_gain,calories").eq("user_id", userId).gte("start_date", sinceIso),
    supabase.from("garmin_activities").select("id,distance_meters,duration_seconds,start_time,activity_type,activity_name,average_hr,elevation_gain,summary_polyline,has_gps").eq("user_id", userId).gte("start_time", sinceIso),
    supabase.from("terra_activities").select("id,distance_meters,duration_seconds,start_time,activity_type,activity_name,average_hr,elevation_gain,summary_polyline,has_gps,provider").eq("user_id", userId).gte("start_time", sinceIso),
    supabase.from("suunto_activities").select("id,distance,moving_time,start_date,sport_type,name,average_heartrate,summary_polyline,total_elevation_gain,has_details").eq("user_id", userId).gte("start_date", sinceIso),
    supabase.from("polar_activities").select("id,distance,duration,start_date,sport_type,average_heart_rate,has_route,training_load,calories").eq("user_id", userId).gte("start_date", sinceIso),
    supabase.from("intervals_activities").select("id,distance,moving_time,start_date,sport_type,name,average_heartrate,summary_polyline,total_elevation_gain").eq("user_id", userId).gte("start_date", sinceIso),
  ]);

  const push = (
    source: Src,
    r: any,
    startField: string,
    distField: string,
    durField: string,
    sportField: string,
  ) => {
    const startMs = r[startField] ? new Date(r[startField]).getTime() : NaN;
    if (!isFinite(startMs)) return;
    const distanceM = Number(r[distField] ?? 0);
    const durationS = Number(r[durField] ?? 0);
    rows.push({
      source,
      id: r.id,
      userId,
      startMs,
      distanceM,
      durationS,
      sport: r[sportField] ?? null,
      richness: fillScore(r),
    });
  };

  (strava.data || []).forEach((r: any) => push("strava", r, "start_date", "distance", "moving_time", "sport_type"));
  (apple.data || []).forEach((r: any) => push("apple_health", r, "start_date", "distance", "moving_time", "sport_type"));
  (garmin.data || []).forEach((r: any) => push("garmin", r, "start_time", "distance_meters", "duration_seconds", "activity_type"));
  (terra.data || []).forEach((r: any) => push("terra", r, "start_time", "distance_meters", "duration_seconds", "activity_type"));
  (suunto.data || []).forEach((r: any) => push("suunto", r, "start_date", "distance", "moving_time", "sport_type"));
  (polar.data || []).forEach((r: any) => push("polar", r, "start_date", "distance", "duration", "sport_type"));
  (intervals.data || []).forEach((r: any) => push("intervals", r, "start_date", "distance", "moving_time", "sport_type"));

  return rows;
}

/**
 * Returns true if two activities look like duplicates.
 *   Rule 1: |Δstart| ≤ 15 min AND distance within 10%.
 *   Rule 2: same UTC calendar day AND distance within 5% AND Δstart is a
 *           near-integer-hour offset (within ±5 min of an integer hour between
 *           1 and 17 hours) — catches timezone mismatch (e.g. Apple UTC vs Terra UTC+8).
 * Non-running activities dedup only via Rule 1 (stricter).
 */
function looksDuplicate(a: Row, b: Row): { dup: boolean; reason: string } {
  const distMax = Math.max(a.distanceM, b.distanceM);
  const distMin = Math.min(a.distanceM, b.distanceM);
  if (distMax < 100) return { dup: false, reason: "" }; // ignore <100m
  const distRatio = distMin / distMax; // 1.0 = identical
  const dtMs = Math.abs(a.startMs - b.startMs);
  const dtMin = dtMs / 60000;

  // Rule 1 – close in time, distance within 10%.
  if (dtMin <= 15 && distRatio >= 0.9) {
    return { dup: true, reason: `time≈(${dtMin.toFixed(1)}m) dist≈(${(distRatio * 100).toFixed(1)}%)` };
  }

  const isRunA = RUN_SPORTS.has(String(a.sport ?? ""));
  const isRunB = RUN_SPORTS.has(String(b.sport ?? ""));
  if (!isRunA || !isRunB) return { dup: false, reason: "" };

  // Rule 2 – timezone shift: same UTC day, distance within 5%, offset ≈ int hours.
  const dayA = Math.floor(a.startMs / 86_400_000);
  const dayB = Math.floor(b.startMs / 86_400_000);
  if (Math.abs(dayA - dayB) > 1) return { dup: false, reason: "" };
  if (distRatio < 0.95) return { dup: false, reason: "" };

  const dtHours = dtMs / 3_600_000;
  if (dtHours < 1 || dtHours > 17) return { dup: false, reason: "" };
  const nearest = Math.round(dtHours);
  const drift = Math.abs(dtHours - nearest) * 60; // minutes off integer hour
  if (drift > 5) return { dup: false, reason: "" };

  return { dup: true, reason: `tz-shift ${nearest}h dist≈(${(distRatio * 100).toFixed(1)}%)` };
}

function chooseWinner(a: Row, b: Row): { keep: Row; drop: Row } {
  const pa = SOURCE_PRIORITY[a.source] ?? 0;
  const pb = SOURCE_PRIORITY[b.source] ?? 0;
  if (pa !== pb) return pa > pb ? { keep: a, drop: b } : { keep: b, drop: a };
  if (a.richness !== b.richness) return a.richness > b.richness ? { keep: a, drop: b } : { keep: b, drop: a };
  if (a.distanceM !== b.distanceM) return a.distanceM > b.distanceM ? { keep: a, drop: b } : { keep: b, drop: a };
  return { keep: a, drop: b };
}

const TABLE_FOR: Record<Src, string> = {
  strava: "strava_activities",
  apple_health: "apple_health_activities",
  garmin: "garmin_activities",
  terra: "terra_activities",
  suunto: "suunto_activities",
  polar: "polar_activities",
  intervals: "intervals_activities",
};

interface UserResult {
  userId: string;
  scanned: number;
  duplicatesFound: number;
  deleted: number;
  details: Array<{ keep: string; drop: string; reason: string }>;
}

async function dedupUser(supabase: any, userId: string, sinceIso: string, dryRun: boolean): Promise<UserResult> {
  const rows = await loadUserActivities(supabase, userId, sinceIso);
  rows.sort((a, b) => a.startMs - b.startMs);

  const dropped = new Set<string>(); // `${source}:${id}`
  const details: UserResult["details"] = [];

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    const keyA = `${a.source}:${a.id}`;
    if (dropped.has(keyA)) continue;
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j];
      if ((b.startMs - a.startMs) > 18 * 3_600_000) break; // window
      const keyB = `${b.source}:${b.id}`;
      if (dropped.has(keyB)) continue;
      if (a.source === b.source) continue; // in-source dedup handled elsewhere
      const { dup, reason } = looksDuplicate(a, b);
      if (!dup) continue;
      const { keep, drop } = chooseWinner(a, b);
      const keyDrop = `${drop.source}:${drop.id}`;
      dropped.add(keyDrop);
      details.push({
        keep: `${keep.source}:${keep.id}`,
        drop: keyDrop,
        reason,
      });
      if (drop === a) break; // a was dropped, move on
    }
  }

  let deleted = 0;
  if (!dryRun && dropped.size > 0) {
    // Group by table then delete in chunks.
    const bySource = new Map<Src, string[]>();
    for (const key of dropped) {
      const [src, id] = key.split(":") as [Src, string];
      const arr = bySource.get(src) || [];
      arr.push(id);
      bySource.set(src, arr);
    }
    for (const [src, ids] of bySource) {
      const table = TABLE_FOR[src];
      for (let k = 0; k < ids.length; k += 100) {
        const chunk = ids.slice(k, k + 100);
        const { error } = await supabase.from(table).delete().eq("user_id", userId).in("id", chunk);
        if (error) {
          console.error(`[dedup] delete failed table=${table} user=${userId}`, error);
          continue;
        }
        deleted += chunk.length;
      }
    }
  }

  return {
    userId,
    scanned: rows.length,
    duplicatesFound: dropped.size,
    deleted,
    details: details.slice(0, 50),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: webhook key OR admin JWT
    const webhookKey = Deno.env.get("WEBHOOK_AUTH_KEY");
    const providedKey = req.headers.get("x-webhook-key") || "";
    let authorized = !!webhookKey && providedKey === webhookKey;

    if (!authorized) {
      const auth = req.headers.get("Authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      if (token) {
        const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
        const { data: { user } } = await anon.auth.getUser(token);
        if (user) {
          const svc = createClient(SUPABASE_URL, SERVICE);
          const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
          if (role) authorized = true;
        }
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;
    const sinceHours: number | undefined = body?.sinceHours ? Math.max(1, Number(body.sinceHours)) : undefined;
    const sinceDays: number = Math.max(1, Number(body?.sinceDays ?? 90));
    const dryRun: boolean = body?.dryRun !== false ? body?.dryRun === true : false; // default false
    const sinceMs = sinceHours ? sinceHours * 3_600_000 : sinceDays * 86_400_000;
    const sinceIso = new Date(Date.now() - sinceMs).toISOString();


    const results: UserResult[] = [];

    if (userId) {
      results.push(await dedupUser(supabase, userId, sinceIso, dryRun));
    } else {
      // Sweep every user that has any activity — union across sources.
      const sources: Array<{ table: string }> = [
        { table: "strava_activities" },
        { table: "apple_health_activities" },
        { table: "garmin_activities" },
        { table: "terra_activities" },
        { table: "suunto_activities" },
        { table: "polar_activities" },
        { table: "intervals_activities" },
      ];
      const userIds = new Set<string>();
      for (const s of sources) {
        // paginate
        let from = 0;
        while (true) {
          const { data, error } = await supabase.from(s.table).select("user_id").range(from, from + 999);
          if (error || !data || data.length === 0) break;
          for (const r of data) userIds.add((r as any).user_id);
          if (data.length < 1000) break;
          from += 1000;
        }
      }
      console.log(`[dedup] sweeping ${userIds.size} users, sinceDays=${sinceDays}, dryRun=${dryRun}`);
      let i = 0;
      for (const uid of userIds) {
        i++;
        try {
          const r = await dedupUser(supabase, uid, sinceIso, dryRun);
          if (r.duplicatesFound > 0) results.push(r);
        } catch (e) {
          console.error(`[dedup] user ${uid} failed`, e);
        }
        if (i % 25 === 0) console.log(`[dedup] progress ${i}/${userIds.size}`);
      }
    }

    const totals = results.reduce(
      (acc, r) => ({
        scanned: acc.scanned + r.scanned,
        duplicatesFound: acc.duplicatesFound + r.duplicatesFound,
        deleted: acc.deleted + r.deleted,
      }),
      { scanned: 0, duplicatesFound: 0, deleted: 0 },
    );

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        sinceDays,
        usersWithDuplicates: results.length,
        totals,
        results: results.slice(0, 500),
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[dedup-activities-cross-platform] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

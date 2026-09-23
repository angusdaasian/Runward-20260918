// Temporary Garmin/Railway fallback poller.
//
// Terra is currently not delivering Garmin activities, so this function polls
// the Railway python-garminconnect service directly for users who saved Garmin
// credentials. It only looks at activities on/after POLL_START_ISO (the last
// Terra/Garmin delivery) so we never touch older history. When Terra resumes,
// its webhook data overwrites these rows in terra_activities as usual.
//
// Scheduled by pg_cron every minute; each run processes a small batch of users
// (round-robin by garmin_connections.last_polled_at) to stay within limits.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callRailway } from "../_shared/garminRailway.ts";
import { decryptString } from "../_shared/garminCrypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Kill switch: flip to true to resume polling. Disabled while the database
// recovers from overload / while all saved Garmin sign-ins are expired.
const POLL_ENABLED = false;

// Last activity Terra delivered — never poll anything before this.
const POLL_START_ISO = "2026-09-21T10:40:00Z";
const BATCH_SIZE = 8;
const DETAIL_LIMIT = 3;

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Garmin returns local (HKT) times labelled as UTC — shift back 8 hours.
function adjustGarminTime(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setUTCHours(d.getUTCHours() - 8);
  return d.toISOString();
}

const toInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? Math.round(n) : null;
};

serve(async (req) => {
  if (!POLL_ENABLED) {
    return new Response(JSON.stringify({ skipped: true, reason: "polling disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });


  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GARMIN_RAILWAY_URL = Deno.env.get("GARMIN_RAILWAY_URL");

  if (!GARMIN_RAILWAY_URL) {
    return new Response(JSON.stringify({ error: "Garmin service not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const windowStart = new Date(POLL_START_ISO);
  const now = new Date();
  const startDate = fmtDate(windowStart);
  const endDate = fmtDate(now);

  try {
    const { data: conns, error: connErr } = await supabase
      .from("garmin_connections")
      .select("user_id, garmin_email_encrypted, oauth1_token_encrypted, oauth2_token_encrypted, last_polled_at")
      .or("needs_reauth.is.null,needs_reauth.eq.false")
      .order("last_polled_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    if (connErr) throw connErr;

    const results: Array<Record<string, unknown>> = [];

    for (const conn of conns ?? []) {
      const userId = conn.user_id as string;
      // Claim the slot first so a failure doesn't block the rotation.
      await supabase
        .from("garmin_connections")
        .update({ last_polled_at: new Date().toISOString() })
        .eq("user_id", userId);

      let email: string | null = null;
      let oauth1: string | null = null;
      let oauth2: string | null = null;
      try {
        if (conn.garmin_email_encrypted) email = await decryptString(conn.garmin_email_encrypted);
        if (conn.oauth1_token_encrypted) oauth1 = await decryptString(conn.oauth1_token_encrypted);
        if (conn.oauth2_token_encrypted) oauth2 = await decryptString(conn.oauth2_token_encrypted);
      } catch (e) {
        console.error(`[garmin-poll] decrypt failed user=${userId}`, e);
      }
      if (!email || !oauth1 || !oauth2) {
        // No usable tokens — flag so this connection is never polled again
        // until the user signs in again.
        await supabase
          .from("garmin_connections")
          .update({ needs_reauth: true })
          .eq("user_id", userId);
        results.push({ user_id: userId, skipped: "missing_credentials", flagged_reauth: true });
        continue;
      }

      const actResult = await callRailway<any>({
        supabase,
        userId,
        railwayUrl: GARMIN_RAILWAY_URL,
        path: "/garmin-activities",
        email,
        oauth1Token: oauth1,
        oauth2Token: oauth2,
        extraBody: { start_date: startDate, end_date: endDate },
      });
      oauth1 = actResult.oauth1Token;
      oauth2 = actResult.oauth2Token;

      if (!actResult.ok) {
        console.error(`[garmin-poll] fetch failed user=${userId}`, actResult.status, actResult.errorText);
        // Treat any auth-shaped failure (expired/invalid/unauthorized tokens)
        // like a 401: flag needs_reauth so we stop polling this connection.
        const errText = (actResult.errorText ?? "").toLowerCase();
        const looksExpired =
          actResult.status === 401 ||
          actResult.status === 403 ||
          /expired|invalid|unauthori[sz]ed|reauth|login required|credentials/.test(errText);
        if (looksExpired) {
          await supabase
            .from("garmin_connections")
            .update({ needs_reauth: true })
            .eq("user_id", userId);
        }
        results.push({
          user_id: userId,
          error: actResult.status,
          reauth: !!actResult.reauthRequired || looksExpired,
          flagged_reauth: looksExpired,
        });
        continue;
      }

      const raw = actResult.data as any;
      const activities: any[] = Array.isArray(raw?.activities)
        ? raw.activities
        : Array.isArray(raw)
          ? raw
          : [];

      const rows = activities
        .map((a: any) => ({
          user_id: userId,
          garmin_activity_id: String(a.garmin_activity_id ?? a.activity_id ?? ""),
          activity_name: a.name ?? a.activity_name ?? "Garmin Activity",
          activity_type: a.sport_type ?? a.activity_type ?? "Run",
          start_time: adjustGarminTime(a.start_date ?? a.start_time),
          duration_seconds: toInt(a.moving_time ?? a.duration_seconds) ?? 0,
          distance_meters: a.distance ?? a.distance_meters ?? 0,
          calories: toInt(a.calories),
          average_hr: toInt(a.average_heartrate ?? a.average_hr),
          max_hr: toInt(a.max_heartrate ?? a.max_hr),
          elevation_gain: a.total_elevation_gain ?? a.elevation_gain ?? null,
          average_speed: a.average_speed ?? null,
          average_pace: a.average_pace ?? null,
          avg_cadence: a.avg_cadence ?? null,
          aerobic_te: a.aerobic_te ?? null,
          anaerobic_te: a.anaerobic_te ?? null,
          vo2max: a.vo2max ?? null,
          training_load: a.training_load ?? null,
          has_gps: a.has_gps ?? false,
          raw_json: a,
        }))
        // Hard guard: never write anything before the Terra cutoff.
        .filter((r) => r.garmin_activity_id && r.start_time && new Date(r.start_time) >= windowStart);

      let synced = 0;
      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .from("garmin_activities")
          .upsert(rows, { onConflict: "garmin_activity_id,user_id", ignoreDuplicates: false });
        if (upErr) console.error(`[garmin-poll] upsert failed user=${userId}`, upErr);
        else synced = rows.length;
      }

      // Fill in laps / route for the newest activities that still lack them.
      let detailsFetched = 0;
      const { data: candidates } = await supabase
        .from("garmin_activities")
        .select("id, garmin_activity_id, laps, has_details")
        .eq("user_id", userId)
        .gte("start_time", windowStart.toISOString())
        .order("start_time", { ascending: false })
        .limit(30);

      const missing = (candidates ?? [])
        .filter((c: any) => !c.has_details || !Array.isArray(c.laps) || c.laps.length === 0)
        .slice(0, DETAIL_LIMIT);

      if (missing && missing.length > 0) {
        const detailResult = await callRailway<Record<string, any>>({
          supabase,
          userId,
          railwayUrl: GARMIN_RAILWAY_URL,
          path: "/garmin-activity-details",
          email,
          oauth1Token: oauth1,
          oauth2Token: oauth2,
          extraBody: { activity_ids: missing.map((m) => m.garmin_activity_id).join(",") },
        });
        if (detailResult.ok && detailResult.data) {
          const d = detailResult.data as any;
          const details: Record<string, any> = d?.details && typeof d.details === "object" ? d.details : d;
          for (const item of missing) {
            const detail = details?.[item.garmin_activity_id];
            // Nothing came back — leave has_details alone so we retry next cycle.
            if (!detail) continue;
            const laps = Array.isArray(detail.laps) ? detail.laps : [];
            const patch: Record<string, unknown> = { has_details: true };
            if (laps.length > 0) patch.laps = laps;
            if (detail.weather) patch.weather = detail.weather;
            if (detail.map_polyline) {
              patch.summary_polyline = detail.map_polyline;
              patch.has_gps = true;
            }
            await supabase.from("garmin_activities").update(patch).eq("id", item.id);
            detailsFetched++;
          }
        } else {
          console.error(`[garmin-poll] details failed user=${userId}`, detailResult.errorText);
        }
      }


      results.push({ user_id: userId, synced, details_fetched: detailsFetched });
    }

    return new Response(
      JSON.stringify({ success: true, window: { start: startDate, end: endDate }, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[garmin-poll] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

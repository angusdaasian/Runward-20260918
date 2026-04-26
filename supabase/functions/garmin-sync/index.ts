import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callRailway } from "../_shared/garminRailway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function percentVO2(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}
function vo2Cost(velocity: number): number {
  return -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
}
function calculateVdot(distanceMeters: number, timeSeconds: number): number {
  const minutes = timeSeconds / 60;
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

const runningSportTypes = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill", "Workout", "running", "trail_running", "treadmill_running"]);

// ── Sync window config ──
// First-ever sync pulls everything from this date forward.
// Incremental syncs use max(last_synced - OVERLAP_DAYS, FIRST_SYNC_START).
const FIRST_SYNC_START_ISO = "2026-01-01";
const INCREMENTAL_OVERLAP_DAYS = 7;

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build month-by-month [start, end] chunks (inclusive) from `start` to `end`.
 * Each chunk spans at most one calendar month.
 */
function buildMonthlyChunks(start: Date, end: Date): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  if (start > end) return chunks;

  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const finalEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  while (cursor <= finalEnd) {
    // Last day of cursor's month
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const chunkEnd = monthEnd > finalEnd ? finalEnd : monthEnd;
    chunks.push({ start: fmtDate(cursor), end: fmtDate(chunkEnd) });
    // Move cursor to first day of next month
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
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
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ── SYNC ──
    if (action === "sync") {
      const { data: conn } = await supabase
        .from("garmin_connections")
        .select("garmin_email_encrypted, access_token, oauth1_token_encrypted, oauth2_token_encrypted, full_resync_done")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!conn) {
        return new Response(JSON.stringify({ error: "No Garmin connection found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Garmin is the source of truth for activities — purge any Apple Health
      // activities that fall inside the Garmin coverage window (i.e. on/after
      // the earliest Garmin activity). Anything BEFORE the Garmin coverage is
      // kept (e.g. AH activities the user logged after a previous Garmin
      // disconnect). The apple_health_connections row is preserved so daily
      // health stats (steps, sleep, calories) keep flowing.
      const { data: earliestGarmin } = await supabase
        .from("garmin_activities")
        .select("start_time")
        .eq("user_id", user.id)
        .not("start_time", "is", null)
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (earliestGarmin?.start_time) {
        const { error: ahPurgeError } = await supabase
          .from("apple_health_activities")
          .delete()
          .eq("user_id", user.id)
          .gte("start_date", earliestGarmin.start_time);
        if (ahPurgeError) {
          console.warn(`[garmin-sync] failed to purge apple_health_activities for ${user.id}:`, ahPurgeError.message);
        }
      }

      // Decrypt email + tokens.
      let garminEmail: string | null = null;
      let oauth1Token: string | null = null;
      let oauth2Token: string | null = null;
      const { decryptString } = await import("../_shared/garminCrypto.ts");
      if (conn.garmin_email_encrypted) {
        try { garminEmail = await decryptString(conn.garmin_email_encrypted); }
        catch (e) { console.error("Failed to decrypt email:", e); }
      }
      if (!garminEmail) garminEmail = conn.access_token;

      if (conn.oauth1_token_encrypted) {
        try { oauth1Token = await decryptString(conn.oauth1_token_encrypted); }
        catch (e) { console.error("Failed to decrypt oauth1:", e); }
      }
      if (conn.oauth2_token_encrypted) {
        try { oauth2Token = await decryptString(conn.oauth2_token_encrypted); }
        catch (e) { console.error("Failed to decrypt oauth2:", e); }
      }

      if (!garminEmail || !oauth1Token || !oauth2Token) {
        return new Response(JSON.stringify({ error: "Garmin sign-in expired", reauth_required: true }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Determine sync window ──
      const firstSyncStart = new Date(`${FIRST_SYNC_START_ISO}T00:00:00Z`);
      const today = new Date();

      // If user hasn't done the one-time full 2026 resync yet, normally we wipe
      // their existing 2026 activities and re-pull. But first check if their data
      // already looks complete — i.e. they have ≥1 activity in EVERY month from
      // Jan 2026 up to the current month. If so, the previous sync clearly worked
      // and we can skip the expensive wipe-and-repull, just mark the flag done
      // and fall through to the normal incremental path.
      let needsFullResync = !conn.full_resync_done;
      let isFirstSync = false;
      let windowStart: Date;

      if (needsFullResync) {
        // Build list of months from Jan 2026 → current month (inclusive)
        const monthsToCheck: Array<{ start: string; end: string; label: string }> = [];
        let mCursor = new Date(Date.UTC(firstSyncStart.getUTCFullYear(), firstSyncStart.getUTCMonth(), 1));
        const mEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        while (mCursor <= mEnd) {
          const next = new Date(Date.UTC(mCursor.getUTCFullYear(), mCursor.getUTCMonth() + 1, 1));
          monthsToCheck.push({
            start: mCursor.toISOString(),
            end: next.toISOString(),
            label: `${mCursor.getUTCFullYear()}-${String(mCursor.getUTCMonth() + 1).padStart(2, "0")}`,
          });
          mCursor = next;
        }

        // Check each month for at least 1 activity
        const missingMonths: string[] = [];
        for (const m of monthsToCheck) {
          const { count, error: countErr } = await supabase
            .from("garmin_activities")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("start_time", m.start)
            .lt("start_time", m.end);
          if (countErr) {
            console.warn(`[garmin-sync] month-check error for ${m.label}:`, countErr.message);
            // On error, be safe and assume the month is missing → trigger resync
            missingMonths.push(m.label);
          } else if (!count || count === 0) {
            missingMonths.push(m.label);
          }
        }

        if (missingMonths.length === 0) {
          // Data is intact across all months — skip the wipe, mark flag done.
          console.log(`[garmin-sync] user=${user.id} already has activities in every month (${monthsToCheck.map(m => m.label).join(",")}) — skipping full resync`);
          const { error: flagErr } = await supabase
            .from("garmin_connections")
            .update({ full_resync_done: true })
            .eq("user_id", user.id);
          if (flagErr) console.error("[garmin-sync] failed to set full_resync_done on skip path:", flagErr);
          needsFullResync = false;
          // Fall through to incremental logic below
        }
      }

      if (needsFullResync) {
        console.log(`[garmin-sync] user=${user.id} performing one-time full 2026 resync — wiping existing activities`);
        const { error: wipeErr } = await supabase
          .from("garmin_activities")
          .delete()
          .eq("user_id", user.id)
          .gte("start_time", firstSyncStart.toISOString());
        if (wipeErr) {
          console.error("[garmin-sync] wipe failed:", wipeErr);
          return new Response(JSON.stringify({ error: `Failed to clear existing activities: ${wipeErr.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        isFirstSync = true;
        windowStart = firstSyncStart;
      } else {
        const { data: latestRow } = await supabase
          .from("garmin_activities")
          .select("start_time")
          .eq("user_id", user.id)
          .not("start_time", "is", null)
          .order("start_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latestRow?.start_time) {
          isFirstSync = true;
          windowStart = firstSyncStart;
        } else {
          const lastSynced = new Date(latestRow.start_time);
          const overlap = new Date(lastSynced.getTime() - INCREMENTAL_OVERLAP_DAYS * 24 * 60 * 60 * 1000);
          windowStart = overlap < firstSyncStart ? firstSyncStart : overlap;
        }
      }

      const chunks = buildMonthlyChunks(windowStart, today);
      console.log(`[garmin-sync] user=${user.id} firstSync=${isFirstSync} fullResync=${needsFullResync} window=${fmtDate(windowStart)}→${fmtDate(today)} chunks=${chunks.length}`);


      // Garmin API returns times in local time (HKT UTC+8) but labels them as UTC,
      // so we subtract 8 hours to get the real UTC time.
      function adjustGarminTime(dateStr: string | undefined | null): string | null {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        d.setUTCHours(d.getUTCHours() - 8);
        return d.toISOString();
      }

      // ── Phase 1: Fetch each monthly chunk and upsert ──
      let totalSynced = 0;
      let reauthRequired = false;
      const chunkErrors: string[] = [];

      for (const chunk of chunks) {
        try {
          const actRes = await fetch(`${GARMIN_RAILWAY_URL}/garmin-activities`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: garminEmail,
              oauth1_token: oauth1Token,
              oauth2_token: oauth2Token,
              start_date: chunk.start,
              end_date: chunk.end,
            }),
          });

          if (!actRes.ok) {
            const errText = await actRes.text().catch(() => "");
            console.error(`[garmin-sync] chunk ${chunk.start}→${chunk.end} failed:`, actRes.status, errText);
            if (actRes.status === 401) {
              reauthRequired = true;
              break;
            }
            chunkErrors.push(`${chunk.start}: ${errText.slice(0, 100)}`);
            continue;
          }

          const activities = await actRes.json();
          if (!Array.isArray(activities) || activities.length === 0) {
            console.log(`[garmin-sync] chunk ${chunk.start}→${chunk.end}: 0 activities`);
            continue;
          }

          // Some integer columns (duration_seconds, calories, average_hr, max_hr)
          // can come back as floats from Garmin (e.g. 4035.0000000000005), which
          // Postgres rejects with `invalid input syntax for type integer`.
          // Coerce them to safe ints; leave numeric columns as-is.
          const toInt = (v: unknown): number | null => {
            if (v === null || v === undefined || v === "") return null;
            const n = Number(v);
            if (!isFinite(n)) return null;
            return Math.round(n);
          };

          const rows = activities.map((a: any) => ({
            user_id: user.id,
            garmin_activity_id: String(a.garmin_activity_id ?? a.activity_id ?? crypto.randomUUID()),
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
          }));

          const { error: upsertError } = await supabase
            .from("garmin_activities")
            .upsert(rows, { onConflict: "garmin_activity_id,user_id", ignoreDuplicates: false });

          if (upsertError) {
            console.error(`[garmin-sync] upsert error chunk ${chunk.start}:`, upsertError);
            chunkErrors.push(`${chunk.start}: upsert failed`);
          } else {
            totalSynced += rows.length;
            console.log(`[garmin-sync] chunk ${chunk.start}→${chunk.end}: synced ${rows.length}`);
          }
        } catch (chunkErr) {
          console.error(`[garmin-sync] chunk ${chunk.start} exception:`, chunkErr);
          chunkErrors.push(`${chunk.start}: ${chunkErr instanceof Error ? chunkErr.message : "error"}`);
        }
      }

      if (reauthRequired) {
        return new Response(JSON.stringify({ error: "Garmin sign-in expired", reauth_required: true }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark the one-time full 2026 resync as complete only if all chunks succeeded.
      // If any chunk failed, leave the flag false so the next sync retries the full window.
      if (needsFullResync && chunkErrors.length === 0) {
        const { error: flagErr } = await supabase
          .from("garmin_connections")
          .update({ full_resync_done: true })
          .eq("user_id", user.id);
        if (flagErr) console.error("[garmin-sync] failed to set full_resync_done:", flagErr);
      } else if (needsFullResync) {
        console.warn(`[garmin-sync] full resync had ${chunkErrors.length} chunk error(s); leaving full_resync_done=false to retry next sync`);
      }

      // ── Phase 2: Loop through missing details (up to 3 batches of 5) ──
      let detailsFetched = 0;
      const MAX_BATCHES = 3;

      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const { data: missingDetails } = await supabase
          .from("garmin_activities")
          .select("id, garmin_activity_id")
          .eq("user_id", user.id)
          .eq("has_details", false)
          .order("start_time", { ascending: false })
          .limit(5);

        if (!missingDetails || missingDetails.length === 0) break;

        const activityIds = missingDetails.map((a) => a.garmin_activity_id).join(",");
        try {
          const detailRes = await fetch(`${GARMIN_RAILWAY_URL}/garmin-activity-details`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: garminEmail,
              oauth1_token: oauth1Token,
              oauth2_token: oauth2Token,
              activity_ids: activityIds,
            }),
          });

          if (detailRes.ok) {
            const detailsData = await detailRes.json();
            for (const item of missingDetails) {
              const detail = detailsData[item.garmin_activity_id];
              if (detail) {
                await supabase
                  .from("garmin_activities")
                  .update({
                    laps: Array.isArray(detail.laps) ? detail.laps : [],
                    weather: detail.weather ?? null,
                    summary_polyline: detail.map_polyline ?? null,
                    has_details: true,
                  })
                  .eq("id", item.id);
                detailsFetched++;
              } else {
                await supabase
                  .from("garmin_activities")
                  .update({ has_details: true })
                  .eq("id", item.id);
              }
            }
          } else {
            console.error("Detail fetch failed batch", batch, ":", await detailRes.text());
            break;
          }
        } catch (detailErr) {
          console.error("Detail fetch error batch", batch, ":", detailErr);
          break;
        }
      }

      // Compute training score
      const { data: recentActivities } = await supabase
        .from("garmin_activities")
        .select("duration_seconds, distance_meters, activity_type, start_time")
        .eq("user_id", user.id)
        .order("start_time", { ascending: false })
        .limit(50);

      const vdotScores: number[] = [];
      for (const act of recentActivities || []) {
        const st = act.activity_type || "";
        if (runningSportTypes.has(st) && (act.distance_meters || 0) >= 400 && (act.duration_seconds || 0) >= 60) {
          const vdot = calculateVdot(act.distance_meters || 0, act.duration_seconds || 0);
          if (vdot >= 5 && vdot <= 100 && isFinite(vdot)) vdotScores.push(vdot);
        }
        if (vdotScores.length >= 20) break;
      }

      const trainingScore = vdotScores.length > 0
        ? Math.round(vdotScores.reduce((a, b) => a + b, 0) / vdotScores.length)
        : 0;

      await supabase.from("profiles").update({ training_score: trainingScore }).eq("user_id", user.id);

      // Recalculate monthly XP
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

      const { data: monthActivities } = await supabase
        .from("garmin_activities")
        .select("distance_meters, duration_seconds")
        .eq("user_id", user.id)
        .gte("start_time", monthStart)
        .lt("start_time", monthEnd);

      let totalMonthlyXp = 0;
      for (const act of monthActivities || []) {
        const km = (act.distance_meters || 0) / 1000;
        const minutes = (act.duration_seconds || 0) / 60;
        const xp = Math.round(km * 20) + Math.round(minutes * 10) + Math.round(trainingScore * 5);
        if (xp > 0) totalMonthlyXp += xp;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("monthly_xp, lifetime_xp")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        const oldMonthlyXp = profile.monthly_xp || 0;
        const xpDelta = totalMonthlyXp - oldMonthlyXp;
        const newLifetimeXp = Math.max(0, (profile.lifetime_xp || 0) + xpDelta);
        const rank = computeRankFromXP(totalMonthlyXp);

        await supabase.from("profiles").update({
          monthly_xp: totalMonthlyXp,
          lifetime_xp: newLifetimeXp,
          rank_tier: rank.tier,
          division: rank.division,
        }).eq("user_id", user.id);
      }

      return new Response(JSON.stringify({
        success: true,
        synced: totalSynced,
        details_fetched: detailsFetched,
        details_remaining: 0,
        training_score: trainingScore,
        total_xp: totalMonthlyXp,
        first_sync: isFirstSync,
        full_resync: needsFullResync,
        window_start: fmtDate(windowStart),
        window_end: fmtDate(today),
        chunks_processed: chunks.length,
        chunk_errors: chunkErrors.length > 0 ? chunkErrors : undefined,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DISCONNECT ──
    // Intentionally keep garmin_activities so users don't lose their history.
    // Apple Health (if reconnected) will only fill gaps AFTER the latest Garmin
    // activity to prevent duplicates. On Garmin reconnect, the existing rows
    // let us resume incrementally from the last activity.
    if (action === "disconnect") {
      await supabase.from("garmin_connections").delete().eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("garmin-sync error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

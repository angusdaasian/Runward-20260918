// One-off backfill: trigger ai-running-coach `train_user_model` for every
// user with any 2026 activity. Safe to re-run — train_user_model writes an
// idempotent `_trained_2026_at` marker insight and skips duplicates.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const yearStart = "2026-01-01T00:00:00Z";
    const userIds = new Set<string>();

    // Collect distinct user_ids with any 2026 activity across all sources.
    const sources = [
      { table: "garmin_activities", col: "start_time" },
      { table: "strava_activities", col: "start_date" },
      { table: "apple_health_activities", col: "start_date" },
      { table: "terra_activities", col: "start_time" },
      { table: "intervals_activities", col: "start_date" },
      { table: "suunto_activities", col: "start_time" },
      { table: "polar_activities", col: "start_date" },
    ];
    for (const s of sources) {
      let from = 0;
      const page = 1000;
      while (true) {
        const { data, error } = await admin
          .from(s.table)
          .select("user_id")
          .gte(s.col, yearStart)
          .range(from, from + page - 1);
        if (error) {
          console.warn(`scan ${s.table} failed`, error.message);
          break;
        }
        if (!data || data.length === 0) break;
        for (const r of data as any[]) if (r.user_id) userIds.add(r.user_id);
        if (data.length < page) break;
        from += page;
      }
    }

    // Optionally re-train users who were already trained (force flag).
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";

    if (!force) {
      // Skip users that already have the `_trained_2026_at` marker.
      const ids = Array.from(userIds);
      if (ids.length > 0) {
        const { data: trainedRows } = await admin
          .from("ai_coach_insights")
          .select("user_id")
          .eq("insight_key", "_trained_2026_at")
          .in("user_id", ids);
        for (const r of (trainedRows as any[]) || []) userIds.delete(r.user_id);
      }
    }

    const targets = Array.from(userIds);
    const trainUrl = `${SUPABASE_URL}/functions/v1/ai-running-coach?action=train_user_model`;

    let triggered = 0;
    let failed = 0;
    // Fire sequentially with a small concurrency to avoid rate limits.
    const CONCURRENCY = 4;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((uid) =>
          fetch(trainUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": SERVICE_ROLE,
              Authorization: `Bearer ${SERVICE_ROLE}`,
            },
            body: JSON.stringify({ internalUserId: uid }),
          }).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
            return r.json();
          }),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled") triggered++;
        else {
          failed++;
          console.warn("train failed", r.reason);
        }
      }
    }

    return json({
      ok: true,
      candidates: targets.length,
      triggered,
      failed,
      force,
    });
  } catch (e) {
    console.error("train-coach-all-users error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

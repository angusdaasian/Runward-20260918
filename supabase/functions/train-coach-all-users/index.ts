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

    const allTargets = Array.from(userIds);
    const chunkSize = Math.max(1, Math.min(40, parseInt(url.searchParams.get("chunk") || "30", 10)));
    const targets = allTargets.slice(0, chunkSize);
    const trainUrl = `${SUPABASE_URL}/functions/v1/ai-running-coach?action=train_user_model`;

    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 4000;
    const PACE_MS = 800;
    const TIME_BUDGET_MS = 90_000; // stop accepting new work after 90s and chain
    const start = Date.now();
    let ok = 0;
    let failed = 0;
    let processed = 0;

    const trainOne = async (uid: string): Promise<void> => {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const r = await fetch(trainUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": SERVICE_ROLE,
              Authorization: `Bearer ${SERVICE_ROLE}`,
            },
            body: JSON.stringify({ internalUserId: uid }),
          });
          const body = await r.text().catch(() => "");
          if (r.ok) { ok++; return; }
          const isRate = r.status === 429 || /RESOURCE_EXHAUSTED|429/i.test(body);
          console.warn(`train ${uid} HTTP ${r.status} attempt=${attempt + 1}`);
          if (!isRate && r.status < 500) { failed++; return; }
          const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 1500);
          await new Promise((res) => setTimeout(res, delay));
        } catch (e) {
          console.warn(`train ${uid} threw attempt=${attempt + 1}`, e);
          await new Promise((res) => setTimeout(res, BASE_DELAY_MS * (attempt + 1)));
        }
      }
      failed++;
    };

    for (const uid of targets) {
      if (Date.now() - start > TIME_BUDGET_MS) break;
      await trainOne(uid);
      processed++;
      await new Promise((res) => setTimeout(res, PACE_MS));
    }

    const remaining = allTargets.length - processed;
    console.log(`train-coach-all-users chunk done processed=${processed}/${targets.length} ok=${ok} failed=${failed} remaining≈${remaining} elapsed=${Date.now() - start}ms`);

    // Self-chain: kick off next invocation in background.
    if (remaining > 0) {
      const selfUrl = `${SUPABASE_URL}/functions/v1/train-coach-all-users?chunk=${chunkSize}${force ? "&force=1" : ""}`;
      const next = fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
      }).catch((e) => console.warn("self-chain failed", e));
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(next);
    }

    return json({
      ok: true,
      processed,
      trained: ok,
      failed,
      remaining,
      total_candidates: allTargets.length,
      force,
    });

  } catch (e) {
    console.error("train-coach-all-users error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

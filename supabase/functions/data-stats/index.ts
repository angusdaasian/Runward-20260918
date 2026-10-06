// Public endpoint: total number of activity + daily health records processed.
// Cached in-memory for 6h to avoid hammering the DB on every landing page view.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const ACTIVITY_TABLES = [
  "terra_activities",
  "garmin_activities",
  "strava_activities",
  "suunto_activities",
  "intervals_activities",
  "apple_health_activities",
  "polar_activities",
];
const DAILY_TABLES = ["terra_daily_health", "garmin_daily_health"];

const CACHE_MS = 60 * 1000;
let cache: { total: number; at: number } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return json({ total: cache.total, cached: true });
    }
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let total = 0;
    for (const t of [...ACTIVITY_TABLES, ...DAILY_TABLES]) {
      const { count, error } = await db.from(t).select("id", { count: "exact", head: true });
      if (error) console.error(`[data-stats] ${t}:`, error.message);
      else total += count ?? 0;
    }
    cache = { total, at: Date.now() };
    return json({ total });
  } catch (e) {
    console.error("[data-stats]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

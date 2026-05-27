// COROS Workout Summary Data Push receiver (§5.3 of COROS API Reference V2.0.6).
//
// COROS sends:
//   POST <this URL>
//   Content-Type: application/json
//   Body: { "sportDataList": [ { openId, labelId, startTime, mode, ... }, ... ]}
//
// Requirements:
//   - Must return HTTP 200 quickly (COROS retries on failure).
//   - Duplicate pushes are expected — dedupe by (openId, labelId).
//   - HTTPS only (Supabase edge functions are HTTPS by default).
//
// This scaffold:
//   1. Accepts the push.
//   2. Logs each workout (so you can see structure in edge function logs).
//   3. Idempotently inserts each workout into `public.coros_workout_pushes`
//      IF the table exists. If not, it still returns 200 so COROS keeps pushing.
//   4. Returns the JSON body COROS expects: { "result": "0000", "message": "OK" }.
//
// Next steps (later, when wiring real ingestion):
//   - Create `coros_workout_pushes` table with UNIQUE(open_id, label_id).
//   - Add `coros_connections(user_id, open_id, access_token, refresh_token, expires_at)`.
//   - Look up the Runward user_id from open_id and write to your activities table.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface CorosWorkout {
  openId?: string;
  labelId?: string | number;
  startTime?: number;
  endTime?: number;
  mode?: number;
  subMode?: number;
  distance?: number;
  duration?: number;
  calorie?: number;
  avgSpeed?: number;
  avgFrequency?: number;
  planWorkoutId?: string;
  [k: string]: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // COROS sends POST; reject anything else but still 200 for HEAD/GET probes
  // so their monitoring doesn't flag this URL as down.
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ result: "1001", message: "method not allowed" }), {
      status: 200, // intentionally 200 so COROS doesn't retry forever
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { sportDataList?: CorosWorkout[] };
  try {
    payload = await req.json();
  } catch (e) {
    console.error("[coros-webhook] invalid JSON", e);
    return new Response(JSON.stringify({ result: "1002", message: "invalid json" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const workouts = Array.isArray(payload?.sportDataList) ? payload.sportDataList : [];
  console.log(`[coros-webhook] received ${workouts.length} workout(s)`);

  // Try to persist; do not let DB errors break the 200 response.
  if (workouts.length > 0) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const rows = workouts.map((w) => ({
        open_id: String(w.openId ?? ""),
        label_id: String(w.labelId ?? ""),
        start_time: w.startTime ?? null,
        mode: w.mode ?? null,
        sub_mode: w.subMode ?? null,
        raw: w,
      }));

      const { error } = await supabase
        .from("coros_workout_pushes")
        .upsert(rows, { onConflict: "open_id,label_id", ignoreDuplicates: true });

      if (error) {
        // Table likely doesn't exist yet — that's fine for the scaffold phase.
        console.warn("[coros-webhook] upsert skipped:", error.message);
      }
    } catch (e) {
      console.error("[coros-webhook] persistence error", e);
    }
  }

  // COROS expects { result: "0000", message: "OK" } on success.
  return new Response(JSON.stringify({ result: "0000", message: "OK" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

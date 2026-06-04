import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Suunto sends 24/7 webhook events for activity, sleep, recovery.
// Payload example for sleep:
// {
//   "type": "SLEEP_CREATED",
//   "username": "johndoe123",
//   "sleep": { "startTime": 1700000000000, "endTime": 1700030000000,
//              "totalSleepTime": 28800, "hrv": 65, ... }
// }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("ok", { status: 200, headers: corsHeaders });

  let event: any = null;
  try { event = await req.json(); }
  catch (_) { try { event = JSON.parse(await req.text()); } catch (_) {} }
  console.log("[suunto-247-webhook] event:", JSON.stringify(event));

  const username: string | undefined = event?.username;
  const type: string | undefined = event?.type;
  if (!username || !type) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conn } = await supabase
      .from("suunto_connections")
      .select("user_id")
      .eq("suunto_username", username)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conn) {
      console.log("[suunto-247-webhook] no connection for", username);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = conn.user_id as string;

    if (type === "SLEEP_CREATED" || type === "SLEEP_UPDATED") {
      const s = event.sleep ?? {};
      const startMs = Number(s.startTime ?? s.start_time ?? 0);
      if (!startMs) {
        console.log("[suunto-247-webhook] sleep without startTime");
      } else {
        // Suunto "sleep date" is typically the wake-up day
        const date = new Date(startMs + 12 * 3600 * 1000).toISOString().slice(0, 10);
        const sleepSeconds = Number(s.totalSleepTime ?? s.totalSleepDuration ?? 0) || null;
        const hrv = s.hrv ?? s.avgHrv ?? s.averageHrv ?? null;
        const restingHr = s.restingHr ?? s.minHr ?? null;

        await supabase.from("terra_daily_health").upsert({
          user_id: userId,
          provider: "SUUNTO",
          date,
          sleep_seconds: sleepSeconds,
          hrv: hrv != null ? Number(hrv) : null,
          resting_hr: restingHr != null ? Number(restingHr) : null,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "user_id,provider,date" });

        console.log("[suunto-247-webhook] saved sleep for", userId, date);
      }
    } else {
      console.log("[suunto-247-webhook] ignoring type", type);
    }
  } catch (err) {
    console.error("[suunto-247-webhook] error:", err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

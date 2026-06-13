import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  INTERVALS_API_BASE,
  mapIntervalsActivity,
  refreshIntervalsTokenIfNeeded,
} from "../_shared/intervals.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const expected = Deno.env.get("INTERVALS_WEBHOOK_SECRET");
    if (expected) {
      const provided =
        req.headers.get("x-webhook-secret") ??
        req.headers.get("X-Webhook-Secret") ??
        new URL(req.url).searchParams.get("secret");
      if (provided !== expected) {
        console.warn("[intervals-webhook] bad secret");
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
    }

    const event = await req.json();
    console.log("[intervals-webhook] event", JSON.stringify(event));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const eventType: string = event.event ?? event.type ?? "";
    const athleteId = String(event.athlete_id ?? event.athleteId ?? "");
    const activityId = String(
      event.data?.id ?? event.activity_id ?? event.activityId ?? event.id ?? "",
    );

    if (!athleteId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_athlete" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conn } = await supabase
      .from("intervals_connections")
      .select("*")
      .eq("athlete_id", athleteId)
      .maybeSingle();
    if (!conn) {
      console.log("[intervals-webhook] no connection for athlete", athleteId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventType === "ACTIVITY_DELETED" && activityId) {
      await supabase.from("intervals_activities").delete().eq("intervals_id", activityId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      (eventType === "ACTIVITY_UPLOADED" || eventType === "ACTIVITY_UPDATED") &&
      activityId
    ) {
      const accessToken = await refreshIntervalsTokenIfNeeded(conn as any, supabase);
      const url = `${INTERVALS_API_BASE}/activity/${encodeURIComponent(activityId)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        console.error("[intervals-webhook] activity fetch failed", res.status, await res.text());
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const act = await res.json();
      const row = mapIntervalsActivity(conn.user_id, act);
      await supabase
        .from("intervals_activities")
        .upsert(row, { onConflict: "intervals_id" });
    }

    // WELLNESS_UPDATED / FITNESS_UPDATED: acknowledge but no-op for now.
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[intervals-webhook] error", error);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

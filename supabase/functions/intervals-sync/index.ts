import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  INTERVALS_API_BASE,
  mapIntervalsActivity,
  refreshIntervalsTokenIfNeeded,
} from "../_shared/intervals.ts";
import { maybeTrainCoachOnce } from "../_shared/trainCoachOnce.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: conn, error: connErr } = await supabase
      .from("intervals_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: "No intervals.icu connection found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let oldest: string | undefined;
    let newest: string | undefined;
    let limit = 50;
    try {
      const body = await req.json();
      if (typeof body?.oldest === "string") oldest = body.oldest;
      if (typeof body?.newest === "string") newest = body.newest;
      if (typeof body?.limit === "number") limit = Math.min(200, Math.max(1, Math.floor(body.limit)));
    } catch (_) { /* no body fine */ }

    const accessToken = await refreshIntervalsTokenIfNeeded(conn as any, supabase);

    const params = new URLSearchParams({ limit: String(limit) });
    if (oldest) params.set("oldest", oldest);
    if (newest) params.set("newest", newest);

    const url = `${INTERVALS_API_BASE}/athlete/${encodeURIComponent(conn.athlete_id)}/activities?${params.toString()}`;
    console.log(`[intervals-sync] GET ${url} user=${user.id}`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      throw new Error(`intervals.icu API error [${res.status}]: ${await res.text()}`);
    }
    const activities = await res.json();
    if (!Array.isArray(activities)) {
      throw new Error("Unexpected intervals.icu response shape");
    }

    let count = 0;
    for (const act of activities) {
      const row = mapIntervalsActivity(user.id, act);
      await supabase
        .from("intervals_activities")
        .upsert(row, { onConflict: "intervals_id" });
      count += 1;
    }

    return new Response(JSON.stringify({ success: true, count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("intervals-sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

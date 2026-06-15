// Public API v1: validates bearer token, enforces rate limits, returns athlete + activities.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sha256Hex } from "../_shared/oauth-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer) return err(401, "unauthorized");
    const access_hash = await sha256Hex(bearer);

    const { data: auth } = await admin
      .from("oauth_authorizations")
      .select("id,app_id,user_id,scopes,expires_at,revoked_at")
      .eq("access_token_hash", access_hash).maybeSingle();
    if (!auth || auth.revoked_at) return err(401, "invalid_token");
    if (new Date(auth.expires_at) < new Date()) return err(401, "token_expired");

    // Rate limit
    const { data: rl } = await admin.rpc("consume_rate_limit", { p_app_id: auth.app_id });
    const limitRow = Array.isArray(rl) ? rl[0] : rl;
    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-RateLimit-Remaining-15min": String(limitRow?.remaining_15min ?? 0),
      "X-RateLimit-Remaining-Day": String(limitRow?.remaining_day ?? 0),
    };
    if (!limitRow?.allowed) {
      headers["Retry-After"] = String(limitRow?.retry_after_seconds ?? 60);
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), { status: 429, headers });
    }

    const url = new URL(req.url);
    // Path under the function root: /api-v1/<rest>
    const parts = url.pathname.split("/").filter(Boolean);
    const fnIdx = parts.indexOf("api-v1");
    const route = parts.slice(fnIdx + 1);

    if (route[0] === "athlete" && route.length === 1) {
      const { data: profile } = await admin
        .from("profiles")
        .select("user_id,display_name,avatar_url,age,sex")
        .eq("user_id", auth.user_id).maybeSingle();
      return new Response(JSON.stringify({
        id: auth.user_id,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        age: profile?.age ?? null,
        sex: profile?.sex ?? null,
      }), { status: 200, headers });
    }

    if (route[0] === "activities" && route.length === 1) {
      const limit = Math.min(parseInt(url.searchParams.get("per_page") ?? "30", 10) || 30, 100);
      const before = url.searchParams.get("before");
      const after = url.searchParams.get("after");
      const rows = await fetchActivities(admin, auth.user_id, { limit, before, after });
      return new Response(JSON.stringify({ activities: rows }), { status: 200, headers });
    }

    if (route[0] === "activities" && route.length === 2) {
      const row = await fetchActivity(admin, auth.user_id, route[1]);
      if (!row) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers });
      return new Response(JSON.stringify(row), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers });
  } catch (e) {
    return err(500, String((e as Error)?.message ?? e));
  }
});

function err(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Minimal unified activity view across providers.
async function fetchActivities(admin: any, user_id: string, opts: { limit: number; before?: string | null; after?: string | null }) {
  // For v1 just pull from strava_activities + intervals_activities + terra_activities
  // and merge by start time. Keep payload small.
  const filters = (col: string) => {
    const f: string[] = [];
    if (opts.after) f.push(`${col}.gt.${opts.after}`);
    if (opts.before) f.push(`${col}.lt.${opts.before}`);
    return f;
  };
  const limit = opts.limit;

  const promises: Promise<any>[] = [
    admin.from("strava_activities").select("id,name,sport_type,start_date,distance,moving_time,total_elevation_gain")
      .eq("user_id", user_id).order("start_date", { ascending: false }).limit(limit),
    admin.from("intervals_activities").select("id,name,type,start_date_local,distance,moving_time,total_elevation_gain")
      .eq("user_id", user_id).order("start_date_local", { ascending: false }).limit(limit),
    admin.from("terra_activities").select("id,name,activity_type,start_time,distance_meters,duration_seconds,elevation_gain_meters")
      .eq("user_id", user_id).order("start_time", { ascending: false }).limit(limit),
  ];
  const [strava, intervals, terra] = await Promise.all(promises);
  const items: any[] = [];
  for (const r of (strava.data ?? [])) items.push({
    id: `strava_${r.id}`, source: "strava",
    name: r.name, type: r.sport_type,
    start_date: r.start_date,
    distance: r.distance, moving_time: r.moving_time,
    total_elevation_gain: r.total_elevation_gain,
  });
  for (const r of (intervals.data ?? [])) items.push({
    id: `intervals_${r.id}`, source: "intervals",
    name: r.name, type: r.type,
    start_date: r.start_date_local,
    distance: r.distance, moving_time: r.moving_time,
    total_elevation_gain: r.total_elevation_gain,
  });
  for (const r of (terra.data ?? [])) items.push({
    id: `terra_${r.id}`, source: "terra",
    name: r.name, type: r.activity_type,
    start_date: r.start_time,
    distance: r.distance_meters, moving_time: r.duration_seconds,
    total_elevation_gain: r.elevation_gain_meters,
  });
  items.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return items.slice(0, limit);
}

async function fetchActivity(admin: any, user_id: string, id: string) {
  const [source, real] = id.split("_", 2);
  if (!real) return null;
  if (source === "strava") {
    const { data } = await admin.from("strava_activities").select("*").eq("user_id", user_id).eq("id", real).maybeSingle();
    return data ? { source, ...data } : null;
  }
  if (source === "intervals") {
    const { data } = await admin.from("intervals_activities").select("*").eq("user_id", user_id).eq("id", real).maybeSingle();
    return data ? { source, ...data } : null;
  }
  if (source === "terra") {
    const { data } = await admin.from("terra_activities").select("*").eq("user_id", user_id).eq("id", real).maybeSingle();
    return data ? { source, ...data } : null;
  }
  return null;
}

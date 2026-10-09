// Admin-only incremental feed of everything received since a cursor, for the live dashboard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const km = (m: any) => (m ? `${(Number(m) / 1000).toFixed(2)} km` : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing authorization" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const uc = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await uc.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const fallback = new Date(Date.now() - 6 * 3600_000).toISOString();
    const since = typeof body.since === "string" && !isNaN(Date.parse(body.since)) ? body.since : fallback;
    const lim = 100;
    const events: any[] = [];

    const { data: tw } = await db.from("terra_webhook_events")
      .select("id,type,terra_user_id,signature_valid,processing_error,received_at")
      .gt("received_at", since).order("received_at", { ascending: false }).limit(lim);
    for (const r of tw ?? []) events.push({
      id: `tw_${r.id}`, at: r.received_at, kind: "webhook", source: "terra", watch: null, user_id: null,
      title: `Webhook: ${r.type}`, detail: r.terra_user_id ?? "",
      ok: r.signature_valid !== false && !r.processing_error, error: r.processing_error ?? (r.signature_valid === false ? "invalid signature" : null),
    });

    const { data: ta } = await db.from("terra_activities")
      .select("id,user_id,provider,terra_activity_id,activity_name,activity_type,distance_meters,device_model,created_at")
      .gt("created_at", since).order("created_at", { ascending: false }).limit(lim);
    for (const r of ta ?? []) events.push({
      id: `ta_${r.id}`, at: r.created_at, kind: "activity",
      source: String(r.terra_activity_id ?? "").startsWith("stridee_") ? "stridee" : "terra",
      watch: r.provider, user_id: r.user_id, title: r.activity_name || r.activity_type || "Activity",
      detail: [r.activity_type, km(r.distance_meters), r.device_model].filter(Boolean).join(" · "), ok: true,
    });

    const { data: th } = await db.from("terra_daily_health")
      .select("id,user_id,provider,date,steps,hrv,resting_hr,fetched_at")
      .gt("fetched_at", since).order("fetched_at", { ascending: false }).limit(lim);
    for (const r of th ?? []) events.push({
      id: `th_${r.id}_${r.fetched_at}`, at: r.fetched_at, kind: "daily", source: "watch", watch: r.provider, user_id: r.user_id,
      title: `Daily health ${r.date}`,
      detail: [r.steps != null && `${r.steps} steps`, r.hrv != null && `HRV ${r.hrv}`, r.resting_hr != null && `RHR ${r.resting_hr}`].filter(Boolean).join(" · "),
      ok: true,
    });

    const { data: ga } = await db.from("garmin_activities")
      .select("id,user_id,activity_name,activity_type,distance_meters,created_at")
      .gt("created_at", since).order("created_at", { ascending: false }).limit(lim);
    for (const r of ga ?? []) events.push({
      id: `ga_${r.id}`, at: r.created_at, kind: "activity", source: "railway", watch: "GARMIN", user_id: r.user_id,
      title: r.activity_name || "Activity", detail: [r.activity_type, km(r.distance_meters)].filter(Boolean).join(" · "), ok: true,
    });

    const simple: [string, string, string][] = [
      ["strava", "strava_activities", "name"], ["suunto", "suunto_activities", "name"],
      ["intervals", "intervals_activities", "name"], ["apple", "apple_health_activities", "name"],
      ["polar", "polar_activities", "sport_type"],
    ];
    for (const [src, table, nameCol] of simple) {
      const { data } = await db.from(table).select(`id,user_id,sport_type,distance,${nameCol},created_at`)
        .gt("created_at", since).order("created_at", { ascending: false }).limit(lim);
      for (const r of (data ?? []) as any[]) events.push({
        id: `${src}_${r.id}`, at: r.created_at, kind: "activity", source: src, watch: null, user_id: r.user_id,
        title: r[nameCol] || r.sport_type || "Activity", detail: [r.sport_type, km(r.distance)].filter(Boolean).join(" · "), ok: true,
      });
    }

    events.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    const out = events.slice(0, 200);
    const ids = [...new Set(out.map((e) => e.user_id).filter(Boolean))];
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data } = await db.from("profiles").select("user_id,display_name").in("user_id", ids);
      for (const p of data ?? []) names[p.user_id] = p.display_name;
    }
    return json({ now: new Date().toISOString(), events: out.map((e) => ({ ...e, user_name: e.user_id ? names[e.user_id] ?? null : null })) });
  } catch (e) {
    console.error("[admin-live-feed]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

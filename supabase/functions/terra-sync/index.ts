import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const providerFilter: string | undefined = body.provider ? String(body.provider).toUpperCase() : undefined;

    const q = admin.from("terra_connections").select("*").eq("user_id", user.id).eq("active", true);
    const { data: conns } = providerFilter ? await q.eq("provider", providerFilter) : await q;
    if (!conns || conns.length === 0) {
      return new Response(JSON.stringify({ ok: true, synced: 0, message: "no active connections" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const devId = Deno.env.get("TERRA_DEV_ID")!;
    const apiKey = Deno.env.get("TERRA_API_KEY")!;
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 30);
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    let activityCount = 0;
    let dailyCount = 0;

    for (const c of conns) {
      const headers = { "dev-id": devId, "x-api-key": apiKey };
      // activity
      try {
        const r = await fetch(`https://api.tryterra.co/v2/activity?user_id=${c.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=false`, { headers });
        const j = await r.json();
        const items = Array.isArray(j?.data) ? j.data : [];
        for (const a of items) {
          const meta = a?.metadata ?? {};
          const dist = a?.distance_data?.summary ?? {};
          const hr = a?.heart_rate_data?.summary ?? {};
          const cal = a?.calories_data ?? {};
          const aid = String(meta?.summary_id ?? meta?.id ?? meta?.start_time ?? crypto.randomUUID());
          await admin.from("terra_activities").upsert({
            user_id: c.user_id,
            provider: c.provider,
            terra_activity_id: aid,
            activity_name: meta?.name ?? null,
            activity_type: meta?.type ?? null,
            start_time: meta?.start_time ?? null,
            duration_seconds: meta?.active_duration_seconds ? Math.round(meta.active_duration_seconds) : null,
            distance_meters: dist?.distance_meters ?? null,
            calories: cal?.total_burned_calories ? Math.round(cal.total_burned_calories) : null,
            average_hr: hr?.avg_hr_bpm ? Math.round(hr.avg_hr_bpm) : null,
            max_hr: hr?.max_hr_bpm ? Math.round(hr.max_hr_bpm) : null,
            elevation_gain: dist?.elevation?.gain_actual_meters ?? null,
            raw_json: a,
          }, { onConflict: "user_id,terra_activity_id" });
          activityCount++;
        }
      } catch (e) { console.error("activity fetch failed", c.provider, e); }

      // daily
      try {
        const r = await fetch(`https://api.tryterra.co/v2/daily?user_id=${c.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=false`, { headers });
        const j = await r.json();
        const items = Array.isArray(j?.data) ? j.data : [];
        for (const d of items) {
          const meta = d?.metadata ?? {};
          const date = (meta?.start_time ?? "").slice(0, 10);
          if (!date) continue;
          await admin.from("terra_daily_health").upsert({
            user_id: c.user_id,
            provider: c.provider,
            date,
            resting_hr: d?.heart_rate_data?.summary?.resting_hr_bpm ?? null,
            steps: d?.distance_data?.steps ?? null,
            vo2max: d?.MET_data?.avg_level ?? null,
          }, { onConflict: "user_id,provider,date" });
          dailyCount++;
        }
      } catch (e) { console.error("daily fetch failed", c.provider, e); }

      await admin.from("terra_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", c.id);
    }

    return new Response(JSON.stringify({ ok: true, activities: activityCount, daily: dailyCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

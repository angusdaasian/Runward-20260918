// TEMPORARY: debug Terra cadence_data for a specific user.
// Public endpoint protected by WEBHOOK_AUTH_KEY header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const key = req.headers.get("x-webhook-key") ?? new URL(req.url).searchParams.get("key");
    if (key !== Deno.env.get("WEBHOOK_AUTH_KEY")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id") ?? "c7a7d1ca-c7bf-4288-bb9d-794006a04087";
    const days = Number(url.searchParams.get("days") ?? "7");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin.from("terra_connections").select("*").eq("user_id", userId).eq("active", true).limit(1).maybeSingle();
    if (!conn) return new Response(JSON.stringify({ error: "no terra connection" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const devId = Deno.env.get("TERRA_DEV_ID")!;
    const apiKey = Deno.env.get("TERRA_API_KEY")!;
    const headers = { "dev-id": devId, "x-api-key": apiKey };

    const end = new Date(); end.setDate(end.getDate() + 1);
    const start = new Date(); start.setDate(start.getDate() - days);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const fetchUrl = `https://api.tryterra.co/v2/activity?user_id=${conn.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=true`;
    const r = await fetch(fetchUrl, { headers });
    const j = await r.json();
    const items: any[] = Array.isArray(j?.data) ? j.data : [];
    const summaries = items.slice(0, 5).map((a) => {
      const meta = a?.metadata ?? {};
      return {
        start_time: meta?.start_time,
        name: meta?.name,
        type: meta?.type,
        cadence_data_keys: a?.cadence_data ? Object.keys(a.cadence_data) : null,
        cadence_summary: a?.cadence_data?.summary ?? null,
        cadence_samples_count: Array.isArray(a?.cadence_data?.detailed?.cadence_samples)
          ? a.cadence_data.detailed.cadence_samples.length
          : (Array.isArray(a?.cadence_data?.cadence_samples) ? a.cadence_data.cadence_samples.length : 0),
        cadence_sample_first: a?.cadence_data?.detailed?.cadence_samples?.[0]
          ?? a?.cadence_data?.cadence_samples?.[0]
          ?? null,
        movement_avg_cadence: a?.movement_data?.avg_cadence ?? a?.movement_data?.avg_cadence_rpm ?? null,
        top_keys: Object.keys(a ?? {}),
      };
    });
    return new Response(JSON.stringify({ ok: true, items_count: items.length, summaries }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

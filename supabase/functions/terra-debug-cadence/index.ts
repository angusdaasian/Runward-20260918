// TEMPORARY: debug + backfill Terra cadence_data for a specific user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractAvgCadence(a: any): number | null {
  return (
    toNum(a?.cadence_data?.summary?.avg_cadence) ??
    toNum(a?.cadence_data?.summary?.avg_cadence_rpm) ??
    toNum(a?.movement_data?.avg_cadence) ??
    toNum(a?.movement_data?.avg_cadence_rpm)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id") ?? "c7a7d1ca-c7bf-4288-bb9d-794006a04087";
    const days = Number(url.searchParams.get("days") ?? "14");
    const apply = url.searchParams.get("apply") === "1";
    const envParam = (url.searchParams.get("env") ?? "test").toLowerCase();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin.from("terra_connections").select("*").eq("user_id", userId).eq("active", true).limit(1).maybeSingle();
    if (!conn) return new Response(JSON.stringify({ error: "no terra connection" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const devId = envParam === "prod" ? Deno.env.get("TERRA_DEV_ID")! : Deno.env.get("TERRA_DEV_ID_TEST")!;
    const apiKey = envParam === "prod" ? Deno.env.get("TERRA_API_KEY")! : Deno.env.get("TERRA_API_KEY_TEST")!;
    const headers = { "dev-id": devId, "x-api-key": apiKey };

    const end = new Date(); end.setDate(end.getDate() + 1);
    const start = new Date(); start.setDate(start.getDate() - days);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const u = `https://api.tryterra.co/v2/activity?user_id=${conn.terra_user_id}&start_date=${startStr}&end_date=${endStr}&to_webhook=false&with_samples=true`;
    const rr = await fetch(u, { headers });
    const jj = await rr.json();
    const items: any[] = Array.isArray(jj?.data) ? jj.data : [];

    const updates: any[] = [];
    for (const a of items) {
      const meta = a?.metadata ?? {};
      const aid = String(meta?.upload_type ?? "") + ":" + String(meta?.summary_id ?? meta?.id ?? meta?.start_time ?? "");
      const avg = extractAvgCadence(a);
      const updateRecord: any = { terra_activity_id: aid, start: meta?.start_time, avg_cadence: avg };
      if (apply && avg != null) {
        const { error } = await admin
          .from("terra_activities")
          .update({ avg_cadence: avg })
          .eq("user_id", userId)
          .eq("terra_activity_id", aid);
        updateRecord.applied = !error;
        if (error) updateRecord.error = error.message;
      }
      updates.push(updateRecord);
    }

    return new Response(JSON.stringify({ ok: true, count: items.length, updates }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

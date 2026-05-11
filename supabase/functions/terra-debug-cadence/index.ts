// TEMPORARY: backfill cadence_samples too
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

function extractCadenceSamples(a: any, startTimeIso: string | null): Array<{ t: number; rpm: number }> {
  const candidates = [
    a?.movement_data?.cadence_samples,
    a?.cadence_data?.detailed?.cadence_samples,
    a?.cadence_data?.cadence_samples,
  ];
  const arr = candidates.find((c) => Array.isArray(c) && c.length > 0);
  if (!Array.isArray(arr)) return [];
  const startMs = startTimeIso ? Date.parse(startTimeIso) : NaN;
  const out: Array<{ t: number; rpm: number }> = [];
  for (const s of arr) {
    const rpm = toNum(s?.cadence_rpm ?? s?.cadence ?? s?.value);
    if (rpm == null) continue;
    let t: number | null = null;
    if (s?.timestamp && Number.isFinite(startMs)) {
      const ms = Date.parse(s.timestamp);
      if (Number.isFinite(ms)) t = Math.round((ms - startMs) / 1000);
    }
    if (t == null) {
      const tval = toNum(s?.timer_duration_seconds ?? s?.t);
      if (tval != null) t = Math.round(tval);
    }
    if (t == null) continue;
    out.push({ t, rpm: Math.round(rpm * 10) / 10 });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id") ?? "c7a7d1ca-c7bf-4288-bb9d-794006a04087";
    const days = Number(url.searchParams.get("days") ?? "5");
    const apply = url.searchParams.get("apply") === "1";
    const inspect = url.searchParams.get("inspect") === "1";
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
      const samples = extractCadenceSamples(a, meta?.start_time ?? null);
      const sample0 = a?.movement_data?.cadence_samples?.[0] ?? null;
      const rec: any = {
        terra_activity_id: aid,
        start: meta?.start_time,
        avg_cadence: avg,
        cadence_samples_count: samples.length,
        first_sample: sample0,
      };
      if (apply) {
        const patch: any = {};
        if (avg != null) patch.avg_cadence = avg;
        if (samples.length > 0) patch.cadence_samples = samples;
        if (Object.keys(patch).length > 0) {
          const { error } = await admin
            .from("terra_activities")
            .update(patch)
            .eq("user_id", userId)
            .eq("terra_activity_id", aid);
          rec.applied = !error;
          if (error) rec.error = error.message;
        }
      }
      updates.push(rec);
    }

    return new Response(JSON.stringify({ ok: true, count: items.length, updates: inspect ? updates : updates.map((u) => ({ ...u, first_sample: undefined })) }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

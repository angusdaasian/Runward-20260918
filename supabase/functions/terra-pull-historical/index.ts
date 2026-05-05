// Debug/admin: pull historical activities synchronously from Terra v2/activity
// with samples and write hr_samples to terra_activities.
// No JWT verification — gated by WEBHOOK_AUTH_KEY header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
};

function findHrSampleArray(obj: any): any[] | null {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    if (obj.length && obj.some((s) => s && typeof s === "object" && ("bpm" in s || "heart_rate_bpm" in s || "heart_rate" in s))) {
      return obj;
    }
    for (const v of obj) {
      const r = findHrSampleArray(v);
      if (r) return r;
    }
    return null;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (/hr|heart/i.test(k)) {
      const r = findHrSampleArray(v);
      if (r) return r;
    }
  }
  for (const v of Object.values(obj)) {
    const r = findHrSampleArray(v);
    if (r) return r;
  }
  return null;
}

function extractHrSamples(a: any): Array<{ t: number; bpm: number }> {
  const meta = a?.metadata ?? {};
  const startMs = meta?.start_time ? Date.parse(meta.start_time) : NaN;
  const samples = findHrSampleArray(a?.heart_rate_data) || findHrSampleArray(a) || [];
  const out: Record<number, number> = {};
  for (const s of samples) {
    if (!s || typeof s !== "object") continue;
    let t: number | null = null;
    if (typeof s.timer_duration_seconds === "number") t = Math.round(s.timer_duration_seconds);
    else if (s.timestamp && Number.isFinite(startMs)) {
      const ts = Date.parse(s.timestamp);
      if (Number.isFinite(ts)) t = Math.round((ts - startMs) / 1000);
    }
    const bpm = Number(s.bpm ?? s.heart_rate_bpm ?? s.heart_rate);
    if (t === null || t < 0 || !Number.isFinite(bpm)) continue;
    out[t] = Math.round(bpm);
  }
  const arr = Object.entries(out)
    .map(([t, bpm]) => ({ t: Number(t), bpm }))
    .sort((a, b) => a.t - b.t)
    .slice(0, 7200);
  return arr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== Deno.env.get("WEBHOOK_AUTH_KEY")) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const userId: string = body.userId ?? "c7a7d1ca-c7bf-4288-bb9d-794006a04087";
  const startDate: string = body.startDate ?? "2026-05-05";
  const endDate: string = body.endDate ?? "2026-05-06";
  const provider: string = (body.provider ?? "GARMIN").toUpperCase();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: conn } = await admin
    .from("terra_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("active", true)
    .maybeSingle();

  if (!conn) {
    return new Response(JSON.stringify({ error: "no connection" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const headers = {
    "dev-id": Deno.env.get("TERRA_DEV_ID")!,
    "x-api-key": Deno.env.get("TERRA_API_KEY")!,
  };

  // Step 1: synchronous range pull with samples
  const rangeUrl = `https://api.tryterra.co/v2/activity?user_id=${conn.terra_user_id}&start_date=${startDate}&end_date=${endDate}&to_webhook=false&with_samples=true`;
  const r1 = await fetch(rangeUrl, { headers });
  const j1 = await r1.json();
  const items: any[] = Array.isArray(j1?.data) ? j1.data : [];

  const summary: any[] = [];
  const updates: any[] = [];

  for (const a of items) {
    const meta = a?.metadata ?? {};
    const summaryId = String(meta?.summary_id ?? "");
    const hrFromRange = extractHrSamples(a);
    let hrSamples = hrFromRange;
    let perActivityStatus: number | null = null;

    // Step 2: if range returned no samples, fall back to per-activity endpoint
    if (hrSamples.length === 0 && summaryId) {
      const perUrl = `https://api.tryterra.co/v2/activity/${encodeURIComponent(summaryId)}?user_id=${conn.terra_user_id}&with_samples=true`;
      const r2 = await fetch(perUrl, { headers });
      perActivityStatus = r2.status;
      const j2 = await r2.json();
      const item = Array.isArray(j2?.data) ? j2.data[0] : j2?.data;
      if (item) hrSamples = extractHrSamples(item);
    }

    summary.push({
      summary_id: summaryId,
      start_time: meta?.start_time,
      hr_from_range: hrFromRange.length,
      hr_final: hrSamples.length,
      per_activity_status: perActivityStatus,
    });

    if (hrSamples.length > 0) {
      const terraActivityId = `1:${summaryId}`;
      const { data: row } = await admin
        .from("terra_activities")
        .select("id")
        .eq("user_id", userId)
        .eq("terra_activity_id", terraActivityId)
        .maybeSingle();
      if (row) {
        await admin.from("terra_activities").update({ hr_samples: hrSamples }).eq("id", row.id);
        updates.push({ id: row.id, hr_len: hrSamples.length });
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      range_status: r1.status,
      range_type: j1?.type,
      range_message: j1?.message,
      items: items.length,
      summary,
      updates,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

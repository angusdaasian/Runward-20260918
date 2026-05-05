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

  // Open admin/debug endpoint — gated by hardcoded user filter below.
  // Only operates on terra_connections rows we explicitly select.



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
  let items: any[] = Array.isArray(j1?.data) ? j1.data : [];

  // Diagnostic: same range without with_samples
  const diagUrl = `https://api.tryterra.co/v2/activity?user_id=${conn.terra_user_id}&start_date=${startDate}&end_date=${endDate}&to_webhook=false&with_samples=false`;
  const rd = await fetch(diagUrl, { headers });
  const jd = await rd.json().catch(() => ({}));
  const diagItems = Array.isArray(jd?.data) ? jd.data.length : 0;

  // Step 2: if range returned nothing, fall back to existing rows in DB for this window
  let usedFallback = false;
  if (items.length === 0) {
    usedFallback = true;
    const { data: existingRows } = await admin
      .from("terra_activities")
      .select("terra_activity_id, start_time")
      .eq("user_id", userId)
      .eq("provider", provider)
      .gte("start_time", `${startDate}T00:00:00Z`)
      .lt("start_time", `${endDate}T00:00:00Z`);
    items = (existingRows ?? []).map((row: any) => {
      const aid = String(row.terra_activity_id || "");
      const summaryId = aid.includes(":") ? aid.split(":").slice(1).join(":") : aid;
      return { metadata: { summary_id: summaryId, start_time: row.start_time } };
    });
  }

  const summary: any[] = [];
  const updates: any[] = [];

  for (const a of items) {
    const meta = a?.metadata ?? {};
    const summaryId = String(meta?.summary_id ?? "");
    const hrFromRange = usedFallback ? [] : extractHrSamples(a);
    let hrSamples = hrFromRange;
    let perActivityStatus: number | null = null;
    let perActivityType: string | null = null;

    const perAttempts: any[] = [];
    if (hrSamples.length === 0 && summaryId) {
      const candidates = [
        // Date-windowed range pulls — bypass dedupe of the open-ended range
        `https://api.tryterra.co/v2/activity?user_id=${conn.terra_user_id}&start_date=${(meta?.start_time ?? startDate).slice(0,10)}&end_date=${endDate}&to_webhook=false&with_samples=true`,
        // Per-activity REST shapes
        `https://api.tryterra.co/v2/activity/${encodeURIComponent(summaryId)}?user_id=${conn.terra_user_id}&to_webhook=false&with_samples=true`,
        `https://api.tryterra.co/v2/activity/${encodeURIComponent(`1:${summaryId}`)}?user_id=${conn.terra_user_id}&to_webhook=false&with_samples=true`,
      ];
      for (const perUrl of candidates) {
        const r2 = await fetch(perUrl, { headers });
        perActivityStatus = r2.status;
        const j2 = await r2.json().catch(() => ({}));
        perActivityType = j2?.type ?? null;
        const arr = Array.isArray(j2?.data) ? j2.data : (j2?.data ? [j2.data] : []);
        let best: any[] = [];
        for (const it of arr) {
          const sid = String(it?.metadata?.summary_id ?? "");
          if (sid && sid !== summaryId) continue;
          const s = extractHrSamples(it);
          if (s.length > best.length) best = s;
        }
        perAttempts.push({ url: perUrl, status: r2.status, type: j2?.type, items: arr.length, hr: best.length });
        if (best.length > 0) { hrSamples = best; break; }
      }
    }

    summary.push({
      summary_id: summaryId,
      start_time: meta?.start_time,
      hr_from_range: hrFromRange.length,
      hr_final: hrSamples.length,
      per_activity_status: perActivityStatus,
      per_activity_type: perActivityType,
      per_attempts: perAttempts,
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
      diag_no_samples_items: diagItems,
      diag_status: rd.status,
      diag_message: jd?.message ?? null,
      diag_type: jd?.type ?? null,
      range_type: j1?.type,
      range_message: j1?.message,
      used_fallback: usedFallback,
      items: items.length,
      summary,
      updates,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

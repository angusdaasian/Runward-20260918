// Sync all activities from a target year (default: 2026) via Terra.
// Mirrors terra-sync-week but chunks the year-to-date into 30-day windows
// because Terra's /v2/activity historical endpoint is capped at ~30 days
// per request. Uses to_webhook=false&with_samples=true so HR sample arrays
// come back inline (no S3 round-trip), then ingests through the trusted
// webhook pipeline for parser/dedupe parity.
//
// Premium-gated on the client. Rate-limited to 1 call per UTC day per user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";
import { ingestTrustedTerraPayload } from "../_shared/terraWebhookHandler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const providerFilter: string | undefined = body.provider
      ? String(body.provider).toUpperCase()
      : undefined;
    const targetYear = Number.isFinite(Number(body.year)) ? Number(body.year) : 2026;
    const targetUserId: string | undefined = typeof body.targetUserId === "string"
      ? body.targetUserId
      : undefined;

    let connUserId = user.id;
    const isAdminCall = !!(targetUserId && targetUserId !== user.id);
    if (isAdminCall) {
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      connUserId = targetUserId!;
    }

    // Premium check (skipped for admin sync of another user).
    if (!isAdminCall) {
      const { data: prem } = await admin
        .from("premium_subscriptions")
        .select("expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      const stillPremium = prem && new Date(prem.expires_at) > new Date();
      if (!stillPremium) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "premium_required",
            message_en: "Premium membership required to sync a full year.",
            message_zh: "需要 Premium 會員方可同步整年活動。",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Rate limit: 1 call per UTC day per user.
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const { count } = await admin
        .from("terra_sync_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("function_name", "terra-sync-year")
        .gte("called_at", startOfDay.toISOString());
      if ((count ?? 0) >= 1) {
        return new Response(
          JSON.stringify({
            ok: false,
            rateLimited: true,
            activities: 0,
            message_en: `You've already synced ${targetYear} today. Please try again tomorrow.`,
            message_zh: `您今天已同步過 ${targetYear} 年活動，請明天再試。`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await admin.from("terra_sync_usage").insert({
        user_id: user.id,
        function_name: "terra-sync-year",
      });
    }

    const q = admin.from("terra_connections").select("*").eq("user_id", connUserId).eq("active", true);
    const { data: conns } = providerFilter ? await q.eq("provider", providerFilter) : await q;
    if (!conns || conns.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, activities: 0, message: "no active connections" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const forceProd = body.forceEnv === "prod" || body.useProd === true;
    const resolvedEnv = forceProd ? "prod" : pickEnvFromRequest(req);
    const { devId, apiKey, env } = getTerraCreds(resolvedEnv);

    // Window: Jan 1 of targetYear -> min(Dec 31 + 1, tomorrow)
    const now = new Date();
    const yearStart = new Date(Date.UTC(targetYear, 0, 1));
    const yearEndExclusive = new Date(Date.UTC(targetYear + 1, 0, 1));
    const tomorrow = new Date(now.getTime() + DAY_MS);
    const windowEnd = yearEndExclusive.getTime() < tomorrow.getTime() ? yearEndExclusive : tomorrow;
    if (yearStart.getTime() >= windowEnd.getTime()) {
      return new Response(
        JSON.stringify({ ok: true, activities: 0, message: "year not started" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build 30-day chunks.
    const chunks: Array<{ start: string; end: string }> = [];
    for (let t = yearStart.getTime(); t < windowEnd.getTime(); t += CHUNK_DAYS * DAY_MS) {
      const s = new Date(t);
      const e = new Date(Math.min(t + CHUNK_DAYS * DAY_MS, windowEnd.getTime()));
      chunks.push({ start: ymd(s), end: ymd(e) });
    }
    console.log(`[terra-sync-year] env=${env} year=${targetYear} chunks=${chunks.length} user=${connUserId}`);

    let activityCount = 0;
    const perProvider: Array<Record<string, unknown>> = [];

    for (const c of conns) {
      const headers = { "dev-id": devId, "x-api-key": apiKey };
      let providerIngested = 0;
      let providerSkipped = 0;
      let providerReturned = 0;
      const chunkSummaries: any[] = [];

      for (const ch of chunks) {
        const url = `https://api.tryterra.co/v2/activity?user_id=${c.terra_user_id}&start_date=${ch.start}&end_date=${ch.end}&to_webhook=false&with_samples=true`;
        try {
          const r = await fetch(url, { headers });
          const terraReference = r.headers.get("terra-reference");
          const j = await r.json();
          const items: any[] = Array.isArray(j?.data) ? j.data : [];
          const returned = items.length;
          providerReturned += returned;

          let ingestedHere = 0;
          let skippedHere = 0;
          // Drain items one at a time so the parsed JSON can be GC'd progressively.
          while (items.length) {
            const a = items.shift();
            const aid = String(a?.metadata?.summary_id ?? a?.metadata?.upload_id ?? "");
            try {
              const envelope = {
                type: "activity",
                user: { user_id: c.terra_user_id, reference_id: c.reference_id, provider: c.provider },
                data: [a],
              };
              const payload = JSON.stringify(envelope);
              const ing = await ingestTrustedTerraPayload(payload, "prod", "manual_sync_year");
              if (ing.ok) { activityCount++; ingestedHere++; providerIngested++; }
              else { skippedHere++; providerSkipped++; console.warn(`[terra-sync-year] ingest err ${c.provider} id=${aid}: ${ing.error}`); }
            } catch (e) {
              skippedHere++;
              providerSkipped++;
              console.error(`[terra-sync-year] ingest threw ${c.provider} id=${aid}`, e);
            }
          }
          chunkSummaries.push({
            start: ch.start, end: ch.end,
            status: r.status, returned,
            ingested: ingestedHere, skipped: skippedHere,
            terraReference,
          });
          console.log(`[terra-sync-year] ${c.provider} ${ch.start}->${ch.end} status=${r.status} returned=${returned} ingested=${ingestedHere}`);
        } catch (e) {
          console.error(`[terra-sync-year] fetch failed ${c.provider} ${ch.start}->${ch.end}`, e);
          chunkSummaries.push({ start: ch.start, end: ch.end, error: String(e) });
        }
      }

      perProvider.push({
        provider: c.provider,
        returned: providerReturned,
        ingested: providerIngested,
        skipped: providerSkipped,
        chunks: chunkSummaries,
      });

      await admin
        .from("terra_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", c.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        activities: activityCount,
        year: targetYear,
        window: { start: ymd(yearStart), end: ymd(windowEnd), chunks: chunks.length },
        providers: perProvider,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[terra-sync-year] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

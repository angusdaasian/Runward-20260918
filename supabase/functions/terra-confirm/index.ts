// terra-confirm: fallback for when Terra's `auth` webhook is delayed or never
// delivered. Called by the /terra-return page on status=success. Upserts the
// terra_connections row from the redirect params and kicks off today's
// daily/sleep backfill so data starts flowing immediately.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider ?? "").toUpperCase().trim();
    const terraUserId = String(body.terra_user_id ?? "").trim();
    const referenceId = String(body.reference_id ?? user.id).trim();

    if (!provider) return json({ error: "missing provider" }, 400);
    if (!terraUserId) return json({ error: "missing terra_user_id" }, 400);

    // Caller must own the reference_id they're confirming.
    if (referenceId !== user.id) {
      return json({ error: "reference_id mismatch" }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // If a webhook beat us to it for this terra_user_id, treat as success.
    const { data: existing } = await admin
      .from("terra_connections")
      .select("id, user_id, terra_user_id")
      .eq("terra_user_id", terraUserId)
      .maybeSingle();

    if (existing && existing.user_id !== user.id) {
      return json({ error: "terra_user_id already linked to another account" }, 409);
    }

    const { error: upsertErr } = await admin.from("terra_connections").upsert({
      user_id: user.id,
      terra_user_id: terraUserId,
      provider,
      reference_id: referenceId,
      active: true,
      last_webhook_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });

    if (upsertErr) {
      console.error("[terra-confirm] upsert failed", upsertErr);
      return json({ error: upsertErr.message }, 500);
    }

    // Kick off today's health backfill + 7-day activity backfill (fire-and-forget).
    // to_webhook=true so results flow through the normal webhook → worker pipeline.
    const env = pickEnvFromRequest(req);
    const { devId, apiKey } = getTerraCreds(env);
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const headers = { "dev-id": devId, "x-api-key": apiKey };
    const calls = [
      { ep: "activity", url: `https://api.tryterra.co/v2/activity?user_id=${terraUserId}&start_date=${weekAgo}&end_date=${today}&to_webhook=true&with_samples=true` },
      { ep: "daily",    url: `https://api.tryterra.co/v2/daily?user_id=${terraUserId}&start_date=${today}&end_date=${today}&to_webhook=true&with_samples=false` },
      { ep: "sleep",    url: `https://api.tryterra.co/v2/sleep?user_id=${terraUserId}&start_date=${today}&end_date=${today}&to_webhook=true&with_samples=false` },
    ];


    (async () => {
      const results = await Promise.allSettled(
        calls.map((c) => fetch(c.url, { headers }).then((r) => ({ ep: c.ep, status: r.status }))),
      );
      const summary = results.map((r, i) =>
        r.status === "fulfilled" ? r.value : { ep: calls[i].ep, error: String((r as any).reason) }
      );
      try {
        await admin.from("terra_webhook_events").insert({
          type: "terra_confirm_backfill",
          terra_user_id: terraUserId,
          reference_id: referenceId,
          signature_valid: true,
          payload: { provider, source: "terra-confirm", env, activity_window_days: 0, daily_date: today, results: summary } as any,
        });
      } catch (e) {
        console.error("[terra-confirm] backfill log insert failed", e);
      }
    })();

    console.log(`[terra-confirm] linked provider=${provider} terra_user_id=${terraUserId} user_id=${user.id} env=${env}`);
    return json({ ok: true, provider, terra_user_id: terraUserId });
  } catch (e) {
    console.error("[terra-confirm] error", e);
    return json({ error: String(e) }, 500);
  }
});

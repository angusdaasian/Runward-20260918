import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({ source: z.literal("cron").optional() }).strict();
const CUTOFF_UTC = Date.parse("2026-10-10T16:00:00Z");
const BATCH_SIZE = 8;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const expected = Deno.env.get("WEBHOOK_AUTH_KEY");
  if (!expected || req.headers.get("x-webhook-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

  if (Date.now() < CUTOFF_UTC) {
    return json({ ok: true, waiting: true, starts_at: new Date(CUTOFF_UTC).toISOString() });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "missing Supabase configuration" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);

  // Stop all old inactivity schedules as soon as the final shutdown begins.
  for (const jobName of ["terra-inactivity-sweep-daily", "terra-inactivity-warn-3days-2026-07-01"]) {
    await admin.rpc("unschedule_cron_job", { job_name: jobName });
  }

  const { data: connections, error } = await admin
    .from("terra_connections")
    .select("id, user_id, provider, created_at")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return json({ error: error.message }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const connection of connections ?? []) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/terra-admin-deauth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": serviceKey,
          apikey: anonKey,
        },
        body: JSON.stringify({ connection_id: connection.id }),
        signal: AbortSignal.timeout(15_000),
      });
      const output = await response.json().catch(() => null);
      results.push({
        connection_id: connection.id,
        user_id: connection.user_id,
        provider: connection.provider,
        ok: response.ok,
        output,
      });
    } catch (caught) {
      results.push({
        connection_id: connection.id,
        user_id: connection.user_id,
        provider: connection.provider,
        ok: false,
        error: String(caught),
      });
    }
  }

  const { count: remaining, error: countError } = await admin
    .from("terra_connections")
    .select("id", { count: "exact", head: true })
    .eq("active", true);

  if (countError) return json({ error: countError.message, processed: results.length, results }, 500);

  if ((remaining ?? 0) === 0) {
    await admin.rpc("unschedule_cron_job", { job_name: "terra-final-shutdown-hourly" });
  }

  return json({
    ok: true,
    processed: results.length,
    remaining: remaining ?? 0,
    complete: (remaining ?? 0) === 0,
    results,
  });
});
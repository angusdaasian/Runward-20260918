// Per-user Stridee Garmin sync, triggered from the Home Sync button.
// Body: { days?: number, all?: boolean }
//  - Free users: capped at the past 30 days.
//  - Premium users: `all: true` backfills up to 5 years and turns on automatic
//    (webhook) sync for the account.
// Processes a small batch per call; returns `remaining` so the client can loop.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { strideeFetch } from "../_shared/stridee.ts";
import { ingestStrideeActivity, isPremium } from "../_shared/strideeIngest.ts";
import { syncStrideeWellness } from "../_shared/strideeWellness.ts";
import { triggerCrossPlatformDedup } from "../_shared/triggerDedup.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_PER_RUN = 12;
const FREE_DAYS = 30;
const ALL_DAYS = 5 * 366;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    // Internal (server-to-server) mode: lets the history backfill keep running
    // on the server even after the user closes the app.
    const whKey = Deno.env.get("WEBHOOK_AUTH_KEY");
    const internal = !!whKey && req.headers.get("x-webhook-key") === whKey && typeof body?.user_id === "string";
    let user: { id: string } | null = null;
    if (internal) user = { id: body.user_id };
    else {
      const { data } = await userClient.auth.getUser();
      user = data.user;
    }
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: conn } = await admin.from("stridee_connections").select("status, stridee_user_id").eq("user_id", user.id).maybeSingle();
    if (!conn || conn.status !== "connected") return json({ ok: true, stored: 0, remaining: 0, connected: false });

    const premium = await isPremium(admin, user.id);
    const wantAll = body?.all === true;
    if (wantAll && !premium) return json({ error: "premium_required" }, 402);
    if (wantAll && !internal) {
      // Full history already imported once — refuse repeats to protect the database.
      const { data: old } = await admin.from("terra_activities").select("id").eq("user_id", user.id)
        .like("terra_activity_id", "stridee_%").lt("start_time", "2026-01-01").limit(1);
      if (old?.length) return json({ ok: true, connected: true, premium, stored: 0, remaining: 0, already_done: true });
    }
    let days = wantAll ? ALL_DAYS : Math.max(1, Math.min(Number(body?.days) || 7, ALL_DAYS));
    if (!premium) days = Math.min(days, FREE_DAYS);
    const cutoff = Date.now() - days * 86400_000;

    // History replays are "received" recently even for old runs, so list by a
    // wide received window and filter on the run's own start time.
    const all: any[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 25; page++) {
      const qs = new URLSearchParams({
        external_user_id: user.id,
        since: new Date(Date.now() - ALL_DAYS * 86400_000).toISOString(),
        until: new Date().toISOString(),
        limit: "200",
      });
      if (cursor) qs.set("starting_after", cursor);
      const res = await strideeFetch("GET", `/v1/activities?${qs}`);
      const text = await res.text();
      if (!res.ok) return json({ error: "list failed", status: res.status, detail: text.slice(0, 300) }, 502);
      const b = JSON.parse(text);
      all.push(...(b.activities ?? []));
      cursor = b.has_more ? b.next_starting_after : undefined;
      if (!cursor) break;
    }
    const inWindow = all.filter((a) => {
      const t = Date.parse(a.start_time ?? a.received_at ?? "");
      return Number.isFinite(t) && t >= cutoff;
    });

    // Skip what we already have so repeated calls make progress.
    const { data: have } = await admin.from("terra_activities").select("terra_activity_id")
      .eq("user_id", user.id).like("terra_activity_id", "stridee_%").limit(5000);
    const haveIds = new Set((have ?? []).map((r: any) => r.terra_activity_id));
    const todo = inWindow.filter((a) => !haveIds.has(`stridee_${a.id}`))
      .sort((x, y) => String(y.start_time).localeCompare(String(x.start_time))); // newest first
    const batch = todo.slice(0, MAX_PER_RUN);

    let stored = 0, failed = 0;
    for (const a of batch) {
      try { await ingestStrideeActivity(admin, user.id, a); stored++; }
      catch (e) { console.error("[stridee-sync] ingest", a.id, e); failed++; }
    }
    let wellness = 0;
    if (!internal) { try { wellness = await syncStrideeWellness(admin, user.id, (conn as any).stridee_user_id ?? null, Math.min(days, 60)); } catch (e) { console.error("[stridee-sync] wellness", e); } }
    const remaining = Math.max(0, todo.length - batch.length);
    const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
    const chain = wantAll || (internal && body?.chain === true);
    if ((wantAll || chain) && remaining === 0) patch.auto_sync_enabled = true;
    await admin.from("stridee_connections").update(patch).eq("user_id", user.id);
    if (stored > 0) triggerCrossPlatformDedup(user.id, days * 24);

    // Full-history backfill continues server-side in the background.
    if (chain && remaining > 0 && whKey && (stored > 0 || failed < batch.length)) {
      const next = fetch(`${url}/functions/v1/stridee-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-key": whKey },
        body: JSON.stringify(wantAll ? { all: true, user_id: user.id } : { days, chain: true, user_id: user.id }),
      }).catch((e) => console.warn("[stridee-sync] chain failed", e));
      // @ts-ignore EdgeRuntime exists on Supabase Edge
      try { EdgeRuntime.waitUntil(next); } catch { /* detached */ }
    }

    return json({ ok: true, connected: true, premium, days, stored, failed, remaining, wellness, auto_sync: !!patch.auto_sync_enabled });
  } catch (e) {
    console.error("[stridee-sync]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

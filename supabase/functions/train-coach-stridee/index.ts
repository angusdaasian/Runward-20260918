// One-off, gentle backfill: retrain the AI coach for watch-connection users whose
// coach was never trained or was trained before they connected. Strictly one
// user at a time, paced, time-boxed, self-chaining until the queue is empty.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const PACE_MS = 15_000;
const TIME_BUDGET_MS = 100_000;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const key = Deno.env.get("WEBHOOK_AUTH_KEY");
  if (!key || req.headers.get("x-webhook-key") !== key) return json({ error: "Unauthorized" }, 401);

  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(URL_, SR);

  const { data: conns } = await admin
    .from("stridee_connections").select("user_id, created_at").eq("status", "connected");
  const ids = (conns ?? []).map((c: any) => c.user_id);
  const { data: marks } = ids.length
    ? await admin.from("ai_coach_insights").select("user_id, insight_value")
        .eq("insight_key", "_trained_2026_at").in("user_id", ids)
    : { data: [] as any[] };
  const markOf = new Map((marks ?? []).map((m: any) => [m.user_id, m.insight_value]));
  const queue = (conns ?? []).filter((c: any) => {
    const m = markOf.get(c.user_id);
    return !m || !(new Date(m) >= new Date(c.created_at));
  }).map((c: any) => c.user_id as string);

  const start = Date.now();
  const done: Array<{ user: string; status: number }> = [];
  for (const uid of queue) {
    if (Date.now() - start > TIME_BUDGET_MS) break;
    const r = await fetch(`${URL_}/functions/v1/ai-running-coach?action=train_user_model`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": SR, Authorization: `Bearer ${SR}` },
      body: JSON.stringify({ internalUserId: uid }),
    }).catch(() => null);
    const status = r?.status ?? 0;
    await r?.text().catch(() => "");
    done.push({ user: uid.slice(0, 8), status });
    console.log(`[train-coach-stridee] ${uid} -> ${status}`);
    if (status === 402 || status === 403) break; // credits/policy: stop the chain
    if (status !== 200) {
      // Mark failures as handled so the chain cannot loop on the same user.
      await admin.from("ai_coach_insights").upsert({
        user_id: uid, insight_type: "preference", insight_key: "_trained_2026_at",
        insight_value: new Date().toISOString(), confidence: 0,
      }, { onConflict: "user_id,insight_key" });
    }
    await new Promise((res) => setTimeout(res, PACE_MS));
  }

  const remaining = queue.length - done.length;
  const stopped = done.some((d) => d.status === 402 || d.status === 403);
  if (remaining > 0 && !stopped) {
    const next = fetch(`${URL_}/functions/v1/train-coach-stridee`, {
      method: "POST", headers: { "x-webhook-key": key },
    }).catch(() => undefined);
    try { (globalThis as any).EdgeRuntime?.waitUntil(next); } catch { /* detached */ }
  }
  return json({ ok: true, processed: done, remaining, stopped });
});

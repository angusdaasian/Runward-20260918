// Daily watch-connection inactivity sweep — pg_cron at 16:00 UTC (00:00 HKT).
// Free users inactive 25–29 days get one reminder push per day; at 30+ days the
// watch connection is removed (same as a manual disconnect). Premium is exempt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const DEAUTH_DAYS = 30;
const WARN_DAYS = 25;
const NOTIF_KEY = "stridee";

function msg(lang: "zh" | "en", left: number) {
  return lang === "zh"
    ? { title: "手錶連線即將解除", message: `你已一段時間未開啟 RunWard。再過 ${left} 天，你的手錶連線將自動解除。立即開啟應用以保留連線，或升級 Premium 永久保留！` }
    : { title: "Watch connection expiring", message: `You haven't opened RunWard for a while. Your watch connection will disconnect in ${left} day(s). Open the app to keep it — or upgrade to Premium to keep it forever!` };
}
function gone(lang: "zh" | "en") {
  return lang === "zh"
    ? { title: "手錶連線已解除", message: "由於 30 天未使用，你的手錶連線已解除。隨時可在應用內重新連接。" }
    : { title: "Watch disconnected", message: "Your watch connection was disconnected after 30 days of inactivity. You can reconnect anytime in the app." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  let body: { dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* */ }
  const dryRun = !!body.dryRun;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const osApp = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
  const osKey = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

  const { data: conns, error } = await admin.from("stridee_connections").select("user_id, created_at");
  if (error) return json({ error: error.message }, 500);
  const ids = Array.from(new Set((conns ?? []).map((c: any) => c.user_id)));
  if (!ids.length) return json({ ok: true, connections: 0 });

  const connAt = new Map((conns ?? []).map((c: any) => [c.user_id, c.created_at]));
  const { data: profs } = await admin.from("profiles").select("user_id, is_premium, last_login, last_active_at, lang").in("user_id", ids);
  const { data: subs } = await admin.from("premium_subscriptions").select("user_id, expires_at").in("user_id", ids);
  const premium = new Set((subs ?? []).filter((s: any) => !s.expires_at || new Date(s.expires_at) > new Date()).map((s: any) => s.user_id));

  const send = async (uid: string, t: { title: string; message: string }) => {
    if (!osApp || !osKey) return false;
    const r = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${osKey}` },
      body: JSON.stringify({ app_id: osApp, include_external_user_ids: [uid], headings: { en: t.title }, contents: { en: t.message } }),
    });
    await r.text();
    return r.ok;
  };

  const results: any[] = [];
  for (const p of profs ?? []) {
    if (p.is_premium || premium.has(p.user_id) || !p.last_login) continue;
    // Count from the later of last sign-in and when the watch was connected.
    const since = Math.max(new Date(p.last_login).getTime(), new Date(p.last_active_at ?? 0).getTime(), new Date(connAt.get(p.user_id) ?? 0).getTime());
    const days = Math.floor((Date.now() - since) / 86400e3);
    if (days < WARN_DAYS) continue;
    const lang: "zh" | "en" = p.lang === "zh" ? "zh" : "en";
    const action = days >= DEAUTH_DAYS ? "disconnect" : "warn";
    if (dryRun) { results.push({ user_id: p.user_id, days, action }); continue; }

    if (action === "disconnect") {
      const { error: delErr } = await admin.from("stridee_connections").delete().eq("user_id", p.user_id);
      const pushed = delErr ? false : await send(p.user_id, gone(lang));
      results.push({ user_id: p.user_id, days, action, ok: !delErr, pushed, error: delErr?.message });
      continue;
    }
    const { data: already } = await admin.from("terra_inactivity_notifications").select("id")
      .eq("user_id", p.user_id).eq("provider", NOTIF_KEY).eq("sent_on", today).maybeSingle();
    if (already) { results.push({ user_id: p.user_id, days, action, skipped: "already_sent_today" }); continue; }
    const ok = await send(p.user_id, msg(lang, DEAUTH_DAYS - days));
    if (ok) await admin.from("terra_inactivity_notifications").insert({ user_id: p.user_id, provider: NOTIF_KEY, sent_on: today, days_inactive: days });
    results.push({ user_id: p.user_id, days, action, ok });
  }
  console.log("[stridee-inactivity-sweep]", JSON.stringify({ today, dryRun, results }));
  return json({ ok: true, today, dryRun, processed: results.length, results });
});

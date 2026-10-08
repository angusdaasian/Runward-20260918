// One-off: schedule a Chinese reconnect reminder push for all users with active Terra connections.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SEND_AFTER = "2026-10-08T16:00:00Z"; // 00:00 HKT, 9 Oct
const TITLE = "請重新連接你的手錶";
const MESSAGE = "為確保你的跑步紀錄繼續自動同步，請前往 RunWard 重新連接你的手錶（Garmin、COROS、Suunto 等）。只需一分鐘即可完成！";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  let ok = auth === serviceKey || req.headers.get("x-admin-secret") === serviceKey;
  if (!ok && auth) {
    const a = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { data: u } = await a.auth.getUser(auth);
    if (u?.user) {
      const { data: isAdmin } = await a.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      ok = isAdmin === true;
    }
  }
  if (!ok) return json({ error: "unauthorized" }, 401);

  let body: { dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* */ }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const { data, error } = await admin.from("terra_connections").select("user_id").eq("active", true);
  if (error) return json({ error: error.message }, 500);
  const ids = Array.from(new Set((data ?? []).map((r) => r.user_id).filter(Boolean)));

  if (body.dryRun !== false) return json({ dryRun: true, count: ids.length, ids });

  const appId = Deno.env.get("ONESIGNAL_APP_ID")!;
  const key = Deno.env.get("ONESIGNAL_REST_API_KEY")!;
  const results: unknown[] = [];
  for (let i = 0; i < ids.length; i += 2000) {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${key}` },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: ids.slice(i, i + 2000),
        headings: { en: TITLE, "zh-Hant": TITLE },
        contents: { en: MESSAGE, "zh-Hant": MESSAGE },
        send_after: SEND_AFTER,
      }),
    });
    results.push({ status: res.status, out: await res.json().catch(() => null) });
  }
  return json({ count: ids.length, send_after: SEND_AFTER, results });
});

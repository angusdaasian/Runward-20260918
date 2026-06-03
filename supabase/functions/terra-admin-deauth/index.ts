// Service-role helper to deauthorize a Terra user properly:
//   1. DELETE /v2/auth/deauthenticateUser on Terra (prod creds, test fallback)
//   2. Remove the row from terra_connections
//   3. Log to terra_reconciliation_log
//
// Requires header `x-admin-secret` == SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function callDeauth(terraUserId: string, env: "prod" | "test") {
  const devId = env === "prod"
    ? Deno.env.get("TERRA_DEV_ID") ?? ""
    : Deno.env.get("TERRA_DEV_ID_TEST") ?? "";
  const apiKey = env === "prod"
    ? Deno.env.get("TERRA_API_KEY") ?? ""
    : Deno.env.get("TERRA_API_KEY_TEST") ?? "";
  if (!devId || !apiKey) return { ok: false, status: 0, body: `missing ${env} creds` };
  try {
    const res = await fetch(
      `https://api.tryterra.co/v2/auth/deauthenticateUser?user_id=${encodeURIComponent(terraUserId)}`,
      { method: "DELETE", headers: { "dev-id": devId, "x-api-key": apiKey } },
    );
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: text };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.headers.get("x-admin-secret") !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { terra_user_id?: string; connection_id?: string; user_id?: string; provider?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let conn: any = null;
  if (body.connection_id) {
    const { data } = await admin.from("terra_connections").select("*").eq("id", body.connection_id).maybeSingle();
    conn = data;
  } else if (body.terra_user_id) {
    const { data } = await admin.from("terra_connections").select("*").eq("terra_user_id", body.terra_user_id).maybeSingle();
    conn = data;
  } else if (body.user_id && body.provider) {
    const { data } = await admin
      .from("terra_connections")
      .select("*")
      .eq("user_id", body.user_id)
      .eq("provider", String(body.provider).toUpperCase())
      .maybeSingle();
    conn = data;
  }
  if (!conn) return json({ error: "connection not found" }, 404);

  // Try prod, fallback to test on "not found / invalid user"
  let result = await callDeauth(conn.terra_user_id, "prod");
  let envUsed: "prod" | "test" = "prod";
  if (!result.ok && /not.?found|invalid.?user/i.test(result.body)) {
    const testRes = await callDeauth(conn.terra_user_id, "test");
    if (testRes.ok) { result = testRes; envUsed = "test"; }
  }

  // Remove row regardless — if Terra says not found, it's already gone on their side.
  const { error: delErr } = await admin.from("terra_connections").delete().eq("id", conn.id);

  try {
    await admin.from("terra_reconciliation_log").insert({
      source_table: "terra_connections",
      status: result.ok ? `deauthed_${envUsed}` : "deauth_failed_row_removed",
      payload_id: conn.terra_user_id,
      terra_user_id: conn.terra_user_id,
      data_type: "inactivity_deauth",
      detail: `provider=${conn.provider} user_id=${conn.user_id} status=${result.status} body=${result.body?.slice(0, 200)} delErr=${delErr?.message ?? "none"}`,
    });
  } catch (e) {
    console.error("[terra-admin-deauth] log insert failed", e);
  }

  return json({
    ok: true,
    terra_ok: result.ok,
    env_used: envUsed,
    terra_status: result.status,
    terra_body: result.body,
    row_deleted: !delErr,
    delete_error: delErr?.message ?? null,
  });
});

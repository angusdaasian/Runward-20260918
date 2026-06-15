// OAuth token endpoint: exchanges a one-time code for access+refresh tokens,
// or rotates a refresh token. Validates PKCE and client credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { randomBase64Url, sha256Hex } from "../_shared/oauth-utils.ts";

const ACCESS_TTL_SEC = 6 * 60 * 60;          // 6 hours
const REFRESH_TTL_SEC = 60 * 24 * 60 * 60;   // 60 days

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ct = req.headers.get("content-type") ?? "";
    let payload: Record<string, string> = {};
    if (ct.includes("application/json")) {
      payload = await req.json();
    } else {
      const form = await req.formData();
      form.forEach((v, k) => { payload[k] = String(v); });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const grant_type = payload.grant_type;
    const client_id = payload.client_id;
    const client_secret = payload.client_secret;
    if (!client_id || !client_secret) return err(400, "invalid_client");

    const { data: app } = await admin
      .from("oauth_apps")
      .select("id,client_secret_hash,status,redirect_uris")
      .eq("client_id", client_id).maybeSingle();
    if (!app || app.status !== "active") return err(400, "invalid_client");
    const cs_hash = await sha256Hex(client_secret);
    if (cs_hash !== app.client_secret_hash) return err(401, "invalid_client");

    if (grant_type === "authorization_code") {
      const code = payload.code;
      const redirect_uri = payload.redirect_uri;
      const code_verifier = payload.code_verifier;
      if (!code || !redirect_uri || !code_verifier) return err(400, "invalid_request");
      const code_hash = await sha256Hex(code);

      const { data: row } = await admin
        .from("oauth_auth_codes")
        .select("*")
        .eq("code_hash", code_hash).maybeSingle();
      if (!row) return err(400, "invalid_grant");
      if (row.used_at) return err(400, "invalid_grant");
      if (row.app_id !== app.id) return err(400, "invalid_grant");
      if (row.redirect_uri !== redirect_uri) return err(400, "invalid_grant");
      if (new Date(row.expires_at) < new Date()) return err(400, "invalid_grant");

      // PKCE S256: BASE64URL(SHA256(verifier)) == challenge
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code_verifier));
      const expectedChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      if (expectedChallenge !== row.pkce_challenge) return err(400, "invalid_grant");

      await admin.from("oauth_auth_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);

      return await issueTokens(admin, app.id, row.user_id, row.scopes ?? ["activity:read"]);
    }

    if (grant_type === "refresh_token") {
      const refresh_token = payload.refresh_token;
      if (!refresh_token) return err(400, "invalid_request");
      const refresh_hash = await sha256Hex(refresh_token);
      const { data: auth } = await admin
        .from("oauth_authorizations")
        .select("*")
        .eq("app_id", app.id)
        .eq("refresh_token_hash", refresh_hash).maybeSingle();
      if (!auth || auth.revoked_at) return err(400, "invalid_grant");
      if (new Date(auth.refresh_expires_at) < new Date()) return err(400, "invalid_grant");
      return await issueTokens(admin, app.id, auth.user_id, auth.scopes ?? ["activity:read"], auth.id);
    }

    return err(400, "unsupported_grant_type");
  } catch (e) {
    return err(500, String((e as Error)?.message ?? e));
  }
});

async function issueTokens(admin: any, app_id: string, user_id: string, scopes: string[], existingAuthId?: string) {
  const access_token = randomBase64Url(32);
  const refresh_token = randomBase64Url(32);
  const access_hash = await sha256Hex(access_token);
  const refresh_hash = await sha256Hex(refresh_token);
  const now = new Date();
  const expires_at = new Date(now.getTime() + ACCESS_TTL_SEC * 1000).toISOString();
  const refresh_expires_at = new Date(now.getTime() + REFRESH_TTL_SEC * 1000).toISOString();

  if (existingAuthId) {
    await admin.from("oauth_authorizations").update({
      access_token_hash: access_hash,
      refresh_token_hash: refresh_hash,
      expires_at, refresh_expires_at,
      scopes, last_used_at: now.toISOString(), revoked_at: null,
    }).eq("id", existingAuthId);
  } else {
    await admin.from("oauth_authorizations").upsert({
      app_id, user_id,
      access_token_hash: access_hash,
      refresh_token_hash: refresh_hash,
      expires_at, refresh_expires_at,
      scopes, last_used_at: now.toISOString(), revoked_at: null,
    }, { onConflict: "app_id,user_id" });
  }

  return new Response(JSON.stringify({
    token_type: "Bearer",
    access_token, refresh_token,
    expires_in: ACCESS_TTL_SEC,
    scope: scopes.join(" "),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function err(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

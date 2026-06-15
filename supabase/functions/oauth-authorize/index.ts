// OAuth consent: validates app+redirect_uri, then on POST issues a single-use
// authorization code bound to the logged-in user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { randomBase64Url, sha256Hex } from "../_shared/oauth-utils.ts";

const Body = z.object({
  client_id: z.string().min(3),
  redirect_uri: z.string().url(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().min(20).max(200),
  code_challenge_method: z.literal("S256"),
});

const InspectBody = z.object({
  client_id: z.string(),
  redirect_uri: z.string().url(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "grant";

  try {
    if (action === "inspect") {
      // Public: returns app metadata for the consent screen
      const parsed = InspectBody.safeParse(await req.json());
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const { client_id, redirect_uri } = parsed.data;
      const { data: app } = await admin
        .from("oauth_apps")
        .select("id,name,description,website_url,logo_url,redirect_uris,status")
        .eq("client_id", client_id).maybeSingle();
      if (!app || app.status !== "active") return json(404, { error: "app_not_active" });
      if (!(app.redirect_uris as string[]).includes(redirect_uri)) {
        return json(400, { error: "invalid_redirect_uri" });
      }
      return json(200, {
        app: { id: app.id, name: app.name, description: app.description, website_url: app.website_url, logo_url: app.logo_url },
        scopes: ["activity:read"],
      });
    }

    // grant: requires logged-in user
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "unauthorized" });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = parsed.data;
    const scopes = (scope ?? "activity:read").split(/\s+/).filter(Boolean);

    const { data: app } = await admin
      .from("oauth_apps")
      .select("id,redirect_uris,status,max_athletes")
      .eq("client_id", client_id).maybeSingle();
    if (!app || app.status !== "active") return json(400, { error: "app_not_active" });
    if (!(app.redirect_uris as string[]).includes(redirect_uri)) {
      return json(400, { error: "invalid_redirect_uri" });
    }

    // Check athlete cap (only for brand-new authorizations)
    const { data: existing } = await admin
      .from("oauth_authorizations")
      .select("id").eq("app_id", app.id).eq("user_id", userData.user.id).maybeSingle();
    if (!existing) {
      const { count } = await admin
        .from("oauth_authorizations")
        .select("id", { count: "exact", head: true })
        .eq("app_id", app.id)
        .is("revoked_at", null);
      if ((count ?? 0) >= (app.max_athletes ?? 300)) {
        return json(400, { error: "athlete_limit_reached" });
      }
    }

    const code = randomBase64Url(32);
    const code_hash = await sha256Hex(code);
    await admin.from("oauth_auth_codes").insert({
      code_hash,
      app_id: app.id,
      user_id: userData.user.id,
      redirect_uri,
      scopes,
      pkce_challenge: code_challenge,
      pkce_method: code_challenge_method,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    const sep = redirect_uri.includes("?") ? "&" : "?";
    const params = new URLSearchParams({ code });
    if (state) params.set("state", state);
    return json(200, { redirect: `${redirect_uri}${sep}${params.toString()}` });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

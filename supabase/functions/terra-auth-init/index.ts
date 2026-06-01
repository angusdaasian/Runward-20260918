// terra-auth-init: starts Terra's hosted OAuth flow AND eagerly stores the
// terra_user_id returned by /v2/auth/authenticateUser into terra_connections.
// This guards against the `auth`/`reauth` webhook arriving late (or never) —
// we already have a row tied to the user before they even tap "Authorize".
// Also kicks off a 7-day activity + today's daily/sleep backfill in the
// background (mirrors terra-confirm) so data starts flowing immediately.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED = new Set(["GARMIN", "POLAR", "SUUNTO", "COROS", "ZEPP", "FITBIT"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user }, error: uerr } = await supa.auth.getUser();
    if (uerr || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider ?? "").toUpperCase();
    if (!ALLOWED.has(provider)) {
      return new Response(JSON.stringify({ error: "invalid provider" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const env = pickEnvFromRequest(req, [body.success_url, body.failure_url]);
    const { devId, apiKey } = getTerraCreds(env);
    console.log(`[terra-auth-init] env=${env} provider=${provider} user=${user.id}`);

    const baseHost = env === "test" ? "https://angustest.site" : "https://pacecalculator.fun";
    const DEFAULT_SUCCESS = `${baseHost}/terra-return?status=success&native=true`;
    const DEFAULT_FAILURE = `${baseHost}/terra-return?status=failure&native=true`;
    const successUrl = (typeof body.success_url === "string" && body.success_url.trim()) ? body.success_url.trim() : DEFAULT_SUCCESS;
    const failureUrl = (typeof body.failure_url === "string" && body.failure_url.trim()) ? body.failure_url.trim() : DEFAULT_FAILURE;

    const tres = await fetch(`https://api.tryterra.co/v2/auth/authenticateUser?resource=${provider}`, {
      method: "POST",
      headers: {
        "dev-id": devId,
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: "en",
        reference_id: user.id,
        auth_success_redirect_url: successUrl,
        auth_failure_redirect_url: failureUrl,
      }),
    });
    const tjson = await tres.json();
    if (!tres.ok) {
      console.error("[terra-auth-init] Terra auth init failed", tjson);
      return new Response(JSON.stringify({ error: "terra error", details: tjson }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const terraUserId: string | undefined = tjson.user_id;
    // Terra's response usually echoes back the provider (resource); prefer it
    // if present so we store exactly what Terra recorded. Scopes are not
    // available at init time — they arrive via the `auth` webhook later.
    const resolvedProvider: string = String(tjson.resource ?? tjson.provider ?? provider).toUpperCase();

    // Eagerly persist the terra_user_id so we don't depend on the `auth`/`reauth`
    // webhook (which can be delayed) or the /terra-return → terra-confirm
    // fallback (which can be skipped if the user closes the in-app browser).
    if (terraUserId) {
      try {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        // Guard: if this terra_user_id is already owned by another account, skip.
        const { data: existing } = await admin
          .from("terra_connections")
          .select("user_id")
          .eq("terra_user_id", terraUserId)
          .maybeSingle();

        if (existing && existing.user_id !== user.id) {
          console.warn(`[terra-auth-init] terra_user_id=${terraUserId} already linked to another user, skipping eager upsert`);
        } else {
          // IMPORTANT: do NOT mark active here. Terra returns a user_id as soon
          // as the auth URL is minted — before the user has entered any Garmin
          // credentials. Marking active:true here makes the UI show "connected"
          // even if the user abandons the OAuth flow. The `auth` webhook and
          // terra-confirm (on success redirect) are the only sources of truth
          // that flip active:true.
          const { error: upsertErr } = await admin.from("terra_connections").upsert({
            user_id: user.id,
            terra_user_id: terraUserId,
            provider: resolvedProvider,
            reference_id: user.id,
            active: false,
          }, { onConflict: "user_id,provider" });
          if (upsertErr) {
            console.error("[terra-auth-init] eager upsert failed", upsertErr);
          } else {
            console.log(`[terra-auth-init] eager-linked provider=${provider} terra_user_id=${terraUserId}`);

            // NOTE: do NOT trigger backfill here. terra-auth-init runs before
            // the user has actually authenticated with the provider, so Terra
            // has no data to return yet. The 7-day activity + today's
            // daily/sleep backfill is fired from terra-confirm (on success
            // redirect) and/or the `auth` webhook handler.

          }
        }
      } catch (e) {
        // Eager-link is best-effort; never block the auth_url response.
        console.error("[terra-auth-init] eager-link error", e);
      }
    } else {
      console.warn("[terra-auth-init] Terra did not return user_id; falling back to webhook/terra-confirm flow");
    }

    return new Response(JSON.stringify({ auth_url: tjson.auth_url, user_id: terraUserId, status: tjson.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

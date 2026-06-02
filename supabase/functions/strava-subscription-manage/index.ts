// Admin-only: manage Strava push subscription for a given strava_apps row.
// Actions:
//   - "view":   GET https://www.strava.com/api/v3/push_subscriptions
//   - "create": POST with callback_url + verify_token (from vault)
//   - "delete": DELETE /push_subscriptions/{id}
// Per Strava docs, each app may have at most ONE subscription.
// https://developers.strava.com/docs/webhooks/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { getStravaAppById } from "../_shared/strava-apps.ts";

const Body = z.object({
  app_id: z.string().uuid(),
  action: z.enum(["view", "create", "delete"]),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "unauthorized" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json(403, { error: "forbidden" });

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return json(400, { error: parsed.error.flatten().fieldErrors });
    }
    const { app_id, action } = parsed.data;

    const app = await getStravaAppById(admin, app_id);
    if (!app.client_secret) return json(400, { error: "client_secret missing in vault" });

    const callbackUrl = `${supabaseUrl}/functions/v1/strava-webhook`;
    const base = "https://www.strava.com/api/v3/push_subscriptions";

    if (action === "view") {
      const url = `${base}?client_id=${encodeURIComponent(app.client_id)}&client_secret=${encodeURIComponent(app.client_secret)}`;
      const res = await fetch(url);
      const body = await res.json().catch(() => null);
      return json(res.ok ? 200 : 502, { ok: res.ok, status: res.status, subscriptions: body });
    }

    if (action === "create") {
      if (!app.verify_token) return json(400, { error: "verify_token missing in vault" });

      // Strava only allows one subscription per app. Clear any stale one first.
      const listUrl = `${base}?client_id=${encodeURIComponent(app.client_id)}&client_secret=${encodeURIComponent(app.client_secret)}`;
      const listRes = await fetch(listUrl);
      const existing = (await listRes.json().catch(() => [])) as Array<{ id: number }>;
      if (Array.isArray(existing)) {
        for (const sub of existing) {
          await fetch(
            `${base}/${sub.id}?client_id=${encodeURIComponent(app.client_id)}&client_secret=${encodeURIComponent(app.client_secret)}`,
            { method: "DELETE" },
          );
        }
      }

      const form = new FormData();
      form.append("client_id", app.client_id);
      form.append("client_secret", app.client_secret);
      form.append("callback_url", callbackUrl);
      form.append("verify_token", app.verify_token);

      const res = await fetch(base, { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.id) {
        return json(502, { ok: false, status: res.status, error: body, callback_url: callbackUrl });
      }
      await admin.from("strava_apps").update({ subscription_id: body.id }).eq("id", app_id);
      return json(200, { ok: true, subscription_id: body.id, callback_url: callbackUrl });
    }

    if (action === "delete") {
      if (!app.subscription_id) return json(400, { error: "no subscription_id on file" });
      const url = `${base}/${app.subscription_id}?client_id=${encodeURIComponent(app.client_id)}&client_secret=${encodeURIComponent(app.client_secret)}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.text().catch(() => "");
        return json(502, { ok: false, status: res.status, error: body });
      }
      await admin.from("strava_apps").update({ subscription_id: null }).eq("id", app_id);
      return json(200, { ok: true });
    }

    return json(400, { error: "unknown action" });
  } catch (e) {
    return json(500, { error: String((e as any)?.message ?? e) });
  }
});

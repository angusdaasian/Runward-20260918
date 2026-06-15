// Admin-only management of developer apps: approve, reject, suspend, raise caps.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { randomBase64Url, sha256Hex } from "../_shared/oauth-utils.ts";

const ActionBody = z.object({
  app_id: z.string().uuid(),
  action: z.enum(["approve","reject","suspend","reactivate","update_caps"]),
  rejection_reason: z.string().max(500).optional(),
  max_athletes: z.number().int().min(1).max(100000).optional(),
  rate_limit_15min: z.number().int().min(1).max(100000).optional(),
  rate_limit_daily: z.number().int().min(1).max(1000000).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return json(403, { error: "forbidden" });

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("oauth_apps")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: error.message });
      return json(200, { apps: data });
    }

    const parsed = ActionBody.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { app_id, action } = parsed.data;

    if (action === "approve") {
      // generate secret + webhook signing secret, return secret once.
      const secret = randomBase64Url(30);
      const signing = randomBase64Url(24);
      const verify = randomBase64Url(16);
      const hash = await sha256Hex(secret);
      const { error } = await admin.from("oauth_apps").update({
        status: "active",
        client_secret_hash: hash,
        client_secret_prefix: secret.slice(0, 6),
        webhook_signing_secret: signing,
        webhook_verify_token: verify,
        approved_at: new Date().toISOString(),
        approved_by: userData.user.id,
        rejection_reason: null,
      }).eq("id", app_id);
      if (error) return json(500, { error: error.message });
      return json(200, { client_secret: secret, webhook_signing_secret: signing, webhook_verify_token: verify });
    }
    if (action === "reject") {
      const { error } = await admin.from("oauth_apps").update({
        status: "rejected",
        rejection_reason: parsed.data.rejection_reason ?? null,
      }).eq("id", app_id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }
    if (action === "suspend") {
      const { error } = await admin.from("oauth_apps").update({ status: "suspended" }).eq("id", app_id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }
    if (action === "reactivate") {
      const { error } = await admin.from("oauth_apps").update({ status: "active" }).eq("id", app_id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }
    if (action === "update_caps") {
      const patch: Record<string, number> = {};
      if (parsed.data.max_athletes != null) patch.max_athletes = parsed.data.max_athletes;
      if (parsed.data.rate_limit_15min != null) patch.rate_limit_15min = parsed.data.rate_limit_15min;
      if (parsed.data.rate_limit_daily != null) patch.rate_limit_daily = parsed.data.rate_limit_daily;
      const { error } = await admin.from("oauth_apps").update(patch).eq("id", app_id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }
    return json(400, { error: "unknown action" });
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

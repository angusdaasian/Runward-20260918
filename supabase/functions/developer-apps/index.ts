// Developer-portal CRUD: authenticated developers manage their own apps.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { newClientId, randomBase64Url } from "../_shared/oauth-utils.ts";

const CreateBody = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  website_url: z.string().url().optional().or(z.literal("")),
  contact_email: z.string().email(),
  redirect_uris: z.array(z.string().url()).min(1).max(5),
  webhook_url: z.string().url().optional().or(z.literal("")),
});

const UpdateBody = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  website_url: z.string().optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(5).optional(),
  webhook_url: z.string().optional(),
  contact_email: z.string().email().optional(),
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
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "unauthorized" });
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "list";

    if (req.method === "GET" || action === "list") {
      const { data, error } = await admin
        .from("oauth_apps")
        .select("id,name,description,website_url,contact_email,redirect_uris,webhook_url,client_id,client_secret_prefix,status,max_athletes,rate_limit_15min,rate_limit_daily,approved_at,rejection_reason,created_at")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: error.message });
      return json(200, { apps: data });
    }

    const body = await req.json().catch(() => ({}));

    if (action === "create") {
      const parsed = CreateBody.safeParse(body);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const v = parsed.data;
      // Validate redirect URIs are https (or localhost)
      for (const u of v.redirect_uris) {
        const p = new URL(u);
        if (p.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(p.hostname)) {
          return json(400, { error: `redirect_uri must be HTTPS: ${u}` });
        }
      }
      const client_id = newClientId();
      const { data, error } = await admin.from("oauth_apps").insert({
        owner_user_id: userId,
        name: v.name,
        description: v.description ?? null,
        website_url: v.website_url || null,
        contact_email: v.contact_email,
        redirect_uris: v.redirect_uris,
        webhook_url: v.webhook_url || null,
        client_id,
        status: "pending",
      }).select("id,client_id,status").single();
      if (error) return json(500, { error: error.message });
      return json(200, { app: data });
    }

    if (action === "update") {
      const parsed = UpdateBody.safeParse(body);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const { id, ...patch } = parsed.data;
      // verify ownership
      const { data: existing } = await admin.from("oauth_apps").select("owner_user_id").eq("id", id).maybeSingle();
      if (!existing || existing.owner_user_id !== userId) return json(404, { error: "not found" });
      const { error } = await admin.from("oauth_apps").update(patch).eq("id", id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    if (action === "rotate_secret") {
      const id = String(body.id ?? "");
      const { data: app } = await admin.from("oauth_apps").select("id,owner_user_id,status").eq("id", id).maybeSingle();
      if (!app || app.owner_user_id !== userId) return json(404, { error: "not found" });
      if (app.status !== "active") return json(400, { error: "app not active" });
      const secret = randomBase64Url(30);
      const hash = await (await import("../_shared/oauth-utils.ts")).sha256Hex(secret);
      await admin.from("oauth_apps").update({
        client_secret_hash: hash,
        client_secret_prefix: secret.slice(0, 6),
      }).eq("id", id);
      return json(200, { client_secret: secret });
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider ?? "").toUpperCase();
    if (!provider) return new Response(JSON.stringify({ error: "missing provider" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin.from("terra_connections").select("*").eq("user_id", user.id).eq("provider", provider).maybeSingle();
    if (!conn) return new Response(JSON.stringify({ ok: true, message: "no connection" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const devId = Deno.env.get("TERRA_DEV_ID")!;
    const apiKey = Deno.env.get("TERRA_API_KEY")!;
    try {
      await fetch(`https://api.tryterra.co/v2/auth/deauthenticateUser?user_id=${conn.terra_user_id}`, {
        method: "DELETE",
        headers: { "dev-id": devId, "x-api-key": apiKey },
      });
    } catch (e) { console.error("terra deauth error", e); }

    await admin.from("terra_connections").delete().eq("id", conn.id);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

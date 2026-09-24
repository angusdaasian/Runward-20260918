// Starts a Stridee Garmin link for the signed-in user and returns connect_url.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { strideeFetch } from "../_shared/stridee.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const pre = await req.clone().json().catch(() => ({}));
    if (pre?.action === "confirm_public" && typeof pre.stridee_user_id === "string" && pre.stridee_user_id) {
      // Return page opened in an outside browser (no app session). Only flips an
      // existing pending link that Stridee issued for this exact Stridee user id.
      const adminPub = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: rows } = await adminPub.from("stridee_connections")
        .update({ status: "connected", connected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("stridee_user_id", pre.stridee_user_id.slice(0, 100)).in("status", ["pending", "connected"]).select("user_id");
      return json({ ok: (rows?.length ?? 0) > 0 });
    }
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? "connect";

    if (action === "confirm") {
      // Browser came back with ?status=success&user_id=...
      const sid = typeof body.stridee_user_id === "string" ? body.stridee_user_id.slice(0, 100) : null;
      await admin.from("stridee_connections").upsert({
        user_id: user.id, stridee_user_id: sid, status: "connected",
        connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      return json({ ok: true });
    }

    if (action === "disconnect") {
      await admin.from("stridee_connections").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    const { data: existing } = await admin.from("stridee_connections")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing?.status === "connected") {
      return json({ already_connected: true });
    }

    const native = body?.native === true;
    // Stridee appends `?status=...&user_id=...` to this value. Keep the native
    // marker in the path so its query string cannot corrupt the deeplink scheme.
    const returnUri = native
      ? "https://angustest.site/stridee-return/native"
      : "https://angustest.site/stridee-return";
    const res = await strideeFetch("POST", "/v1/connect", {
      provider: "garmin",
      external_user_id: user.id,
      return_uri: returnUri,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[stridee-connect] failed", res.status, text);
      return json({ error: "Stridee connect failed", status: res.status, detail: text.slice(0, 500) }, 502);
    }
    const data = JSON.parse(text);
    await admin.from("stridee_connections").upsert({
      user_id: user.id, stridee_user_id: data.user_id ?? null, status: "pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    return json({ connect_url: data.connect_url });
  } catch (e) {
    console.error("[stridee-connect]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

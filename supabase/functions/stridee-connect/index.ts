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
      const { data: row } = await adminPub.from("stridee_connections").select("user_id, provider, providers")
        .eq("stridee_user_id", pre.stridee_user_id.slice(0, 100)).in("status", ["pending", "connected"]).maybeSingle();
      if (!row) return json({ ok: false });
      const list = Array.from(new Set([...(row.providers ?? []), row.provider ?? "garmin"]));
      await adminPub.from("stridee_connections")
        .update({ status: "connected", providers: list, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
      return json({ ok: true });
    }
    if (pre?.action === "status_public" && typeof pre.stridee_user_id === "string" && pre.stridee_user_id) {
      // Polled by the in-app sign-in bridge page (no session there).
      const adminPub = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: row } = await adminPub.from("stridee_connections").select("status, provider, providers")
        .eq("stridee_user_id", pre.stridee_user_id.slice(0, 100)).maybeSingle();
      return json({ connected: row?.status === "connected" && (row.providers ?? []).includes(row.provider ?? "garmin") });
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
      const { data: cur } = await admin.from("stridee_connections").select("provider, providers").eq("user_id", user.id).maybeSingle();
      const list = Array.from(new Set([...(cur?.providers ?? []), cur?.provider ?? "garmin"]));
      await admin.from("stridee_connections").upsert({
        user_id: user.id, stridee_user_id: sid, status: "connected", providers: list, auto_sync_enabled: true,
        connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      return json({ ok: true });
    }

    if (action === "disconnect") {
      // Only remove the chosen brand; drop the whole link when none remain.
      const which = typeof body.provider === "string" ? body.provider : null;
      const { data: cur } = await admin.from("stridee_connections").select("provider, providers").eq("user_id", user.id).maybeSingle();
      const list: string[] = cur?.providers?.length ? cur.providers : cur?.provider ? [cur.provider] : [];
      const rest = which ? list.filter((p) => p !== which) : [];
      if (!rest.length) {
        await admin.from("stridee_connections").delete().eq("user_id", user.id);
      } else {
        await admin.from("stridee_connections").update({
          providers: rest, provider: rest.includes(cur?.provider) ? cur!.provider : rest[0], updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
      }
      return json({ ok: true, remaining: rest });
    }

    const { data: existing } = await admin.from("stridee_connections")
      .select("status, provider, providers, stridee_user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const wanted = body?.provider ?? "garmin";
    const linked: string[] = existing?.status === "connected" ? (existing.providers?.length ? existing.providers : [existing.provider ?? "garmin"]) : [];
    if (linked.includes(wanted)) return json({ already_connected: true });
    const { data: adminRole } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRole) {
      // Everyone else: only one fitness source at a time.
      if (linked.length) return json({ error: "Disconnect your current watch first", code: "ONE_PROVIDER" }, 409);
      const [t, st, iv] = await Promise.all([
        admin.from("terra_connections").select("id").eq("user_id", user.id).eq("active", true).limit(1),
        admin.from("strava_connections").select("id").eq("user_id", user.id).limit(1),
        admin.from("intervals_connections").select("id").eq("user_id", user.id).limit(1),
      ]);
      if (t.data?.length || st.data?.length || iv.data?.length)
        return json({ error: "Disconnect your current fitness app first", code: "ONE_PROVIDER" }, 409);
    }

    const ALLOWED = ["garmin", "coros", "polar", "fitbit", "zepp"];
    const provider = ALLOWED.includes(body?.provider) ? body.provider : "garmin";
    const native = body?.native === true;
    // Stridee appends `?status=...&user_id=...` to this value. Keep the native
    // marker in the path so its query string cannot corrupt the deeplink scheme.
    // Return to the connecting site only if it's registered with Stridee; otherwise use runward.site.
    const REGISTERED_SITES = ["https://runward.site", "https://angustest.site"];
    const rawOrigin = typeof body?.origin === "string" ? body.origin.replace(/\/$/, "") : "";
    const site = REGISTERED_SITES.includes(rawOrigin) ? rawOrigin : "https://runward.site";
    const returnUri = native
      ? `${site}/stridee-return/native/${provider}`
      : `${site}/stridee-return/${provider}`;
    const res = await strideeFetch("POST", "/v1/connect", {
      provider,
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
      user_id: user.id, stridee_user_id: data.user_id ?? existing?.stridee_user_id ?? null,
      status: linked.length ? "connected" : "pending", provider, providers: linked, auto_sync_enabled: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    return json({ connect_url: data.connect_url, stridee_user_id: data.user_id ?? null });
  } catch (e) {
    console.error("[stridee-connect]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

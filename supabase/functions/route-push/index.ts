import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { strideeFetch } from "../_shared/stridee.ts";

// Sends a shared route to the caller's own watch as a Course via POST /v1/routes.
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const gpx = typeof body?.gpx === "string" ? body.gpx : "";
    const name = typeof body?.name === "string" ? body.name.slice(0, 80).trim() : "";
    if (gpx.length < 50 || gpx.length > 5_000_000 || !gpx.includes("<trkpt")) return json({ error: "Invalid route file" }, 400);
    const pointCount = (gpx.match(/<trkpt\s/gi) ?? []).length;
    if (pointCount < 2) return json({ error: "invalid_points", point_count: pointCount }, 422);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin.from("stridee_connections").select("stridee_user_id, status, providers, provider")
      .eq("user_id", user.id).maybeSingle();
    const providers: string[] = Array.from(new Set([...(conn?.providers ?? []), conn?.provider].filter(Boolean)));
    if (!conn?.stridee_user_id || conn.status !== "connected" || !providers.includes("garmin")) {
      return json({ error: "no_garmin", message: "Connect a Garmin watch to send routes" }, 409);
    }

    const file = btoa(String.fromCharCode(...new TextEncoder().encode(gpx)));
    const res = await strideeFetch("POST", "/v1/routes", {
      user_id: conn.stridee_user_id, file, name: name || "RunWard route", sport: "running", provider: "garmin",
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[route-push] failed", res.status, text.slice(0, 500));
      return json({ error: "push_failed", status: res.status }, 502);
    }
    const data = JSON.parse(text);
    const push = (data?.pushes ?? [])[0] ?? null;
    return json({ ok: true, status: push?.status ?? null, reason: push?.reason ?? null });
  } catch (e) {
    console.error("[route-push]", e);
    return json({ error: "server_error" }, 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { latLngToCell, cellToLatLng } from "https://esm.sh/h3-js@4.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEX_RES = 8;


function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceKey);

    // Get display name
    const { data: profile } = await admin.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
    const displayName = profile?.display_name ?? "Runner";

    // Already-processed activity ids
    const { data: processed } = await admin
      .from("territory_processed_activities")
      .select("activity_source, activity_id")
      .eq("user_id", user.id);
    const processedSet = new Set((processed ?? []).map((p: any) => `${p.activity_source}:${p.activity_id}`));

    // Pull activities from all sources
    const sources: Array<{ source: string; table: string; idCol: string; polyCol: string }> = [
      { source: "strava", table: "strava_activities", idCol: "strava_id", polyCol: "summary_polyline" },
      { source: "garmin", table: "garmin_activities", idCol: "garmin_activity_id", polyCol: "summary_polyline" },
      { source: "terra", table: "terra_activities", idCol: "terra_activity_id", polyCol: "summary_polyline" },
    ];

    type Act = { source: string; activity_id: string; polyline: string };
    const activities: Act[] = [];
    for (const s of sources) {
      const { data } = await admin.from(s.table).select(`${s.idCol}, ${s.polyCol}`).eq("user_id", user.id).not(s.polyCol, "is", null);
      for (const row of (data ?? []) as any[]) {
        const aid = String(row[s.idCol]);
        const poly = row[s.polyCol] as string | null;
        if (!poly || processedSet.has(`${s.source}:${aid}`)) continue;
        activities.push({ source: s.source, activity_id: aid, polyline: poly });
      }
    }

    let newHexes = 0;
    let stolenHexes = 0;

    for (const act of activities) {
      const coords = decodePolyline(act.polyline);
      if (coords.length === 0) continue;
      const hexSet = new Set<string>();
      for (const [lat, lng] of coords) {
        const cell = latLngToCell(lat, lng, HEX_RES);
        hexSet.add(cell);
      }
      if (hexSet.size === 0) {
        await admin.from("territory_processed_activities").insert({
          user_id: user.id, activity_source: act.source, activity_id: act.activity_id,
        });
        continue;
      }

      const hexIds = Array.from(hexSet);
      const { data: existing } = await admin.from("territory_hexes").select("hex_id, owner_user_id, capture_count").in("hex_id", hexIds);
      const existingMap = new Map<string, { owner_user_id: string; capture_count: number }>();
      for (const e of (existing ?? []) as any[]) existingMap.set(e.hex_id, e);

      const upserts = hexIds.map((hex_id) => {
        const ex = existingMap.get(hex_id);
        if (!ex) newHexes++;
        else if (ex.owner_user_id !== user.id) stolenHexes++;
        const [lat, lng] = cellToLatLng(hex_id);
        return {
          hex_id,
          region: `${lat.toFixed(1)},${lng.toFixed(1)}`,
          owner_user_id: user.id,
          owner_display_name: displayName,
          captured_at: new Date().toISOString(),
          captured_activity_id: act.activity_id,
          capture_count: (ex?.capture_count ?? 0) + 1,
        };
      });

      const chunk = 500;
      let upsertFailed = false;
      for (let i = 0; i < upserts.length; i += chunk) {
        const { error: upErr } = await admin.from("territory_hexes").upsert(upserts.slice(i, i + chunk), { onConflict: "hex_id" });
        if (upErr) { console.error("hex upsert failed", act.activity_id, upErr); upsertFailed = true; break; }
      }
      if (upsertFailed) continue; // do NOT mark processed so it retries next sync
      const captureRows = upserts.map((u) => ({
        hex_id: u.hex_id, user_id: user.id, activity_id: act.activity_id, region: u.region,
      }));
      for (let i = 0; i < captureRows.length; i += chunk) {
        const { error: capErr } = await admin.from("territory_captures").insert(captureRows.slice(i, i + chunk));
        if (capErr) console.error("capture insert failed", act.activity_id, capErr);
      }
      await admin.from("territory_processed_activities").insert({
        user_id: user.id, activity_source: act.source, activity_id: act.activity_id,
      });
    }

    const { count: totalOwned } = await admin
      .from("territory_hexes")
      .select("hex_id", { count: "exact", head: true })
      .eq("owner_user_id", user.id);

    return new Response(
      JSON.stringify({
        processedActivities: activities.length,
        newHexes,
        stolenHexes,
        totalOwned: totalOwned ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("process-territory error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

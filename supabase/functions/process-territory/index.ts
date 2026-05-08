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

    // Backfill city_slug for any hexes the user has captured that are still untagged
    const { data: myCapHexes } = await admin
      .from("territory_captures")
      .select("hex_id")
      .eq("user_id", user.id);
    const myHexIds = Array.from(new Set((myCapHexes ?? []).map((r: any) => r.hex_id as string)));
    const { data: untagged } = myHexIds.length > 0
      ? await admin.from("territory_hexes").select("hex_id").in("hex_id", myHexIds).is("city_slug", null)
      : { data: [] as any[] };
    const untaggedIds = (untagged ?? []).map((r: any) => r.hex_id as string);
    if (untaggedIds.length > 0) {
      const { data: alreadyMapped } = await admin
        .from("territory_city_hexes").select("hex_id, city_slug").in("hex_id", untaggedIds);
      const cityByHex = new Map<string, string>();
      for (const m of (alreadyMapped ?? []) as any[]) cityByHex.set(m.hex_id, m.city_slug);
      const stillUnmapped = untaggedIds.filter((h) => !cityByHex.has(h));
      const seenGrid = new Set<string>();
      for (const hex_id of stillUnmapped) {
        const [lat, lng] = cellToLatLng(hex_id);
        const gridKey = `${lat.toFixed(1)},${lng.toFixed(1)}`;
        if (seenGrid.has(gridKey)) continue;
        seenGrid.add(gridKey);
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/resolve-city`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
            body: JSON.stringify({ hex_id }),
          });
          if (resp.ok) await resp.json(); else console.error("backfill resolve-city status", resp.status);
        } catch (e) { console.error("backfill resolve-city err", e); }
        await new Promise((r) => setTimeout(r, 1100));
      }
      const { data: refreshed } = await admin
        .from("territory_city_hexes").select("hex_id, city_slug").in("hex_id", untaggedIds);
      const updates = new Map<string, string[]>();
      for (const m of (refreshed ?? []) as any[]) {
        const arr = updates.get(m.city_slug) ?? [];
        arr.push(m.hex_id);
        updates.set(m.city_slug, arr);
      }
      for (const [slug, ids] of updates) {
        await admin.from("territory_hexes").update({ city_slug: slug }).in("hex_id", ids);
      }
    }

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

      // Find which of these hexes the current user has already captured before
      const { data: myCaps } = await admin
        .from("territory_captures")
        .select("hex_id")
        .eq("user_id", user.id)
        .in("hex_id", hexIds);
      const myCapsSet = new Set((myCaps ?? []).map((r: any) => r.hex_id as string));

      // Look up city_slug for each hex
      const { data: cityMappings } = await admin.from("territory_city_hexes").select("hex_id, city_slug").in("hex_id", hexIds);
      const cityMap = new Map<string, string>();
      for (const m of (cityMappings ?? []) as any[]) cityMap.set(m.hex_id, m.city_slug);

      // For unmapped hexes, call resolve-city (rate-limited, dedupe by ~10km grid)
      const unmapped = hexIds.filter((h) => !cityMap.has(h));
      const seenGrid = new Set<string>();
      for (const hex_id of unmapped) {
        const [lat, lng] = cellToLatLng(hex_id);
        const gridKey = `${lat.toFixed(1)},${lng.toFixed(1)}`;
        if (seenGrid.has(gridKey)) continue;
        seenGrid.add(gridKey);
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/resolve-city`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
            body: JSON.stringify({ hex_id }),
          });
          if (resp.ok) {
            const body = await resp.json();
            if (body?.slug) {
              // Re-fetch mapping for all our hex ids — polygon insert may have covered many
              const { data: refreshed } = await admin.from("territory_city_hexes").select("hex_id, city_slug").in("hex_id", hexIds);
              for (const m of (refreshed ?? []) as any[]) cityMap.set(m.hex_id, m.city_slug);
            }
          }
        } catch (e) {
          console.error("resolve-city call failed", e);
        }
        await new Promise((r) => setTimeout(r, 1100));
      }

      // New hexes (no record yet) → insert with this user as first owner
      const newHexRows: any[] = [];
      // Existing hexes where this user is a NEW contributor → bump capture_count
      const newContributorHexIds: string[] = [];
      // All hexes the user hasn't captured before → insert capture row
      const captureRows: any[] = [];

      for (const hex_id of hexIds) {
        const ex = existingMap.get(hex_id);
        const userIsNewToHex = !myCapsSet.has(hex_id);
        const [lat, lng] = cellToLatLng(hex_id);
        const region = `${lat.toFixed(1)},${lng.toFixed(1)}`;

        if (!ex) {
          newHexes++;
          newHexRows.push({
            hex_id,
            region,
            city_slug: cityMap.get(hex_id) ?? null,
            owner_user_id: user.id,
            owner_display_name: displayName,
            captured_at: new Date().toISOString(),
            captured_activity_id: act.activity_id,
            capture_count: 1,
          });
        } else if (userIsNewToHex) {
          stolenHexes++; // repurposed: "newly claimed by this user (shared)"
          newContributorHexIds.push(hex_id);
        }

        if (userIsNewToHex) {
          captureRows.push({ hex_id, user_id: user.id, activity_id: act.activity_id, region });
        }
      }

      const chunk = 500;
      let writeFailed = false;

      // Insert brand-new hexes
      for (let i = 0; i < newHexRows.length; i += chunk) {
        const { error } = await admin.from("territory_hexes").insert(newHexRows.slice(i, i + chunk));
        if (error) { console.error("hex insert failed", act.activity_id, error); writeFailed = true; break; }
      }
      if (writeFailed) continue;

      // Bump capture_count on existing hexes where the user is a new contributor
      for (const hex_id of newContributorHexIds) {
        const ex = existingMap.get(hex_id)!;
        const { error } = await admin
          .from("territory_hexes")
          .update({
            capture_count: (ex.capture_count ?? 0) + 1,
            owner_user_id: user.id,
            owner_display_name: displayName,
            captured_at: new Date().toISOString(),
            captured_activity_id: act.activity_id,
          })
          .eq("hex_id", hex_id);
        if (error) console.error("hex count bump failed", hex_id, error);
      }

      // Insert capture rows (only for new user/hex pairs)
      for (let i = 0; i < captureRows.length; i += chunk) {
        const { error: capErr } = await admin.from("territory_captures").insert(captureRows.slice(i, i + chunk));
        if (capErr) console.error("capture insert failed", act.activity_id, capErr);
      }

      // Insert capture rows (only for new user/hex pairs)
      // (already done above in lines 245-249) — now check landmark hits
      const { data: hitLandmarks } = await admin
        .from("territory_landmarks")
        .select("hex_id")
        .in("hex_id", hexIds);
      const landmarkRows = (hitLandmarks ?? [])
        .filter((l: any) => myCapsSet.has(l.hex_id) === false)
        .map((l: any) => ({
          user_id: user.id,
          hex_id: l.hex_id,
          activity_id: act.activity_id,
        }));
      if (landmarkRows.length > 0) {
        const { error: lErr } = await admin
          .from("territory_landmark_captures")
          .upsert(landmarkRows, { onConflict: "user_id,hex_id", ignoreDuplicates: true });
        if (lErr) console.error("landmark capture insert failed", lErr);
      }

      await admin.from("territory_processed_activities").insert({
        user_id: user.id, activity_source: act.source, activity_id: act.activity_id,
      });
    }

    // Total hexes the user has captured (across all owners)
    const { count: totalOwned } = await admin
      .from("territory_captures")
      .select("hex_id", { count: "exact", head: true })
      .eq("user_id", user.id);

    return new Response(
      JSON.stringify({
        processedActivities: activities.length,
        newZones: newHexes,
        stolenZones: stolenHexes,
        totalOwned: totalOwned ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("process-territory error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

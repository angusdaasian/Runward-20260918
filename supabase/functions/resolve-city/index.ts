import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cellToLatLng, polygonToCells } from "https://esm.sh/h3-js@4.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEX_RES = 8;
const UA = "lovable-territory/1.0 (territory feature)";

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function nominatim(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://nominatim.openstreetmap.org${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!res.ok) throw new Error(`nominatim ${path} ${res.status}`);
  return await res.json();
}

// Compute hex coverage of a (Multi)Polygon GeoJSON
function polyfillGeoJSON(geom: any): string[] {
  const cells = new Set<string>();
  if (!geom) return [];
  const polygons: number[][][][] = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  for (const poly of polygons) {
    // GeoJSON is [lng, lat]; h3-js wants [lat, lng]
    const rings = poly.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]));
    try {
      const got = polygonToCells(rings, HEX_RES);
      for (const c of got) cells.add(c);
    } catch (e) {
      console.error("polygonToCells failed", e);
    }
  }
  return Array.from(cells);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { hex_id } = await req.json();
    if (!hex_id || typeof hex_id !== "string") {
      return new Response(JSON.stringify({ error: "hex_id required" }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Already mapped?
    const { data: existing } = await admin.from("territory_city_hexes").select("city_slug").eq("hex_id", hex_id).maybeSingle();
    if (existing?.city_slug) {
      return new Response(JSON.stringify({ slug: existing.city_slug, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [lat, lng] = cellToLatLng(hex_id);

    // Reverse geocode
    const rev = await nominatim("/reverse", {
      lat: String(lat), lon: String(lng), zoom: "10", format: "json", "accept-language": "en",
    });
    const addr = rev?.address ?? {};
    const cityName: string | undefined = addr.city || addr.town || addr.municipality || addr.village || addr.county;
    const country: string = (addr.country_code || "").toUpperCase();
    if (!cityName) {
      return new Response(JSON.stringify({ slug: null, reason: "no_city" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const slug = `${slugify(cityName)}-${country.toLowerCase() || "xx"}`;

    // City already in DB?
    const { data: cityRow } = await admin.from("territory_cities").select("slug").eq("slug", slug).maybeSingle();
    if (!cityRow) {
      // Fetch polygon
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim rate limit
      const search = await nominatim("/search", {
        q: `${cityName}, ${addr.country ?? country}`,
        format: "json", polygon_geojson: "1", limit: "1", "accept-language": "en",
      });
      const top = Array.isArray(search) ? search[0] : null;
      if (!top?.geojson || !top?.boundingbox) {
        return new Response(JSON.stringify({ slug: null, reason: "no_polygon", cityName }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const bb = top.boundingbox.map(parseFloat); // [minLat, maxLat, minLng, maxLng]
      const bbox: [number, number, number, number] = [bb[0], bb[2], bb[1], bb[3]];
      const cells = polyfillGeoJSON(top.geojson);
      const center_lat = (bb[0] + bb[1]) / 2;
      const center_lng = (bb[2] + bb[3]) / 2;

      const { error: insErr } = await admin.from("territory_cities").insert({
        slug, display_name: cityName, country, admin1: addr.state ?? addr.province ?? null,
        bbox, center_lat, center_lng, total_hex_count: cells.length,
        polygon_filled_at: new Date().toISOString(),
      });
      if (insErr) throw insErr;

      // Bulk insert hex membership in chunks
      const chunk = 1000;
      for (let i = 0; i < cells.length; i += chunk) {
        const rows = cells.slice(i, i + chunk).map((c) => ({ hex_id: c, city_slug: slug }));
        await admin.from("territory_city_hexes").upsert(rows, { onConflict: "hex_id" });
      }
    } else {
      // Just map this single hex (might be outside polygon — still claim it for the city)
      await admin.from("territory_city_hexes").upsert({ hex_id, city_slug: slug }, { onConflict: "hex_id" });
    }

    return new Response(JSON.stringify({ slug }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("resolve-city error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

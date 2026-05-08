// Auto-generates landmark hexes from OpenStreetMap via Overpass API.
// POST { bbox: [south, west, north, east], category?: "all"|"peak"|"viewpoint"|"attraction" }
// Only items tagged with `wikidata` are kept (proxy for "famous").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { latLngToCell } from "https://esm.sh/h3-js@4.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEX_RES = 8;

const ICONS: Record<string, string> = {
  peak: "🏔️",
  volcano: "🌋",
  viewpoint: "👁️",
  attraction: "📍",
  monument: "🗿",
  memorial: "🕯️",
  castle: "🏰",
  ruins: "🏛️",
  stadium: "🏟️",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const bbox = body.bbox as [number, number, number, number] | undefined;
    if (!bbox || bbox.length !== 4) {
      return new Response(JSON.stringify({ error: "bbox [south,west,north,east] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const [s, w, n, e] = bbox;

    // Overpass: famous nodes/ways with wikidata or wikipedia tag
    const q = `
[out:json][timeout:60];
(
  node["natural"="peak"]["wikidata"](${s},${w},${n},${e});
  node["natural"="volcano"]["wikidata"](${s},${w},${n},${e});
  node["tourism"="viewpoint"]["wikidata"](${s},${w},${n},${e});
  node["tourism"="attraction"]["wikidata"](${s},${w},${n},${e});
  node["historic"~"monument|memorial|castle|ruins"]["wikidata"](${s},${w},${n},${e});
  node["leisure"="stadium"]["wikidata"](${s},${w},${n},${e});
);
out tags center;`;

    const overpass = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: q,
    });
    if (!overpass.ok) {
      return new Response(JSON.stringify({ error: "overpass failed", status: overpass.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await overpass.json();
    const elements: any[] = json?.elements ?? [];

    const seen = new Set<string>();
    const rows: any[] = [];
    for (const el of elements) {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      const tags = el.tags ?? {};
      const name = tags.name ?? tags["name:en"];
      if (!lat || !lng || !name) continue;
      const hex_id = latLngToCell(lat, lng, HEX_RES);
      if (seen.has(hex_id)) continue;
      seen.add(hex_id);
      const category = tags.natural === "peak" ? "peak"
        : tags.natural === "volcano" ? "volcano"
        : tags.tourism === "viewpoint" ? "viewpoint"
        : tags.leisure === "stadium" ? "stadium"
        : tags.historic ? tags.historic
        : "attraction";
      rows.push({
        hex_id,
        name,
        name_zh: tags["name:zh"] ?? tags["name:zh-Hant"] ?? null,
        category,
        icon: ICONS[category] ?? "📍",
        lat,
        lng,
        country: tags["addr:country"] ?? null,
        osm_id: el.id,
        osm_type: el.type,
      });
    }

    let inserted = 0;
    const chunk = 500;
    for (let i = 0; i < rows.length; i += chunk) {
      const { error, count } = await admin
        .from("territory_landmarks")
        .upsert(rows.slice(i, i + chunk), { onConflict: "hex_id", ignoreDuplicates: true, count: "exact" });
      if (error) console.error("landmark upsert", error);
      inserted += count ?? 0;
    }

    return new Response(
      JSON.stringify({ found: rows.length, inserted, bbox }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("seed-landmarks error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

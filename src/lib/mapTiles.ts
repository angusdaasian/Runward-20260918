// Shared Mapbox basemap helpers.
// The public token (pk.*) is stored as a secret and served by the
// get-mapbox-token edge function so it can be rotated without a redeploy.
import { supabase } from "@/integrations/supabase/client";

let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;

export async function getMapboxToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.functions.invoke("get-mapbox-token");
    if (error || !data?.token) throw new Error("Mapbox token unavailable");
    cachedToken = data.token as string;
    return cachedToken;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export const MAPBOX_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Raster tile URL template for Leaflet (512px tiles, retina). */
export function mapboxRasterTemplate(token: string, styleId = "light-v11") {
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`;
}

/** Single raster tile URL for canvas rendering (256px world grid, retina image). */
export function mapboxTileUrl(
  token: string,
  z: number,
  x: number,
  y: number,
  styleId = "light-v11",
) {
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/${z}/${x}/${y}@2x?access_token=${token}`;
}

/** OpenStreetMap fallback used if the Mapbox token can't be loaded. */
export const OSM_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";

/**
 * Adds a Mapbox basemap to a Leaflet map, falling back to OSM tiles when the
 * token is unavailable. Safe to call without awaiting.
 */
export async function addMapboxBasemap(
  map: { addLayer: (l: unknown) => unknown },
  L: typeof import("leaflet"),
  styleId = "light-v11",
) {
  try {
    const token = await getMapboxToken();
    L.tileLayer(mapboxRasterTemplate(token, styleId), {
      maxZoom: 19,
      tileSize: 512,
      zoomOffset: -1,
      attribution: MAPBOX_ATTRIBUTION,
    }).addTo(map as never);
  } catch {
    L.tileLayer(OSM_TEMPLATE, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map as never);
  }
}

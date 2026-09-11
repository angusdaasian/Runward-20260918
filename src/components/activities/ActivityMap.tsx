import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Maximize2, X } from "lucide-react";
import { getMapboxToken, mapboxLanguage } from "@/lib/mapTiles";
import type { Lang } from "@/lib/i18n";

// Decode Google polyline encoding
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function addRoute(map: mapboxgl.Map, coords: [number, number][], padding: number) {
  const route = coords.map(([lat, lng]) => [lng, lat]);
  map.addSource("activity-route", {
    type: "geojson",
    data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } },
  });
  map.addLayer({
    id: "activity-route-outline",
    type: "line",
    source: "activity-route",
    paint: { "line-color": "#FFFFFF", "line-width": 7, "line-opacity": 0.95 },
    layout: { "line-join": "round", "line-cap": "round" },
  });
  map.addLayer({
    id: "activity-route-line",
    type: "line",
    source: "activity-route",
    paint: { "line-color": "#FC4C02", "line-width": 4 },
    layout: { "line-join": "round", "line-cap": "round" },
  });

  const endpoints = [
    { coordinates: route[0], color: "#10B981" },
    { coordinates: route[route.length - 1], color: "#FC4C02" },
  ];
  map.addSource("activity-endpoints", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: endpoints.map(({ coordinates, color }) => ({
        type: "Feature",
        properties: { color },
        geometry: { type: "Point", coordinates },
      })),
    },
  });
  map.addLayer({
    id: "activity-endpoints",
    type: "circle",
    source: "activity-endpoints",
    paint: {
      "circle-radius": 5,
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 2,
    },
  });

  const bounds = new mapboxgl.LngLatBounds();
  route.forEach(([lng, lat]) => bounds.extend([lng, lat]));
  map.fitBounds(bounds, { padding, duration: 0 });
}

async function createRouteMap(
  container: HTMLDivElement,
  coords: [number, number][],
  lang: Lang,
  interactive: boolean,
  padding: number,
): Promise<mapboxgl.Map> {
  mapboxgl.accessToken = await getMapboxToken();
  const [firstLat, firstLng] = coords[0];
  const map = new mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/outdoors-v12",
    language: mapboxLanguage(lang),
    center: [firstLng, firstLat],
    zoom: 12,
    interactive,
    attributionControl: interactive,
  });
  await new Promise<void>((resolve, reject) => {
    map.once("load", () => resolve());
    map.once("error", (event) => reject(event.error ?? new Error("Map failed to load")));
  });
  map.setLanguage(mapboxLanguage(lang));
  addRoute(map, coords, padding);
  return map;
}

// Build a Mapbox Static Images URL for the preview — one lightweight PNG
// instead of a full WebGL map per activity row.
async function buildStaticUrl(polyline: string, lang: Lang): Promise<string | null> {
  const coords = decodePolyline(polyline);
  if (coords.length === 0) return null;
  const token = await getMapboxToken();
  const [startLat, startLng] = coords[0];
  const [endLat, endLng] = coords[coords.length - 1];
  const path = `path-5+FC4C02-0.9(${encodeURIComponent(polyline)})`;
  const pins = `pin-s-a+10B981(${startLng},${startLat}),pin-s-b+FC4C02(${endLng},${endLat})`;
  const overlay = `${path},${pins}`;
  const language = encodeURIComponent(mapboxLanguage(lang));
  return `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${overlay}/auto/640x320@2x?access_token=${encodeURIComponent(token)}&language=${language}&attribution=false&logo=false`;
}

interface Props {
  polyline: string;
  className?: string;
  lang: Lang;
}

const ActivityMap = ({ polyline, className, lang }: Props) => {
  const fullRef = useRef<HTMLDivElement>(null);
  const fullMapRef = useRef<mapboxgl.Map | null>(null);
  const [open, setOpen] = useState(false);
  const [staticUrl, setStaticUrl] = useState<string | null>(null);

  // Lightweight static preview image
  useEffect(() => {
    if (!polyline) return;
    let cancelled = false;
    void buildStaticUrl(polyline, lang)
      .then((url) => { if (!cancelled) setStaticUrl(url); })
      .catch((error) => console.error("Activity map preview failed to load", error));
    return () => { cancelled = true; };
  }, [polyline, lang]);

  // Fullscreen interactive map (mounted only when overlay opens)
  useEffect(() => {
    if (!open || !fullRef.current || !polyline) return;

    const coords = decodePolyline(polyline);
    if (coords.length === 0) return;

    let frame = 0;
    let cancelled = false;

    const mountMap = () => {
      const container = fullRef.current;
      if (!container) return;

      if (container.clientWidth === 0 || container.clientHeight === 0) {
        frame = requestAnimationFrame(mountMap);
        return;
      }

      if (fullMapRef.current) {
        fullMapRef.current.remove();
        fullMapRef.current = null;
      }

      void createRouteMap(container, coords, lang, true, 30)
        .then((map) => {
          if (cancelled) {
            map.remove();
            return;
          }
          fullMapRef.current = map;
          map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
          requestAnimationFrame(() => map.resize());
        })
        .catch((error) => console.error("Expanded activity map failed to load", error));
    };

    frame = requestAnimationFrame(mountMap);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (fullMapRef.current) {
        fullMapRef.current.remove();
        fullMapRef.current = null;
      }
    };
  }, [open, polyline, lang]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Expand map"
        className="relative w-full mt-2 group cursor-pointer"
      >
        <div className={`w-full rounded-lg overflow-hidden bg-muted ${className || "h-32"}`}>
          {staticUrl && (
            <img
              src={staticUrl}
              alt="Route map"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-md p-1.5 shadow-md opacity-80 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="w-3.5 h-3.5 text-foreground" />
        </div>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 bg-background">
          <div
            ref={fullRef}
            className="h-[100dvh] w-screen"
            style={{ zIndex: 0 }}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close expanded map"
            className="absolute right-4 top-4 z-[1000] rounded-full border border-border bg-background/90 p-2 shadow-lg backdrop-blur-sm"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
};

export default ActivityMap;

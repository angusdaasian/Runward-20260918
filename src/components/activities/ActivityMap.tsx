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

interface Props {
  polyline: string;
  className?: string;
  lang: Lang;
}

// Browsers allow only a limited number of live WebGL contexts (~8-16). Long
// activity lists would silently blank out older maps, so keep a small pool of
// live preview maps and release the least-recently-used ones.
const MAX_LIVE_PREVIEWS = 6;
const livePreviews: Array<() => void> = [];

function registerPreview(release: () => void) {
  livePreviews.push(release);
  while (livePreviews.length > MAX_LIVE_PREVIEWS) {
    const oldest = livePreviews.shift();
    oldest?.();
  }
}

function unregisterPreview(release: () => void) {
  const index = livePreviews.indexOf(release);
  if (index >= 0) livePreviews.splice(index, 1);
}

const ActivityMap = ({ polyline, className, lang }: Props) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const previewMapRef = useRef<mapboxgl.Map | null>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const fullMapRef = useRef<mapboxgl.Map | null>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  // Only build the preview map while it's near the viewport
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "300px 0px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Preview map
  useEffect(() => {
    if (!previewRef.current || !polyline || !visible) return;

    if (previewMapRef.current) {
      previewMapRef.current.remove();
      previewMapRef.current = null;
    }

    const coords = decodePolyline(polyline);
    if (coords.length === 0) return;

    let cancelled = false;
    const container = previewRef.current;
    const release = () => {
      if (previewMapRef.current) {
        previewMapRef.current.remove();
        previewMapRef.current = null;
      }
      setVisible(false);
    };

    void createRouteMap(container, coords, lang, false, 14)
      .then((map) => {
        if (cancelled) {
          map.remove();
          return;
        }
        previewMapRef.current = map;
        registerPreview(release);
      })
      .catch((error) => console.error("Activity map failed to load", error));

    return () => {
      cancelled = true;
      unregisterPreview(release);
      if (previewMapRef.current) {
        previewMapRef.current.remove();
        previewMapRef.current = null;
      }
    };
  }, [polyline, lang, visible]);

  // Fullscreen map (mounted only when overlay opens)
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
        <div
          ref={previewRef}
          className={`w-full rounded-lg overflow-hidden ${className || "h-32"}`}
          style={{ zIndex: 0 }}
        />
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

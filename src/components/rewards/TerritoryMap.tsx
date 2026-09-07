import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapboxToken, mapboxLanguage } from "@/lib/mapTiles";
import { cellToBoundary, cellToLatLng } from "h3-js";
import { supabase } from "@/integrations/supabase/client";
import type { Lang } from "@/lib/i18n";

interface Hex {
  hex_id: string;
  owner_user_id: string;
  owner_display_name: string | null;
  captured_at: string;
  capture_count: number;
  city_slug?: string | null;
  iOwn?: boolean;
}

interface FocusCity {
  slug: string;
  bbox: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
}

interface Props {
  hexes: Hex[];
  currentUserId: string | null;
  focusCity?: FocusCity | null;
  lang: Lang;
}

interface Landmark {
  hex_id: string;
  name: string;
  name_zh: string | null;
  icon: string | null;
  category: string;
}

const TerritoryMap = ({ hexes, currentUserId, focusCity, lang }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const landmarkMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const fittedRef = useRef(false);
  const landmarksRef = useRef<Landmark[]>([]);
  const myLandmarkSetRef = useRef<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    const container = containerRef.current;
    void getMapboxToken().then((token) => {
      if (cancelled) return;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/outdoors-v12",
        language: mapboxLanguage(lang),
        center: [0, 20],
        zoom: 2,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl(), "top-left");
      map.once("load", () => {
        if (cancelled) return;
        map.setLanguage(mapboxLanguage(lang));
        setMapReady(true);
      });
    }).catch((error) => console.error("Territory map failed to load", error));

    return () => {
      cancelled = true;
      landmarkMarkersRef.current.forEach((marker) => marker.remove());
      landmarkMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setMapReady(false);
    };
  }, [lang]);

  const drawLandmarks = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    landmarkMarkersRef.current.forEach((marker) => marker.remove());
    landmarkMarkersRef.current = landmarksRef.current.map((lm) => {
      const owned = myLandmarkSetRef.current.has(lm.hex_id);
      const [lat, lng] = cellToLatLng(lm.hex_id);
      const el = document.createElement("div");
      el.className = `flex h-8 w-8 items-center justify-center rounded-full border-2 text-base shadow-md ${owned ? "border-amber-500 bg-amber-400" : "border-foreground/40 bg-foreground/60 grayscale opacity-85"}`;
      el.textContent = lm.icon ?? "📍";
      const title = lang === "zh" && lm.name_zh ? lm.name_zh : lm.name;
      const status = owned
        ? (lang === "zh" ? "✓ 已佔領" : "✓ Captured")
        : (lang === "zh" ? "🔒 尚未解鎖 — 跑經此處即可佔領" : "🔒 Locked — run here to claim");
      const popup = new mapboxgl.Popup({ offset: 18 }).setHTML(
        `<div style="font-size:12px;text-align:center"><div style="font-size:22px">${lm.icon ?? "📍"}</div><strong>${title}</strong><br/><span>${status}</span></div>`,
      );
      return new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).setPopup(popup).addTo(map);
    });
  }, [lang, mapReady]);

  // Load landmarks once and the user's captured landmark set
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [lmRes, capRes] = await Promise.all([
        supabase.from("territory_landmarks").select("hex_id, name, name_zh, icon, category"),
        currentUserId
          ? supabase.from("territory_landmark_captures").select("hex_id").eq("user_id", currentUserId)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;
      landmarksRef.current = (lmRes.data ?? []) as Landmark[];
      myLandmarkSetRef.current = new Set(((capRes.data ?? []) as any[]).map((r) => r.hex_id as string));
      drawLandmarks();
    })();
    return () => { cancelled = true; };
  }, [currentUserId, drawLandmarks]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ownAccent = "#FC4C02";
    const otherColor = "#94a3b8";

    const allBounds: [number, number][] = [];
    const myBounds: [number, number][] = [];
    const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    for (const hex of hexes) {
      const isMine = hex.iOwn ?? (hex.owner_user_id === currentUserId);
      const dimmed = focusCity ? hex.city_slug !== focusCity.slug : false;
      const boundary = cellToBoundary(hex.hex_id) as [number, number][];
      boundary.forEach((p) => {
        allBounds.push([p[1], p[0]]);
        if (isMine) myBounds.push([p[1], p[0]]);
      });
      const date = new Date(hex.captured_at).toLocaleDateString();
      const coordinates = boundary.map(([lat, lng]) => [lng, lat]);
      coordinates.push(coordinates[0]);
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coordinates] },
        properties: {
          color: isMine ? ownAccent : otherColor,
          fillOpacity: dimmed ? 0.08 : isMine ? 0.45 : 0.25,
          lineOpacity: dimmed ? 0.2 : 1,
          popup: lang === "zh"
            ? `<strong>最新由 ${hex.owner_display_name ?? "跑者"} 佔領</strong><br/>日期：${date}<br/>共有 ${hex.capture_count} 位跑者擁有`
            : `<strong>Latest claim by ${hex.owner_display_name ?? "Runner"}</strong><br/>on ${date}<br/>Owned by ${hex.capture_count} runner${hex.capture_count === 1 ? "" : "s"}`,
        },
      });
    }

    const data: GeoJSON.FeatureCollection<GeoJSON.Polygon> = { type: "FeatureCollection", features };
    const existing = map.getSource("territory-hexes") as mapboxgl.GeoJSONSource | undefined;
    if (existing) existing.setData(data);
    else {
      map.addSource("territory-hexes", { type: "geojson", data });
      map.addLayer({ id: "territory-fill", type: "fill", source: "territory-hexes", paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "fillOpacity"] } });
      map.addLayer({ id: "territory-line", type: "line", source: "territory-hexes", paint: { "line-color": ["get", "color"], "line-width": 1, "line-opacity": ["get", "lineOpacity"] } });
      map.on("click", "territory-fill", (event) => {
        const feature = event.features?.[0];
        const popup = feature?.properties?.popup;
        if (popup) new mapboxgl.Popup().setLngLat(event.lngLat).setHTML(String(popup)).addTo(map);
      });
      map.on("mouseenter", "territory-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "territory-fill", () => { map.getCanvas().style.cursor = ""; });
    }

    if (focusCity) {
      const [minLat, minLng, maxLat, maxLng] = focusCity.bbox;
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 30 });
    } else if (!fittedRef.current && hexes.length > 0) {
      const target = myBounds.length > 0 ? myBounds : allBounds;
      if (target.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        target.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, { padding: 30, maxZoom: 13 });
        fittedRef.current = true;
      }
    }
  }, [hexes, currentUserId, focusCity, lang, mapReady]);

  // Refresh user's landmark captures whenever hexes update (post-sync)
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("territory_landmark_captures")
        .select("hex_id")
        .eq("user_id", currentUserId);
      if (cancelled) return;
      myLandmarkSetRef.current = new Set((data ?? []).map((r: any) => r.hex_id as string));
      drawLandmarks();
    })();
    return () => { cancelled = true; };
  }, [hexes.length, currentUserId, drawLandmarks]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[60vh] rounded-lg overflow-hidden border border-border"
      style={{ zIndex: 0 }}
    />
  );
};

export default TerritoryMap;

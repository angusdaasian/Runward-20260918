import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellToBoundary, cellToLatLng } from "h3-js";
import { supabase } from "@/integrations/supabase/client";

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
}

interface Landmark {
  hex_id: string;
  name: string;
  name_zh: string | null;
  icon: string | null;
  category: string;
}

const TerritoryMap = ({ hexes, currentUserId, focusCity }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const landmarkLayerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const landmarksRef = useRef<Landmark[]>([]);
  const myLandmarkSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: true,
    }).setView([20, 0], 2);
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { maxZoom: 19, subdomains: "abcd" },
    ).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    landmarkLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      landmarkLayerRef.current = null;
      fittedRef.current = false;
    };
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const drawLandmarks = () => {
    if (!landmarkLayerRef.current) return;
    landmarkLayerRef.current.clearLayers();
    for (const lm of landmarksRef.current) {
      const owned = myLandmarkSetRef.current.has(lm.hex_id);
      const [lat, lng] = cellToLatLng(lm.hex_id);
      const html = `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:${owned ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "rgba(20,20,20,0.55)"};border:2px solid ${owned ? "#f59e0b" : "rgba(255,255,255,0.4)"};box-shadow:0 2px 6px rgba(0,0,0,0.35);font-size:16px;${owned ? "" : "filter:grayscale(0.7);opacity:0.85;"}">${lm.icon ?? "📍"}</div>`;
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({ html, className: "", iconSize: [32, 32], iconAnchor: [16, 16] }),
      });
      marker.bindPopup(
        `<div style="font-size:12px;text-align:center"><div style="font-size:22px">${lm.icon ?? "📍"}</div><strong>${lm.name}</strong>${lm.name_zh ? `<br/><span style="color:#666">${lm.name_zh}</span>` : ""}<br/><span style="color:${owned ? "#f59e0b" : "#888"}">${owned ? "✓ Captured" : "🔒 Locked — run here to claim"}</span></div>`,
      );
      marker.addTo(landmarkLayerRef.current);
    }
  };

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const ownAccent = "#FC4C02";
    const otherColor = "#94a3b8";

    const allBounds: L.LatLngTuple[] = [];
    const myBounds: L.LatLngTuple[] = [];

    for (const hex of hexes) {
      const isMine = hex.iOwn ?? (hex.owner_user_id === currentUserId);
      const dimmed = focusCity ? hex.city_slug !== focusCity.slug : false;
      const boundary = cellToBoundary(hex.hex_id) as [number, number][];
      boundary.forEach((p) => {
        allBounds.push(p);
        if (isMine) myBounds.push(p);
      });
      const polygon = L.polygon(boundary, {
        color: isMine ? ownAccent : otherColor,
        weight: 1,
        fillColor: isMine ? ownAccent : otherColor,
        fillOpacity: dimmed ? 0.08 : isMine ? 0.45 : 0.25,
        opacity: dimmed ? 0.2 : 1,
      });
      const date = new Date(hex.captured_at).toLocaleDateString();
      polygon.bindPopup(
        `<div style="font-size:12px"><strong>Latest claim by ${hex.owner_display_name ?? "Runner"}</strong><br/>on ${date}<br/>Owned by ${hex.capture_count} runner${hex.capture_count === 1 ? "" : "s"}</div>`,
      );
      polygon.addTo(layerRef.current);
    }

    if (focusCity) {
      const [minLat, minLng, maxLat, maxLng] = focusCity.bbox;
      mapRef.current.fitBounds(
        L.latLngBounds([minLat, minLng], [maxLat, maxLng]),
        { padding: [30, 30] },
      );
    } else if (!fittedRef.current && hexes.length > 0) {
      const target = myBounds.length > 0 ? myBounds : allBounds;
      if (target.length > 0) {
        mapRef.current.fitBounds(L.latLngBounds(target), { padding: [30, 30], maxZoom: 13 });
        fittedRef.current = true;
      }
    }
  }, [hexes, currentUserId, focusCity]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hexes.length, currentUserId]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[60vh] rounded-lg overflow-hidden border border-border"
      style={{ zIndex: 0 }}
    />
  );
};

export default TerritoryMap;

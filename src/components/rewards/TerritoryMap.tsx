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

const TerritoryMap = ({ hexes, currentUserId, focusCity }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);

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

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fittedRef.current = false;
    };
  }, []);

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

  return (
    <div
      ref={containerRef}
      className="w-full h-[60vh] rounded-lg overflow-hidden border border-border"
      style={{ zIndex: 0 }}
    />
  );
};

export default TerritoryMap;

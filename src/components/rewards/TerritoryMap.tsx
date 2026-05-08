import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellToBoundary } from "h3-js";
import { REGION_BOUNDS, type Region } from "@/lib/territory";

interface Hex {
  hex_id: string;
  owner_user_id: string;
  owner_display_name: string | null;
  captured_at: string;
  capture_count: number;
}

interface Props {
  region: Region;
  hexes: Hex[];
  currentUserId: string | null;
}

const TerritoryMap = ({ region, hexes, currentUserId }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Init / re-init when region changes
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    const b = REGION_BOUNDS[region];
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(b.center, b.zoom);
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { maxZoom: 19, subdomains: "abcd" },
    ).addTo(map);
    map.fitBounds([[b.south, b.west], [b.north, b.east]]);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [region]);

  // Render hex polygons
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const ownAccent = "#FC4C02";
    const otherColor = "#94a3b8";

    for (const hex of hexes) {
      const isMine = hex.owner_user_id === currentUserId;
      const boundary = cellToBoundary(hex.hex_id) as [number, number][];
      const polygon = L.polygon(boundary, {
        color: isMine ? ownAccent : otherColor,
        weight: 1,
        fillColor: isMine ? ownAccent : otherColor,
        fillOpacity: isMine ? 0.45 : 0.25,
      });
      const date = new Date(hex.captured_at).toLocaleDateString();
      polygon.bindPopup(
        `<div style="font-size:12px"><strong>${hex.owner_display_name ?? "Runner"}</strong><br/>Captured ${date}<br/>Total claims: ${hex.capture_count}</div>`,
      );
      polygon.addTo(layerRef.current);
    }
  }, [hexes, currentUserId]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[60vh] rounded-lg overflow-hidden border border-border"
      style={{ zIndex: 0 }}
    />
  );
};

export default TerritoryMap;

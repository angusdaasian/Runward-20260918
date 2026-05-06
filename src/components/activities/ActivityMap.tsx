import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

interface Props {
  polyline: string;
}

const ActivityMap = ({ polyline }: Props) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || !polyline) return;

    // Clean up previous instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const coords = decodePolyline(polyline);
    if (coords.length === 0) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    mapInstanceRef.current = map;

    // Cleaner cartography — Carto's "Voyager" basemap is softer/less busy
    // than default OSM. Falls back gracefully if the host blocks it.
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { maxZoom: 19, subdomains: 'abcd' },
    ).addTo(map);

    // White "casing" beneath the route gives a clean halo against the map.
    L.polyline(coords, {
      color: '#FFFFFF',
      weight: 7,
      opacity: 0.95,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(map);

    // Main route — bold, rounded, vivid.
    const line = L.polyline(coords, {
      color: '#FC4C02',
      weight: 4,
      opacity: 1,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(map);

    // Start (green) and end (orange) dots
    const dot = (latlng: [number, number], fill: string) =>
      L.circleMarker(latlng, {
        radius: 5,
        weight: 2,
        color: '#FFFFFF',
        fillColor: fill,
        fillOpacity: 1,
      }).addTo(map);
    dot(coords[0], '#10B981');
    dot(coords[coords.length - 1], '#FC4C02');

    map.fitBounds(line.getBounds(), { padding: [14, 14] });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [polyline]);

  return (
    <div
      ref={mapRef}
      className="w-full h-32 rounded-lg overflow-hidden mt-2"
      style={{ zIndex: 0 }}
    />
  );
};

export default ActivityMap;

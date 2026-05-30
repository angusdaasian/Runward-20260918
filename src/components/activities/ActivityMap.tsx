import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, X } from "lucide-react";

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

function renderRoute(map: L.Map, coords: [number, number][], padding: [number, number]) {
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, subdomains: 'abcd' },
  ).addTo(map);

  L.polyline(coords, {
    color: '#FFFFFF',
    weight: 7,
    opacity: 0.95,
    lineJoin: 'round',
    lineCap: 'round',
  }).addTo(map);

  const line = L.polyline(coords, {
    color: '#FC4C02',
    weight: 4,
    opacity: 1,
    lineJoin: 'round',
    lineCap: 'round',
  }).addTo(map);

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

  map.fitBounds(line.getBounds(), { padding });
}

interface Props {
  polyline: string;
  className?: string;
}

const ActivityMap = ({ polyline, className }: Props) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const previewMapRef = useRef<L.Map | null>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const fullMapRef = useRef<L.Map | null>(null);
  const [open, setOpen] = useState(false);

  // Preview map
  useEffect(() => {
    if (!previewRef.current || !polyline) return;

    if (previewMapRef.current) {
      previewMapRef.current.remove();
      previewMapRef.current = null;
    }

    const coords = decodePolyline(polyline);
    if (coords.length === 0) return;

    const map = L.map(previewRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });
    previewMapRef.current = map;
    renderRoute(map, coords, [14, 14]);

    return () => {
      if (previewMapRef.current) {
        previewMapRef.current.remove();
        previewMapRef.current = null;
      }
    };
  }, [polyline]);

  // Fullscreen map (mounted only when overlay opens)
  useEffect(() => {
    if (!open || !fullRef.current || !polyline) return;

    const coords = decodePolyline(polyline);
    if (coords.length === 0) return;

    let frame = 0;

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

      const map = L.map(fullRef.current, {
        zoomControl: true,
        attributionControl: true,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
      });
      fullMapRef.current = map;
      renderRoute(map, coords, [30, 30]);
      requestAnimationFrame(() => map.invalidateSize());
    };

    frame = requestAnimationFrame(mountMap);

    return () => {
      cancelAnimationFrame(frame);
      if (fullMapRef.current) {
        fullMapRef.current.remove();
        fullMapRef.current = null;
      }
    };
  }, [open, polyline]);

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
          className="w-full h-32 rounded-lg overflow-hidden"
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

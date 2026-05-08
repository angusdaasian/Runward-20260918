// Region bounding boxes for territory feature
export type Region = "HK" | "TW";

export const REGION_BOUNDS: Record<Region, { south: number; north: number; west: number; east: number; center: [number, number]; zoom: number; label: string; labelZh: string }> = {
  HK: {
    south: 22.15, north: 22.58, west: 113.83, east: 114.45,
    center: [22.32, 114.17], zoom: 11,
    label: "Hong Kong", labelZh: "香港",
  },
  TW: {
    south: 21.85, north: 25.35, west: 119.30, east: 122.05,
    center: [23.7, 121.0], zoom: 8,
    label: "Taiwan", labelZh: "台灣",
  },
};

export function regionForLatLng(lat: number, lng: number): Region | null {
  for (const r of ["HK", "TW"] as Region[]) {
    const b = REGION_BOUNDS[r];
    if (lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east) return r;
  }
  return null;
}

// Decode Google encoded polyline -> [lat, lng][]
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export const HEX_RESOLUTION = 8;

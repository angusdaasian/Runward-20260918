import { forwardRef, useMemo } from "react";
import { cellToBoundary, cellArea, UNITS } from "h3-js";

interface Hex {
  hex_id: string;
  owner_user_id: string;
  captured_at: string;
  region: string;
}

interface Props {
  hexes: Hex[];
  displayName: string;
  lang: "en" | "zh";
}

const WIDTH = 1080;
const HEIGHT = 1350;

// Simple Web Mercator projection
const mercator = (lat: number, lng: number) => {
  const x = (lng + 180) / 360;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return { x, y };
};

const ShareTerritoryCard = forwardRef<HTMLDivElement, Props>(
  ({ hexes, displayName, lang }, ref) => {
    const stats = useMemo(() => {
      const totalHexes = hexes.length;
      const areaKm2 = hexes.reduce(
        (acc, h) => acc + cellArea(h.hex_id, UNITS.km2),
        0,
      );
      // Distinct regions ≈ ~11km cells
      const cities = new Set(hexes.map((h) => h.region)).size;

      // Longest streak (consecutive UTC days with captures)
      const days = Array.from(
        new Set(hexes.map((h) => h.captured_at.slice(0, 10))),
      ).sort();
      let longest = 0;
      let cur = 0;
      let prev: number | null = null;
      for (const d of days) {
        const t = new Date(d + "T00:00:00Z").getTime();
        if (prev !== null && t - prev === 86400000) cur++;
        else cur = 1;
        longest = Math.max(longest, cur);
        prev = t;
      }
      return { totalHexes, areaKm2, cities, longest };
    }, [hexes]);

    const { polygons, viewBox } = useMemo(() => {
      if (hexes.length === 0) return { polygons: [], viewBox: "0 0 1 1" };
      const points: { x: number; y: number; pts: { x: number; y: number }[] }[] =
        [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const h of hexes) {
        const boundary = cellToBoundary(h.hex_id) as [number, number][];
        const projected = boundary.map(([lat, lng]) => mercator(lat, lng));
        const cx = projected.reduce((a, p) => a + p.x, 0) / projected.length;
        const cy = projected.reduce((a, p) => a + p.y, 0) / projected.length;
        points.push({ x: cx, y: cy, pts: projected });
        for (const p of projected) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
      // Pad
      const padX = (maxX - minX) * 0.15 || 0.0001;
      const padY = (maxY - minY) * 0.15 || 0.0001;
      minX -= padX; maxX += padX; minY -= padY; maxY += padY;
      // Square aspect
      const w = maxX - minX;
      const h = maxY - minY;
      const size = Math.max(w, h);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      minX = cx - size / 2;
      minY = cy - size / 2;

      const SCALE = 1000;
      const polygons = points.map((pt) => ({
        d: pt.pts
          .map(
            (p, i) =>
              `${i === 0 ? "M" : "L"}${((p.x - minX) / size) * SCALE},${
                ((p.y - minY) / size) * SCALE
              }`,
          )
          .join(" ") + " Z",
      }));
      return { polygons, viewBox: `0 0 ${SCALE} ${SCALE}` };
    }, [hexes]);

    const t = (en: string, zh: string) => (lang === "zh" ? zh : en);

    return (
      <div
        ref={ref}
        style={{
          width: WIDTH,
          height: HEIGHT,
          position: "relative",
          background:
            "linear-gradient(160deg, #0b0f1a 0%, #1a1033 40%, #3d1052 70%, #FC4C02 110%)",
          color: "white",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial",
          overflow: "hidden",
          padding: 64,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 28, opacity: 0.7, letterSpacing: 4, textTransform: "uppercase" }}>
              {t("Territory", "領地")}
            </div>
            <div style={{ fontSize: 64, fontWeight: 800, marginTop: 8, lineHeight: 1 }}>
              {displayName}
            </div>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              padding: "10px 18px",
              background: "rgba(255,255,255,0.12)",
              borderRadius: 999,
              backdropFilter: "blur(8px)",
            }}
          >
            #RunningFingerprint
          </div>
        </div>

        {/* Map */}
        <div
          style={{
            flex: 1,
            marginTop: 36,
            marginBottom: 36,
            borderRadius: 32,
            background:
              "radial-gradient(circle at 30% 30%, rgba(252,76,2,0.18), rgba(255,255,255,0.04) 60%)",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 28,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {polygons.length > 0 ? (
            <svg viewBox={viewBox} style={{ width: "100%", height: "100%" }}>
              <defs>
                <radialGradient id="hexGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#FF8A3D" stopOpacity="1" />
                  <stop offset="100%" stopColor="#FC4C02" stopOpacity="0.85" />
                </radialGradient>
              </defs>
              {polygons.map((p, i) => (
                <path
                  key={i}
                  d={p.d}
                  fill="url(#hexGlow)"
                  stroke="#FFB37A"
                  strokeWidth={1.2}
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          ) : (
            <div style={{ opacity: 0.6, fontSize: 24 }}>
              {t("No territory yet", "尚未佔領")}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Stat
            value={stats.totalHexes.toLocaleString()}
            label={t("Hexes captured", "佔領地塊")}
          />
          <Stat
            value={`${stats.areaKm2.toFixed(1)} km²`}
            label={t("Area explored", "探索面積")}
          />
          <Stat
            value={stats.cities.toString()}
            label={t("Areas visited", "造訪地區")}
          />
          <Stat
            value={`${stats.longest} ${t("days", "天")}`}
            label={t("Longest streak", "最長連續")}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            opacity: 0.85,
          }}
        >
          <div style={{ fontWeight: 700, letterSpacing: 2 }}>RUNNERS HUB</div>
          <div style={{ opacity: 0.6 }}>{t("Claim your map", "佔領你的地圖")}</div>
        </div>
      </div>
    );
  },
);

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div
    style={{
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 24,
      padding: "22px 26px",
      backdropFilter: "blur(8px)",
    }}
  >
    <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.05 }}>{value}</div>
    <div style={{ fontSize: 22, opacity: 0.7, marginTop: 6 }}>{label}</div>
  </div>
);

ShareTerritoryCard.displayName = "ShareTerritoryCard";
export default ShareTerritoryCard;

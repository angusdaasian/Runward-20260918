import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, FONTS } from "../theme";

const STATS = [
  { label: "VO₂max", from: 38, to: 52, suffix: "" },
  { label: "週距離", from: 12, to: 47, suffix: " km" },
  { label: "5K 配速", from: 6.2, to: 4.8, suffix: " /km", decimals: 1, format: (n: number) => {
    const m = Math.floor(n);
    const s = Math.round((n - m) * 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }},
];

const PLATFORMS = ["Garmin", "Strava", "Apple Health"];

export const SceneSync: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ padding: 80, justifyContent: "center" }}>
      <div
        style={{
          fontFamily: FONTS.zh,
          fontWeight: 900,
          color: COLORS.text,
          fontSize: 78,
          textAlign: "center",
          marginBottom: 40,
          opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        一鍵同步<br />
        <span style={{ color: COLORS.primary }}>所有跑步數據</span>
      </div>

      {/* Platform chips */}
      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 60, flexWrap: "wrap" }}>
        {PLATFORMS.map((p, i) => {
          const s = spring({ frame: frame - 12 - i * 8, fps, config: { damping: 15 } });
          return (
            <div
              key={p}
              style={{
                fontFamily: FONTS.display,
                fontWeight: 700,
                fontSize: 36,
                color: COLORS.primary,
                padding: "18px 36px",
                background: COLORS.surface,
                border: `2px solid ${COLORS.primary}`,
                borderRadius: 999,
                opacity: s,
                transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`,
              }}
            >
              {p}
            </div>
          );
        })}
      </div>

      {/* Animated stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28, padding: "0 20px" }}>
        {STATS.map((stat, i) => {
          const t = interpolate(frame, [40 + i * 8, 90 + i * 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const eased = 1 - Math.pow(1 - t, 3);
          const value = stat.from + (stat.to - stat.from) * eased;
          const display = stat.format
            ? stat.format(value)
            : value.toFixed(stat.decimals ?? 0);
          const enter = spring({ frame: frame - 30 - i * 8, fps, config: { damping: 18 } });
          return (
            <div
              key={stat.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "30px 40px",
                background: COLORS.surface,
                borderRadius: 24,
                border: `1px solid ${COLORS.border}`,
                opacity: enter,
                transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.zh,
                  color: COLORS.textMuted,
                  fontSize: 38,
                  fontWeight: 500,
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontFamily: FONTS.display,
                  color: COLORS.primaryGlow,
                  fontSize: 64,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {display}
                <span style={{ fontSize: 36, color: COLORS.textMuted, marginLeft: 6 }}>
                  {stat.suffix}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

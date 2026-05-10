import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, FONTS } from "../theme";

const LINES = ["數據散落 3 個 App？", "訓練沒方向？", "練了卻沒進步？"];

export const ScenePainPoint: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-start", padding: 80 }}>
      {LINES.map((line, i) => {
        const s = spring({ frame: frame - i * 18, fps, config: { damping: 18, stiffness: 140 } });
        const exitOpacity = interpolate(frame, [80, 95], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div
            key={i}
            style={{
              fontFamily: FONTS.zh,
              fontWeight: 700,
              color: i === LINES.length - 1 ? COLORS.accent : COLORS.text,
              fontSize: i === LINES.length - 1 ? 96 : 84,
              lineHeight: 1.25,
              opacity: s * exitOpacity,
              transform: `translateX(${interpolate(s, [0, 1], [-80, 0])}px)`,
              marginBottom: 24,
            }}
          >
            {line}
          </div>
        );
      })}

      {/* Bottom strikethrough hint */}
      <div
        style={{
          position: "absolute",
          bottom: 200,
          left: 80,
          right: 80,
          height: 4,
          background: COLORS.primary,
          transformOrigin: "left",
          transform: `scaleX(${interpolate(frame, [70, 90], [0, 1], { extrapolateRight: "clamp" })})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 110,
          left: 80,
          fontFamily: FONTS.zh,
          fontWeight: 500,
          color: COLORS.textMuted,
          fontSize: 42,
          opacity: interpolate(frame, [80, 95], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        Runward 一個就夠 →
      </div>
    </AbsoluteFill>
  );
};

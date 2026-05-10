import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, FONTS } from "../theme";

const TEXT = "你的下一場 PB";
const SUB = "從這裡開始。";

export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Track lines moving forward (perspective)
  const lineShift = interpolate(frame, [0, 100], [0, 400]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Track lines */}
      <AbsoluteFill style={{ overflow: "hidden", opacity: 0.45 }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "60%",
            width: 2000,
            height: 1400,
            transform: `translate(-50%, 0) perspective(700px) rotateX(72deg)`,
            backgroundImage: `repeating-linear-gradient(0deg, ${COLORS.primary} 0px, ${COLORS.primary} 4px, transparent 4px, transparent 80px), repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 2px, transparent 2px, transparent 200px)`,
            backgroundPositionY: lineShift,
          }}
        />
      </AbsoluteFill>

      {/* Headline */}
      <div style={{ textAlign: "center", padding: 60, zIndex: 2 }}>
        <div
          style={{
            fontFamily: FONTS.display,
            color: COLORS.primaryGlow,
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: 6,
            opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
            marginBottom: 30,
          }}
        >
          RUNWARD
        </div>
        <h1
          style={{
            fontFamily: FONTS.zh,
            fontWeight: 900,
            color: COLORS.text,
            fontSize: 110,
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {TEXT.split("").map((c, i) => {
            const s = spring({ frame: frame - 8 - i * 3, fps, config: { damping: 14 } });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: s,
                  transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
                }}
              >
                {c === " " ? "\u00A0" : c}
              </span>
            );
          })}
        </h1>
        <h2
          style={{
            fontFamily: FONTS.zh,
            fontWeight: 700,
            color: COLORS.primary,
            fontSize: 96,
            lineHeight: 1.2,
            margin: "20px 0 0 0",
            opacity: interpolate(frame, [55, 75], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateX(${interpolate(frame, [55, 75], [-60, 0], { extrapolateRight: "clamp" })}px)`,
          }}
        >
          {SUB}
        </h2>
      </div>
    </AbsoluteFill>
  );
};

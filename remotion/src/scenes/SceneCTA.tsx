import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, FONTS } from "../theme";

export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const subSpring = spring({ frame: frame - 20, fps, config: { damping: 18 } });
  const ctaSpring = spring({ frame: frame - 40, fps, config: { damping: 14 } });
  const pulse = 1 + Math.sin(frame / 8) * 0.03;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 60 }}>
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(34,197,94,0.35) 0%, transparent 70%)`,
          opacity: interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" }),
        }}
      />

      <div
        style={{
          fontFamily: FONTS.display,
          fontWeight: 700,
          fontSize: 200,
          color: COLORS.text,
          letterSpacing: -4,
          opacity: logoSpring,
          transform: `scale(${interpolate(logoSpring, [0, 1], [0.6, 1]) * pulse})`,
          textShadow: `0 0 80px rgba(34,197,94,0.6)`,
        }}
      >
        Run<span style={{ color: COLORS.primary }}>ward</span>
      </div>

      <div
        style={{
          fontFamily: FONTS.zh,
          fontWeight: 500,
          fontSize: 44,
          color: COLORS.textMuted,
          marginTop: 20,
          opacity: subSpring,
          textAlign: "center",
        }}
      >
        AI 跑步訓練 · 跑得更聰明
      </div>

      <div
        style={{
          marginTop: 80,
          padding: "32px 72px",
          background: COLORS.primary,
          borderRadius: 999,
          fontFamily: FONTS.zh,
          fontWeight: 900,
          fontSize: 56,
          color: COLORS.bgDeep,
          opacity: ctaSpring,
          transform: `scale(${interpolate(ctaSpring, [0, 1], [0.7, 1])})`,
          boxShadow: `0 30px 80px -20px rgba(34,197,94,0.6)`,
        }}
      >
        立即下載
      </div>

      <div
        style={{
          marginTop: 40,
          fontFamily: FONTS.display,
          fontWeight: 500,
          fontSize: 42,
          color: COLORS.primaryGlow,
          letterSpacing: 2,
          opacity: ctaSpring,
        }}
      >
        runward.app
      </div>
    </AbsoluteFill>
  );
};

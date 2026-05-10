import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, FONTS } from "../theme";

const FEATURES = [
  { icon: "AI", title: "AI 跑步教練", desc: "隨時問配速、訓練、恢復" },
  { icon: "POSE", title: "姿勢分析", desc: "拍 10 秒影片，抓出跑姿問題" },
  { icon: "PLAN", title: "個人化訓練計畫", desc: "依目標距離與配速生成" },
  { icon: "XP", title: "獎勵 & 排行榜", desc: "跑步也能升等、領獎勵" },
];

export const SceneFeatures: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ padding: 70, justifyContent: "center" }}>
      <div
        style={{
          fontFamily: FONTS.zh,
          fontWeight: 900,
          color: COLORS.text,
          fontSize: 76,
          marginBottom: 50,
          opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(frame, [0, 15], [20, 0], { extrapolateRight: "clamp" })}px)`,
        }}
      >
        一切，<span style={{ color: COLORS.primary }}>都在這裡。</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {FEATURES.map((f, i) => {
          const delay = 18 + i * 20;
          const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 160 } });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                padding: "26px 32px",
                background: `linear-gradient(135deg, ${COLORS.surfaceHi} 0%, ${COLORS.surface} 100%)`,
                borderRadius: 26,
                border: `1px solid ${COLORS.border}`,
                opacity: s,
                transform: `translateX(${interpolate(s, [0, 1], [-120, 0])}px) scale(${interpolate(s, [0, 1], [0.92, 1])})`,
                boxShadow: `0 20px 60px -20px rgba(34,197,94,0.25)`,
              }}
            >
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 22,
                  background: `linear-gradient(135deg, ${COLORS.primaryDeep}, ${COLORS.primary})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontFamily: FONTS.display,
                  fontWeight: 700,
                  fontSize: f.icon.length > 2 ? 28 : 44,
                  color: COLORS.bgDeep,
                  letterSpacing: 1,
                }}
              >
                {f.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: FONTS.zh,
                    fontWeight: 900,
                    color: COLORS.text,
                    fontSize: 50,
                    lineHeight: 1.1,
                    marginBottom: 6,
                  }}
                >
                  {f.title}
                </div>
                <div
                  style={{
                    fontFamily: FONTS.zh,
                    fontWeight: 400,
                    color: COLORS.textMuted,
                    fontSize: 28,
                  }}
                >
                  {f.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

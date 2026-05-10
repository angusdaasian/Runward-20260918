import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { COLORS, FONTS } from "./theme";
import "./fonts";

const Bg: React.FC = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 900], [-30, 30]);
  const y = interpolate(frame, [0, 900], [20, -20]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${50 + x}% ${50 + y}%, rgba(34,197,94,0.22) 0%, transparent 55%), linear-gradient(180deg, ${COLORS.bgDeep} 0%, ${COLORS.bg} 100%)`,
      }}
    />
  );
};

const Phone: React.FC<{ src: string; delay?: number; tilt?: number }> = ({ src, delay = 0, tilt = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } });
  const float = Math.sin(((frame - delay) / 90) * Math.PI * 2) * 8;
  const scale = interpolate(s, [0, 1], [0.85, 1]);
  const y = interpolate(s, [0, 1], [80, 0]) + float;
  return (
    <div
      style={{
        width: 480,
        height: 1040,
        borderRadius: 56,
        background: "#000",
        padding: 12,
        boxShadow: "0 40px 90px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.06) inset",
        transform: `translateY(${y}px) scale(${scale}) rotate(${tilt}deg)`,
        opacity: s,
      }}
    >
      <div style={{ width: "100%", height: "100%", borderRadius: 44, overflow: "hidden", background: "#fff" }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
      </div>
    </div>
  );
};

const Title: React.FC<{ kicker?: string; main: string; sub?: string; align?: "left" | "center" }> = ({ kicker, main, sub, align = "center" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const s2 = spring({ frame: frame - 12, fps, config: { damping: 200 } });
  const s3 = spring({ frame: frame - 20, fps, config: { damping: 200 } });
  return (
    <div style={{ textAlign: align, width: "100%", padding: "0 80px" }}>
      {kicker && (
        <div
          style={{
            opacity: s1,
            transform: `translateY(${interpolate(s1, [0, 1], [20, 0])}px)`,
            color: COLORS.primaryGlow,
            fontFamily: FONTS.zh,
            fontWeight: 700,
            fontSize: 38,
            letterSpacing: 6,
            marginBottom: 24,
          }}
        >
          {kicker}
        </div>
      )}
      <h1
        style={{
          opacity: s2,
          transform: `translateY(${interpolate(s2, [0, 1], [40, 0])}px)`,
          color: COLORS.text,
          fontFamily: FONTS.zh,
          fontWeight: 900,
          fontSize: 110,
          lineHeight: 1.05,
          margin: 0,
          letterSpacing: -2,
        }}
      >
        {main}
      </h1>
      {sub && (
        <p
          style={{
            opacity: s3,
            transform: `translateY(${interpolate(s3, [0, 1], [20, 0])}px)`,
            color: COLORS.textMuted,
            fontFamily: FONTS.zh,
            fontSize: 42,
            lineHeight: 1.4,
            marginTop: 32,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
};

const SceneHook: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 60 }}>
    <Title kicker="RUNWARD · 跑步訓練助手" main={"每一步\n都是勝利"} sub="AI 訓練計劃 · 跑姿分析 · 城市征服" />
    <Phone src="captures/01-onboarding.png" delay={20} />
  </AbsoluteFill>
);

const SceneHome: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 50, paddingTop: 80 }}>
    <Title main="智能訓練主頁" sub="活動紀錄、每日建議、月度挑戰" />
    <Phone src="captures/03-home.png" delay={15} />
  </AbsoluteFill>
);

const SceneAI: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 80, padding: 80 }}>
      <div style={{ flex: 1 }}>
        <Title align="left" kicker="✦ AI 驅動" main={"教練級\n活動分析"} sub="每次跑步後即時生成個人化建議與下次訓練配速。" />
      </div>
      <Phone src="captures/05-ai-analysis.png" delay={10} tilt={interpolate(frame, [0, 120], [0, -2])} />
    </AbsoluteFill>
  );
};

const SceneFeatures: React.FC = () => {
  const items = [
    { src: "captures/07-ai-training.png", label: "AI 訓練計劃" },
    { src: "captures/08-races.png", label: "賽事日曆" },
    { src: "captures/10-territory.png", label: "城市獵人" },
    { src: "captures/12-posture.png", label: "AI 跑姿分析" },
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 50, padding: 80 }}>
      <Title main="一個 App 包辦全部" />
      <div style={{ display: "flex", gap: 28, justifyContent: "center" }}>
        {items.map((it, i) => (
          <Sequence key={i} from={i * 6}>
            <FeatureCard src={it.src} label={it.label} />
          </Sequence>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const FeatureCard: React.FC<{ src: string; label: string }> = ({ src, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 15 } });
  return (
    <div style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [60, 0])}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{ width: 200, height: 432, borderRadius: 28, background: "#000", padding: 6, boxShadow: "0 20px 50px rgba(0,0,0,0.6)" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 22, overflow: "hidden", background: "#fff" }}>
          <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
        </div>
      </div>
      <div style={{ color: COLORS.text, fontFamily: FONTS.zh, fontWeight: 700, fontSize: 28 }}>{label}</div>
    </div>
  );
};

const ScenePremium: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 80, padding: 80 }}>
    <Phone src="captures/02-premium-table.png" delay={10} tilt={2} />
    <div style={{ flex: 1 }}>
      <Title align="left" kicker="✦ PREMIUM" main={"解鎖你的\n全部潛能"} sub="AI 教練 · 全距離預測 · 無限跑姿分析" />
    </div>
  </AbsoluteFill>
);

const SceneArena: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 50, paddingTop: 80 }}>
    <Title main="競技場 · 排行榜" sub="每月賽季、徽章、簽到獎勵" />
    <Phone src="captures/09-arena.png" delay={15} />
  </AbsoluteFill>
);

const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const pulse = 1 + Math.sin((frame / 30) * Math.PI) * 0.02;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 60 }}>
      <div
        style={{
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`,
          fontFamily: FONTS.zh,
          fontWeight: 900,
          fontSize: 180,
          color: COLORS.text,
          letterSpacing: -4,
          lineHeight: 0.95,
          textAlign: "center",
        }}
      >
        準備好<br />
        <span style={{ color: COLORS.primary }}>跑得更聰明？</span>
      </div>
      <div
        style={{
          opacity: interpolate(frame, [30, 50], [0, 1]),
          transform: `scale(${pulse})`,
          background: COLORS.text,
          color: COLORS.bgDeep,
          padding: "32px 80px",
          borderRadius: 100,
          fontFamily: FONTS.zh,
          fontWeight: 700,
          fontSize: 52,
          marginTop: 40,
        }}
      >
         App Store 立即下載
      </div>
      <div style={{ opacity: interpolate(frame, [40, 60], [0, 1]), color: COLORS.textMuted, fontFamily: FONTS.zh, fontSize: 36, marginTop: 12 }}>
        Runward · 每一步都是勝利
      </div>
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC = () => {
  const t = (d: number) => springTiming({ config: { damping: 200 }, durationInFrames: d });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep }}>
      <Bg />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={120}><SceneHook /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={t(18)} />

        <TransitionSeries.Sequence durationInFrames={110}><SceneHome /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t(15)} />

        <TransitionSeries.Sequence durationInFrames={130}><SceneAI /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={t(18)} />

        <TransitionSeries.Sequence durationInFrames={150}><SceneFeatures /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t(15)} />

        <TransitionSeries.Sequence durationInFrames={130}><ScenePremium /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-left" })} timing={t(18)} />

        <TransitionSeries.Sequence durationInFrames={110}><SceneArena /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t(20)} />

        <TransitionSeries.Sequence durationInFrames={150}><SceneCTA /></TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

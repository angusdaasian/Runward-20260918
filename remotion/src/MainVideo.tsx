import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { TransitionSeries, springTiming, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { COLORS } from "./theme";
import "./fonts";

import { SceneHook } from "./scenes/SceneHook";
import { ScenePainPoint } from "./scenes/ScenePainPoint";
import { SceneFeatures } from "./scenes/SceneFeatures";
import { SceneSync } from "./scenes/SceneSync";
import { SceneCTA } from "./scenes/SceneCTA";

const PersistentGrain: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // Subtle moving radial gradient backdrop
  const x = interpolate(frame, [0, 540], [-100, 100]);
  const y = interpolate(frame, [0, 540], [50, -50]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${50 + x * 0.3}% ${50 + y * 0.3}%, rgba(34,197,94,0.18) 0%, transparent 55%), linear-gradient(180deg, ${COLORS.bgDeep} 0%, ${COLORS.bg} 100%)`,
        pointerEvents: "none",
      }}
    />
  );
};

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep }}>
      <PersistentGrain />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={100}>
          <SceneHook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 18 })}
        />

        <TransitionSeries.Sequence durationInFrames={95}>
          <ScenePainPoint />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 18 })}
        />

        <TransitionSeries.Sequence durationInFrames={180}>
          <SceneFeatures />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 18 })}
        />

        <TransitionSeries.Sequence durationInFrames={100}>
          <SceneSync />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />

        <TransitionSeries.Sequence durationInFrames={110}>
          <SceneCTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

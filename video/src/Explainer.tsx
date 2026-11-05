import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { TitleScene } from "./scenes/Title";
import { ProblemScene } from "./scenes/Problem";
import { SolutionScene } from "./scenes/Solution";
import { FlowScene } from "./scenes/Flow";
import { StackScene } from "./scenes/Stack";
import { OutroScene } from "./scenes/Outro";
import { colors } from "./theme";

/** 30fps · ~75s · 1920×1080 */
export const TOTAL_FRAMES = 30 * 75;

export const Explainer: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <Series>
        <Series.Sequence durationInFrames={240}>
          <TitleScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <ProblemScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <SolutionScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={360}>
          <FlowScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <StackScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={330}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

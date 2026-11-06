import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  Series,
  staticFile,
} from "remotion";
import { TitleScene } from "./scenes/Title";
import { ProblemScene } from "./scenes/Problem";
import { SolutionScene } from "./scenes/Solution";
import { FlowScene } from "./scenes/Flow";
import { StackScene } from "./scenes/Stack";
import { OutroScene } from "./scenes/Outro";
import { colors } from "./theme";
import {
  BG_MUSIC,
  BG_VOLUME,
  SCENES,
  TOTAL_FRAMES,
  VO_LEAD_FRAMES,
  VO_VOLUME,
} from "./timing";

export { TOTAL_FRAMES };

const SCENE_COMPONENTS = [
  TitleScene,
  ProblemScene,
  SolutionScene,
  FlowScene,
  StackScene,
  OutroScene,
] as const;

export const Explainer: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <Audio
        src={staticFile(BG_MUSIC)}
        volume={BG_VOLUME}
        name="Background music"
      />
      <Series>
        {SCENES.map((scene, i) => {
          const Comp = SCENE_COMPONENTS[i];
          return (
            <Series.Sequence
              key={scene.id}
              durationInFrames={scene.durationInFrames}
              name={scene.id}
            >
              <Comp />
              <Sequence from={VO_LEAD_FRAMES} layout="none">
                <Audio
                  src={staticFile(scene.vo)}
                  volume={VO_VOLUME}
                  name={`VO ${scene.id}`}
                />
              </Sequence>
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};

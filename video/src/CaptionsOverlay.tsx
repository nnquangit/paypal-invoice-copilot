import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { font } from "./fonts";
import type { sceneCaptions } from "./captions-data";

type Cap = (typeof sceneCaptions)[keyof typeof sceneCaptions][number];

export const CaptionsOverlay: React.FC<{
  captions: readonly Cap[];
  /** Frames after sequence start before VO (and caption clock) begins */
  leadFrames: number;
}> = ({ captions, leadFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = ((frame - leadFrames) / fps) * 1000;
  if (ms < 0) return null;

  const active = captions.find((c) => ms >= c.startMs && ms <= c.endMs);
  if (!active) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 56,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          background: "rgba(11, 18, 32, 0.78)",
          border: "1px solid rgba(148, 163, 184, 0.28)",
          borderRadius: 16,
          padding: "16px 28px",
          color: "#F8FAFC",
          fontFamily: font,
          fontSize: 32,
          fontWeight: 550,
          lineHeight: 1.35,
          textAlign: "center",
          textShadow: "0 1px 2px rgba(0,0,0,0.45)",
        }}
      >
        {active.text.trim()}
      </div>
    </AbsoluteFill>
  );
};

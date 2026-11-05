import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Interactive,
} from "remotion";
import { font } from "../fonts";
import { colors } from "../theme";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({ frame, fps, config: { damping: 200 } });
  const subIn = spring({
    frame: frame - 12,
    fps,
    config: { damping: 200 },
  });
  const tipIn = spring({
    frame: frame - 24,
    fps,
    config: { damping: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        fontFamily: font,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: 120,
      }}
    >
      <Interactive.H1
        name="CTA"
        style={{
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 30}px)`,
          color: colors.text,
          fontSize: 88,
          fontWeight: 800,
          lineHeight: 1.1,
          maxWidth: 1400,
          margin: 0,
        }}
      >
        Try it in demo mode in under a minute.
      </Interactive.H1>
      <Interactive.P
        name="CTA-sub"
        style={{
          opacity: subIn,
          color: colors.muted,
          fontSize: 36,
          marginTop: 28,
          maxWidth: 1100,
          lineHeight: 1.4,
        }}
      >
        No PayPal keys required for the walkthrough — flip to sandbox when you
        are ready.
      </Interactive.P>
      <div
        style={{
          opacity: tipIn,
          marginTop: 56,
          background: "rgba(0, 112, 224, 0.12)",
          border: `1px solid ${colors.accent}`,
          borderRadius: 20,
          padding: "22px 40px",
          color: colors.accentSoft,
          fontSize: 32,
          fontWeight: 600,
        }}
      >
        npm run dev → open the chat → ask for an invoice
      </div>
      <div
        style={{
          opacity: interpolate(frame, [40, 70], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          marginTop: 72,
          color: colors.muted,
          fontSize: 28,
        }}
      >
        docs/index.html · README · video/
      </div>
    </AbsoluteFill>
  );
};

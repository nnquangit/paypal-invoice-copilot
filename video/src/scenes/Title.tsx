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

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badgeIn = spring({ frame, fps, config: { damping: 200 } });
  const titleIn = spring({
    frame: frame - 8,
    fps,
    config: { damping: 200 },
  });
  const subIn = spring({
    frame: frame - 18,
    fps,
    config: { damping: 200 },
  });
  const fadeOut = interpolate(frame, [200, 240], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        fontFamily: font,
        opacity: fadeOut,
        justifyContent: "center",
        padding: 120,
      }}
    >
      <div
        style={{
          opacity: badgeIn,
          transform: `translateY(${(1 - badgeIn) * 20}px)`,
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(0, 112, 224, 0.15)",
          border: `1px solid ${colors.accent}`,
          color: colors.accentSoft,
          borderRadius: 999,
          padding: "12px 28px",
          fontSize: 28,
          fontWeight: 600,
          width: "fit-content",
          marginBottom: 36,
        }}
      >
        PayPal Agent Hackathon
      </div>
      <Interactive.H1
        name="Title"
        style={{
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 40}px)`,
          color: colors.text,
          fontSize: 112,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: -2,
          maxWidth: 1500,
          margin: 0,
        }}
      >
        Invoice Copilot
      </Interactive.H1>
      <Interactive.P
        name="Subtitle"
        style={{
          opacity: subIn,
          transform: `translateY(${(1 - subIn) * 24}px)`,
          color: colors.muted,
          fontSize: 42,
          fontWeight: 400,
          marginTop: 28,
          maxWidth: 1200,
          lineHeight: 1.35,
        }}
      >
        Chat once. Review once. Send a PayPal invoice.
      </Interactive.P>
    </AbsoluteFill>
  );
};

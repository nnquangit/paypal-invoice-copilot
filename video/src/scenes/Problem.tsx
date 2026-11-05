import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../fonts";
import { colors } from "../theme";

const pains = [
  "Dig through email for client details",
  "Rebuild line items in PayPal by hand",
  "Copy links, chase status, lose the thread",
];

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const titleIn = spring({ frame, fps, config: { damping: 200 } });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 18, durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        fontFamily: font,
        opacity: fadeOut,
        padding: 120,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: titleIn,
          color: colors.danger,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: "uppercase",
          marginBottom: 24,
        }}
      >
        The friction
      </div>
      <div
        style={{
          opacity: titleIn,
          color: colors.text,
          fontSize: 72,
          fontWeight: 800,
          lineHeight: 1.15,
          marginBottom: 56,
          maxWidth: 1400,
        }}
      >
        Invoicing still feels like busywork.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {pains.map((pain, i) => {
          const enter = spring({
            frame: frame - 20 - i * 12,
            fps,
            config: { damping: 200 },
          });
          return (
            <div
              key={pain}
              style={{
                opacity: enter,
                transform: `translateX(${(1 - enter) * 40}px)`,
                display: "flex",
                alignItems: "center",
                gap: 24,
                background: colors.panel,
                border: `1px solid ${colors.border}`,
                borderRadius: 24,
                padding: "28px 36px",
                fontSize: 40,
                color: colors.text,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: colors.danger,
                  flexShrink: 0,
                }}
              />
              {pain}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

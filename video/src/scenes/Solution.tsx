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

const pillars = [
  { title: "Chat", body: "Describe the job in plain English" },
  { title: "Confirm", body: "Review a structured card before anything ships" },
  { title: "PayPal", body: "Create & send via sandbox or live toolkit" },
];

export const SolutionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({ frame, fps, config: { damping: 200 } });
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
        padding: 120,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: titleIn,
          color: colors.accentSoft,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: "uppercase",
          marginBottom: 24,
        }}
      >
        The fix
      </div>
      <div
        style={{
          opacity: titleIn,
          color: colors.text,
          fontSize: 68,
          fontWeight: 800,
          lineHeight: 1.15,
          marginBottom: 64,
          maxWidth: 1500,
        }}
      >
        One agent desk that turns a message into a PayPal invoice.
      </div>
      <div style={{ display: "flex", gap: 28 }}>
        {pillars.map((p, i) => {
          const enter = spring({
            frame: frame - 16 - i * 10,
            fps,
            config: { damping: 200 },
          });
          return (
            <div
              key={p.title}
              style={{
                opacity: enter,
                transform: `translateY(${(1 - enter) * 30}px)`,
                flex: 1,
                background: colors.panel,
                border: `1px solid ${colors.border}`,
                borderRadius: 28,
                padding: "36px 32px",
              }}
            >
              <div
                style={{
                  color: colors.paypalGold,
                  fontSize: 28,
                  fontWeight: 700,
                  marginBottom: 16,
                }}
              >
                {String(i + 1).padStart(2, "0")} · {p.title}
              </div>
              <div
                style={{
                  color: colors.text,
                  fontSize: 36,
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {p.body}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

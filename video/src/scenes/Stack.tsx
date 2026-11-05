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

const items = [
  { k: "UI", v: "Next.js App Router · chat + invoice desk" },
  { k: "Agent", v: "Demo mode or LLM + PayPal agent toolkit" },
  { k: "Tools", v: "create / send / get / list / cancel / QRC" },
  { k: "Safety", v: "Human confirm before every write" },
];

export const StackScene: React.FC = () => {
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
          color: colors.text,
          fontSize: 64,
          fontWeight: 800,
          marginBottom: 48,
        }}
      >
        Built for judges — and operators
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        {items.map((item, i) => {
          const enter = spring({
            frame: frame - 14 - i * 10,
            fps,
            config: { damping: 200 },
          });
          return (
            <div
              key={item.k}
              style={{
                opacity: enter,
                transform: `scale(${0.92 + enter * 0.08})`,
                background: colors.panel,
                border: `1px solid ${colors.border}`,
                borderRadius: 24,
                padding: "32px 36px",
              }}
            >
              <div
                style={{
                  color: colors.accentSoft,
                  fontSize: 26,
                  fontWeight: 700,
                  marginBottom: 12,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                {item.k}
              </div>
              <div
                style={{
                  color: colors.text,
                  fontSize: 36,
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {item.v}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

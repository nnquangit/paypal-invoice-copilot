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

const steps = [
  { label: "You", detail: "“Invoice Acme $1,200 for March design”" },
  { label: "Agent", detail: "Parses intent → draft invoice payload" },
  { label: "Confirm", detail: "ConfirmCard — edit, approve, or cancel" },
  { label: "PayPal", detail: "create_invoice → send_invoice (sandbox)" },
  { label: "Desk", detail: "Link + status land on the invoice desk" },
];

export const FlowScene: React.FC = () => {
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
        padding: "100px 120px",
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
        How a request becomes an invoice
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {steps.map((step, i) => {
          const enter = spring({
            frame: frame - 12 - i * 18,
            fps,
            config: { damping: 200 },
          });
          return (
            <div
              key={step.label}
              style={{
                opacity: enter,
                transform: `translateY(${(1 - enter) * 24}px)`,
                display: "grid",
                gridTemplateColumns: "220px 1fr",
                gap: 28,
                alignItems: "center",
                background: colors.panel,
                border: `1px solid ${colors.border}`,
                borderRadius: 20,
                padding: "22px 28px",
              }}
            >
              <div
                style={{
                  background: i === 3 ? colors.paypal : colors.accent,
                  color: "#fff",
                  borderRadius: 14,
                  padding: "14px 18px",
                  fontWeight: 700,
                  fontSize: 28,
                  textAlign: "center",
                }}
              >
                {step.label}
              </div>
              <div
                style={{
                  color: colors.text,
                  fontSize: 34,
                  fontWeight: 500,
                }}
              >
                {step.detail}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

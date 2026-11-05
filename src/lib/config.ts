import type { AppMode } from "./types";

export function isPayPalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET &&
      process.env.DEMO_MODE !== "true"
  );
}

export function isLlmConfigured(): boolean {
  return Boolean(
    process.env.LLM_API_KEY && process.env.DEMO_MODE !== "true"
  );
}

export function getPayPalEnvironment(): "sandbox" | "live" | "mock" {
  if (!isPayPalConfigured()) return "mock";
  const env = (process.env.PAYPAL_ENVIRONMENT || "sandbox").toLowerCase();
  return env === "live" || env === "production" ? "live" : "sandbox";
}

export function getAppMode(): AppMode {
  const paypalConfigured = isPayPalConfigured();
  const llmConfigured = isLlmConfigured();
  return {
    demoMode: !paypalConfigured || !llmConfigured || process.env.DEMO_MODE === "true",
    paypalConfigured,
    llmConfigured,
    paypalEnvironment: getPayPalEnvironment(),
    llmProvider: process.env.LLM_BASE_URL
      ? new URL(process.env.LLM_BASE_URL).hostname
      : llmConfigured
        ? "configured"
        : "demo-agent",
  };
}

export const MERCHANT = {
  business_name: process.env.MERCHANT_BUSINESS_NAME || "Quang Studio",
  email: process.env.MERCHANT_EMAIL || "billing@quang.studio",
  given_name: process.env.MERCHANT_GIVEN_NAME || "Quang",
  surname: process.env.MERCHANT_SURNAME || "Ngo",
};

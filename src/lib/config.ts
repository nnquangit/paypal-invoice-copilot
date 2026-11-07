import type { AppMode } from "./types";

/** Single source of truth for LLM defaults (README, .env.example and render.yaml match these). */
export const DEFAULT_LLM_BASE_URL = "https://api.groq.com/openai/v1";
export const DEFAULT_LLM_MODEL = "openai/gpt-oss-20b";

/**
 * Hosted platforms we can detect. Live credentials are refused there because the
 * app has no user authentication and keeps invoices / pending actions in the
 * memory of a single process (see docs/security.html).
 */
export function isHostedDeployment(): boolean {
  return Boolean(process.env.VERCEL || process.env.RENDER);
}

/**
 * Server-side bind check (does not depend on request headers). `scripts/serve.sh`
 * (used by `npm run dev` / `npm start`) binds 127.0.0.1 and exports
 * IC_BIND_HOST=127.0.0.1. Credentials are honoured only when IC_BIND_HOST is a
 * loopback address. Launching Next another way (plain `next start`, PUBLIC_DEMO
 * bind 0.0.0.0, serverless) leaves it unset or non-loopback → credentials ignored.
 */
export function isLoopbackBind(): boolean {
  const h = (process.env.IC_BIND_HOST || "").trim().toLowerCase();
  return h === "127.0.0.1" || h === "::1" || h === "localhost";
}

const BIND_ERROR =
  "ignored: the server is not bound to loopback. Start it with `npm run dev` or `npm start` (binds 127.0.0.1).";

function hasPayPalCredentials(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/**
 * Why PayPal credentials that are present are NOT used. `undefined` means either
 * no credentials, explicit DEMO_MODE, or credentials accepted (sandbox).
 * This build is sandbox-only: any PAYPAL_ENVIRONMENT other than empty/"sandbox"
 * disables PayPal entirely instead of reaching the production API.
 */
export function getPayPalConfigError(): string | undefined {
  if (!hasPayPalCredentials() || process.env.DEMO_MODE === "true") return undefined;
  const raw = (process.env.PAYPAL_ENVIRONMENT || "sandbox").trim().toLowerCase();
  if (raw !== "sandbox") {
    const shown = /^[a-z_-]{1,20}$/.test(raw) ? raw : "<invalid>";
    return `PAYPAL_ENVIRONMENT=${shown} rejected: this build is sandbox-only, PayPal is disabled.`;
  }
  if (isHostedDeployment()) {
    return "PayPal credentials are ignored on hosted deployments (no auth, single-process memory store). Run locally on 127.0.0.1.";
  }
  if (!isLoopbackBind()) return `PayPal credentials ${BIND_ERROR}`;
  return undefined;
}

export function isPayPalConfigured(): boolean {
  return Boolean(
    hasPayPalCredentials() &&
      process.env.DEMO_MODE !== "true" &&
      !getPayPalConfigError()
  );
}

/** Parsed LLM base URL; never throws on malformed input. */
export function getLlmBaseUrl(): { url?: URL; error?: string } {
  const raw = process.env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { error: "LLM_BASE_URL must use http(s)." };
    }
    return { url };
  } catch {
    return { error: "LLM_BASE_URL is not a valid URL." };
  }
}

export function getLlmConfigError(): string | undefined {
  if (!process.env.LLM_API_KEY || process.env.DEMO_MODE === "true") return undefined;
  if (process.env.FORCE_DEMO_AGENT === "true") return undefined;
  const { error } = getLlmBaseUrl();
  if (error) return `${error} Using the built-in demo agent.`;
  if (isHostedDeployment()) {
    return "LLM_API_KEY is ignored on hosted deployments (no auth). Run locally on 127.0.0.1.";
  }
  if (!isLoopbackBind()) return `LLM_API_KEY ${BIND_ERROR}`;
  return undefined;
}

/** True only when the live LLM agent will actually be used for /api/chat. */
export function isLlmConfigured(): boolean {
  return Boolean(
    process.env.LLM_API_KEY &&
      process.env.DEMO_MODE !== "true" &&
      process.env.FORCE_DEMO_AGENT !== "true" &&
      !getLlmConfigError()
  );
}

/** Any credential that can cause a real outbound call is active. */
export function liveCredentialsActive(): boolean {
  return isPayPalConfigured() || isLlmConfigured();
}

export function getPayPalEnvironment(): "sandbox" | "mock" {
  return isPayPalConfigured() ? "sandbox" : "mock";
}

export function getAppMode(): AppMode {
  const paypalConfigured = isPayPalConfigured();
  const llmConfigured = isLlmConfigured();
  const { url } = getLlmBaseUrl();
  return {
    demoMode: !paypalConfigured || !llmConfigured || process.env.DEMO_MODE === "true",
    paypalConfigured,
    llmConfigured,
    paypalEnvironment: getPayPalEnvironment(),
    llmProvider: llmConfigured && url ? url.hostname : "demo-agent",
    paypalConfigError: getPayPalConfigError(),
    llmConfigError: getLlmConfigError(),
  };
}

export const MERCHANT = {
  business_name: process.env.MERCHANT_BUSINESS_NAME || "Quang Studio",
  email: process.env.MERCHANT_EMAIL || "billing@quang.studio",
  given_name: process.env.MERCHANT_GIVEN_NAME || "Quang",
  surname: process.env.MERCHANT_SURNAME || "Ngo",
};

export function getLlmModel(): string {
  return process.env.LLM_MODEL || DEFAULT_LLM_MODEL;
}

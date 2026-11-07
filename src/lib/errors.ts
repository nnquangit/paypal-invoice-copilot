/**
 * Error text that may reach the browser. Provider errors (LLM, PayPal) can echo
 * request details, so everything is redacted and truncated before it leaves the
 * server. Raw errors are only logged server-side, also redacted.
 */

const SECRET_ENV_KEYS = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "LLM_API_KEY"] as const;

const PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /Basic\s+[A-Za-z0-9+/=]{8,}/gi,
  /\b(?:gsk|sk-or-v1|sk-or|sk-proj|sk|AIza|xai|pk)[-_][A-Za-z0-9_-]{8,}/g,
  /\bAIza[A-Za-z0-9_-]{20,}/g,
  /\b(?:A21AA|EC|EL|AQ)[A-Za-z0-9_-]{30,}/g, // PayPal-style client ids / tokens
  /((?:api[_-]?key|client[_-]?secret|client[_-]?id|access[_-]?token|authorization|password|secret)["']?\s*[:=]\s*["']?)[^\s"',}&]+/gi,
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const key of SECRET_ENV_KEYS) {
    const v = process.env[key];
    if (v && v.length >= 6) out = out.split(v).join("[redacted]");
  }
  for (const re of PATTERNS) {
    out = out.replace(re, (m, prefix) =>
      typeof prefix === "string" && m.startsWith(prefix) ? `${prefix}[redacted]` : "[redacted]"
    );
  }
  return out;
}

export function safeText(input: unknown, max = 240): string {
  const s = redactSecrets(String(input ?? ""))
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function errName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
}

/** Browser-safe LLM provider error: category + HTTP status, never the raw body. */
export function publicLlmError(err: unknown): string {
  const status =
    err && typeof err === "object" && "statusCode" in err
      ? Number((err as { statusCode?: unknown }).statusCode)
      : undefined;
  const name = errName(err);
  if (/NoSuchTool|InvalidToolArguments|ToolExecution/i.test(name)) {
    return "The model requested a tool call that was rejected; nothing was executed.";
  }
  if (status === 401 || status === 403) return `LLM provider rejected the credentials (HTTP ${status}).`;
  if (status === 404) return "LLM provider returned HTTP 404 (check LLM_BASE_URL / LLM_MODEL).";
  if (status === 429) return "LLM provider rate limit reached (HTTP 429). Try again shortly.";
  if (status && Number.isFinite(status)) return `LLM provider request failed (HTTP ${status}).`;
  return "LLM provider request failed.";
}

/** Browser-safe PayPal error from a toolkit payload or thrown error. */
export function publicPayPalError(payloadOrErr: unknown, fallback = "PayPal API error"): string {
  if (payloadOrErr instanceof Error) return safeText(payloadOrErr.message || fallback, 200);
  if (payloadOrErr && typeof payloadOrErr === "object") {
    const p = payloadOrErr as Record<string, unknown>;
    const msg = safeText(p.message || p.error || p.name || p.code || fallback, 200);
    const debug = typeof p.debug_id === "string" ? ` (debug_id ${safeText(p.debug_id, 40)})` : "";
    return `${msg}${debug}`;
  }
  return safeText(payloadOrErr || fallback, 200);
}

export function logServerError(label: string, err: unknown) {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(label, safeText(text, 500));
}

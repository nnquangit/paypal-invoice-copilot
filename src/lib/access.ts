/**
 * Request guards for the API routes.
 *
 * This app has NO user authentication. Instead:
 * 1. Every POST must be same-origin JSON (blocks cross-site form/fetch CSRF and
 *    forces a CORS preflight that Next does not answer).
 * 2. While live credentials are active (PayPal sandbox and/or LLM key), every
 *    API request must arrive over loopback (Host header 127.0.0.1 / localhost /
 *    [::1], and any X-Forwarded-For hop must be loopback too). This also blocks
 *    DNS rebinding. Hosted platforms are refused earlier in config.ts.
 * 3. A per-browser HttpOnly session cookie binds pending actions to the browser
 *    that proposed them (ownership, not identity).
 *
 * The header checks are defence in depth only: Host and X-Forwarded-For can be
 * forged by any client that reaches the port. The primary control is the bind
 * address: `npm run dev` / `npm start` go through scripts/serve.sh, which binds
 * 127.0.0.1, and config.ts honours credentials only when IC_BIND_HOST is
 * loopback (see isLoopbackBind).
 */
import { randomUUID } from "node:crypto";
import { liveCredentialsActive } from "./config";

export const SESSION_COOKIE = "ic_sid";

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

function stripPort(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0];
}

export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = stripPort(host);
  return h === "localhost" || h === "[::1]" || h === "::1" || /^127(?:\.\d{1,3}){3}$/.test(h);
}

function isLoopbackAddr(addr: string): boolean {
  const a = addr.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    a === "::1" ||
    a === "localhost" ||
    /^127(?:\.\d{1,3}){3}$/.test(a) ||
    /^::ffff:127(?:\.\d{1,3}){3}$/.test(a)
  );
}

export function isLoopbackRequest(req: Request): boolean {
  if (!isLoopbackHost(req.headers.get("host"))) return false;
  const xff = req.headers.get("x-forwarded-for");
  if (xff && !xff.split(",").every((hop) => isLoopbackAddr(hop))) return false;
  return true;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const o = new URL(origin);
      const host = req.headers.get("host");
      if (!host || o.host.toLowerCase() !== host.toLowerCase()) return false;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  return true;
}

/** Returns an error Response, or null when the request may proceed. */
export function guardRequest(req: Request, opts: { mutation: boolean }): Response | null {
  if (opts.mutation) {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("application/json")) {
      return json(415, { status: "error", code: "unsupported_media_type", error: "Content-Type must be application/json." });
    }
    if (!sameOrigin(req)) {
      return json(403, { status: "error", code: "cross_origin", error: "Cross-origin requests are not allowed." });
    }
  }
  if (liveCredentialsActive() && !isLoopbackRequest(req)) {
    return json(403, {
      status: "error",
      code: "live_mode_local_only",
      error:
        "Live credentials are configured, so this API only accepts loopback requests (127.0.0.1 / localhost). Use DEMO_MODE=true for a public demo.",
    });
  }
  return null;
}

/** Never throws: malformed values (bad percent-encoding, oversized) count as absent. */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header || header.length > 8192) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k !== name) continue;
    const raw = rest.join("=");
    if (raw.length > 200) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Existing valid session id from the cookie, if any. */
export function getSessionId(req: Request): string | undefined {
  const v = readCookie(req, SESSION_COOKIE);
  return v && SID_RE.test(v) ? v : undefined;
}

/** Session id for this browser; `setCookie` is present when a new one was minted. */
export function ensureSession(req: Request): { id: string; setCookie?: string } {
  const existing = getSessionId(req);
  if (existing) return { id: existing };
  const id = randomUUID();
  const secure =
    (req.headers.get("x-forwarded-proto") || "").includes("https") || req.url.startsWith("https:");
  const cookie = `${SESSION_COOKIE}=${id}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? "; Secure" : ""}`;
  return { id, setCookie: cookie };
}

export function withCookie(res: Response, setCookie?: string): Response {
  if (setCookie) res.headers.append("Set-Cookie", setCookie);
  return res;
}

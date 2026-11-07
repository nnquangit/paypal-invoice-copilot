/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";
import { __setToolkitFactoryForTests, resetPayPalCaches } from "../src/lib/paypal-tools";
import { resetStore } from "../src/lib/mock-store";

/** Fake, obviously-not-real values. Nothing here reaches a network. */
export const FAKE = {
  clientId: "test-paypal-client-id-not-real",
  clientSecret: "test-paypal-secret-not-real",
  llmKey: "gsk_testFakeKeyNotReal0123456789",
};

/** Credential-isolated baseline: no real creds, no hosted markers. */
export function isolateEnv(extra: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  const base: Record<string, string> = {
    PAYPAL_CLIENT_ID: "",
    PAYPAL_CLIENT_SECRET: "",
    PAYPAL_ENVIRONMENT: "",
    LLM_API_KEY: "",
    LLM_BASE_URL: "",
    LLM_MODEL: "",
    DEMO_MODE: "false",
    FORCE_DEMO_AGENT: "false",
    VERCEL: "",
    RENDER: "",
    // What scripts/serve.sh exports for `npm run dev` / `npm start`.
    IC_BIND_HOST: "127.0.0.1",
    ...extra,
  };
  for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v);
}

export function liveSandboxEnv(extra: Record<string, string> = {}) {
  isolateEnv({
    PAYPAL_CLIENT_ID: FAKE.clientId,
    PAYPAL_CLIENT_SECRET: FAKE.clientSecret,
    PAYPAL_ENVIRONMENT: "sandbox",
    ...extra,
  });
}

type Impl = (args: any) => unknown;

export function makeToolkit(overrides: Record<string, Impl> = {}) {
  const calls: Record<string, any[]> = {};
  const impls: Record<string, Impl> = {
    generate_invoice_number: () => JSON.stringify({ invoice_number: "0001" }),
    create_invoice: () =>
      JSON.stringify({ href: "https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-LIVE-0001" }),
    get_invoice: (a) => JSON.stringify({ id: a.invoice_id, status: "SENT", detail: { invoice_number: "0042" } }),
    list_invoices: () => JSON.stringify({ items: [] }),
    send_invoice: () => JSON.stringify({ href: "https://www.sandbox.paypal.com/invoice/p/#INV2-LIVE-0001" }),
    send_invoice_reminder: () => JSON.stringify({}),
    cancel_sent_invoice: () => JSON.stringify({}),
    ...overrides,
  };
  const tools: Record<string, any> = {};
  for (const [name, impl] of Object.entries(impls)) {
    tools[name] = {
      execute: async (args: any) => {
        (calls[name] ||= []).push(args);
        return impl(args);
      },
    };
  }
  const state = { factoryCalls: 0 };
  const factory = async () => {
    state.factoryCalls += 1;
    return tools;
  };
  return { tools, calls, factory, state };
}

export function resetAll(toolkit?: ReturnType<typeof makeToolkit>) {
  resetStore();
  resetPayPalCaches();
  __setToolkitFactoryForTests(
    toolkit
      ? toolkit.factory
      : async () => {
          throw new Error("no toolkit in this test");
        }
  );
}

export function jsonPost(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, { headers: { host: "localhost:3000", ...headers } });
}

export function cookieFrom(res: Response): string {
  const sc = res.headers.get("set-cookie") || "";
  return sc.split(";")[0];
}

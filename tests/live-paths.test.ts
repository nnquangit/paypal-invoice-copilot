/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PayPal sandbox paths with an injected fake toolkit (no network, fake creds).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET as invoicesGET } from "../src/app/api/invoices/route";
import { GET as healthGET } from "../src/app/api/health/route";
import { POST as chatPOST } from "../src/app/api/chat/route";
import { POST as confirmPOST } from "../src/app/api/confirm/route";
import { executePendingAction, getInvoiceTools, probeCacheSize, probePayPalInvoicing } from "../src/lib/paypal-tools";
import * as mock from "../src/lib/mock-store";
import { getPendingRecord } from "../src/lib/pending";
import { FAKE, get, jsonPost, liveSandboxEnv, makeToolkit, resetAll } from "./helpers";

const OWNER = "00000000-0000-4000-8000-0000000000c1";
const opts = { toolCallId: "t", messages: [] };
const createArgs = {
  recipient_email: "buyer@example.com",
  recipient_business: "Acme Sandbox LLC",
  items: [
    { name: "Logo", quantity: 2, unit_price: 100 },
    { name: "Hours", quantity: 3, unit_price: 50.5 },
  ],
};

afterEach(() => vi.unstubAllEnvs());

describe("live create / send with stubbed PayPal sandbox", () => {
  let tk: ReturnType<typeof makeToolkit>;
  beforeEach(() => {
    liveSandboxEnv();
    tk = makeToolkit();
    resetAll(tk);
  });

  it("desk total sums quantity × price over all lines and is tagged paypal-sandbox", async () => {
    const { tools, source } = await getInvoiceTools({ owner: OWNER });
    expect(source).toBe("paypal-sandbox");
    expect(Object.keys(tools)).not.toContain("confirm_pending_action");
    const r = await tools.create_invoice.execute(createArgs, opts);
    expect(r.status).toBe("draft_created_live");
    expect(r.invoice.amount.value).toBe("351.50");
    expect(r.invoice.source).toBe("paypal-sandbox");
    expect(tk.calls.create_invoice[0].items).toHaveLength(2);
  });

  it("send runs on PayPal only after confirm, exactly once", async () => {
    const { tools } = await getInvoiceTools({ owner: OWNER });
    const created = await tools.create_invoice.execute(createArgs, opts);
    const proposed = await tools.send_invoice.execute({ invoice_id: created.invoice.id }, opts);
    expect(tk.calls.send_invoice).toBeUndefined();
    const first = await executePendingAction(proposed.pending_action_id, OWNER);
    expect(first.httpStatus).toBe(200);
    expect(first.body).toMatchObject({ status: "sent", source: "paypal-sandbox", paypal_live: true });
    const second = await executePendingAction(proposed.pending_action_id, OWNER);
    expect(second.httpStatus).toBe(409);
    expect(tk.calls.send_invoice).toHaveLength(1);
  });

  async function proposeSend(toolkit: ReturnType<typeof makeToolkit>) {
    resetAll(toolkit);
    const { tools } = await getInvoiceTools({ owner: OWNER });
    const created = await tools.create_invoice.execute(createArgs, opts);
    const p = await tools.send_invoice.execute({ invoice_id: created.invoice.id }, opts);
    return { invoiceId: created.invoice.id as string, pendingId: p.pending_action_id as string };
  }

  it("PayPal 4xx on send → definite terminal failure (502), not faked as local success", async () => {
    tk = makeToolkit({ send_invoice: () => JSON.stringify({ ok: false, status: 422, message: "INVALID_INVOICE" }) });
    const { invoiceId, pendingId } = await proposeSend(tk);
    const r = await executePendingAction(pendingId, OWNER);
    expect(r.httpStatus).toBe(502);
    expect(r.body).toMatchObject({ status: "error", code: "paypal_rejected", retryable: false });
    expect(r.body).not.toHaveProperty("invoice");
    expect(mock.getInvoice(invoiceId)?.status).toBe("DRAFT");
    expect(getPendingRecord(pendingId)?.state).toBe("failed");
    expect((await executePendingAction(pendingId, OWNER)).body).toMatchObject({ code: "failed" });
    expect(tk.calls.send_invoice).toHaveLength(1);
  });

  it("network throw after dispatch → outcome_unknown, NOT retried, user told to reconcile", async () => {
    tk = makeToolkit({
      send_invoice: () => {
        throw new Error(`socket hang up client_secret=${FAKE.clientSecret}`);
      },
    });
    const { invoiceId, pendingId } = await proposeSend(tk);
    const r1 = await executePendingAction(pendingId, OWNER);
    expect(r1.httpStatus).toBe(502);
    expect(r1.body).toMatchObject({ code: "outcome_unknown", retryable: false, reconcile: true });
    expect(String(r1.body.error)).toMatch(/Check the invoice in the PayPal sandbox dashboard/);
    expect(JSON.stringify(r1.body)).not.toContain(FAKE.clientSecret);
    expect(getPendingRecord(pendingId)?.state).toBe("outcome_unknown");
    // a second Confirm does not dispatch again
    const r2 = await executePendingAction(pendingId, OWNER);
    expect(r2.httpStatus).toBe(409);
    expect(r2.body).toMatchObject({ code: "outcome_unknown" });
    expect(tk.calls.send_invoice).toHaveLength(1);
    expect(mock.getInvoice(invoiceId)?.status).toBe("DRAFT");
  });

  it("PayPal 5xx / status-less error → outcome_unknown (ambiguous), not retried", async () => {
    for (const payload of [{ ok: false, status: 503, message: "upstream" }, { ok: false, message: "fetch failed" }]) {
      tk = makeToolkit({ send_invoice: () => JSON.stringify(payload) });
      const { pendingId } = await proposeSend(tk);
      const r = await executePendingAction(pendingId, OWNER);
      expect(r.body).toMatchObject({ code: "outcome_unknown", retryable: false });
      expect((await executePendingAction(pendingId, OWNER)).httpStatus).toBe(409);
      expect(tk.calls.send_invoice).toHaveLength(1);
    }
  });

  it("pre-dispatch failure (tool missing) is retryable; later success runs once", async () => {
    tk = makeToolkit();
    const { pendingId } = await proposeSend(tk);
    const realSend = tk.tools.send_invoice;
    delete tk.tools.send_invoice;
    const r1 = await executePendingAction(pendingId, OWNER);
    expect(r1.httpStatus).toBe(503);
    expect(r1.body).toMatchObject({ code: "paypal_unavailable", retryable: true });
    expect(getPendingRecord(pendingId)?.state).toBe("pending");
    tk.tools.send_invoice = realSend;
    expect((await executePendingAction(pendingId, OWNER)).httpStatus).toBe(200);
    expect((await executePendingAction(pendingId, OWNER)).httpStatus).toBe(409);
    expect(tk.calls.send_invoice).toHaveLength(1);
  });
});

describe("no silent fake-success fallback", () => {
  beforeEach(() => liveSandboxEnv());

  it("live create NOT_AUTHORIZED returns an error and creates no local draft", async () => {
    const tk = makeToolkit({
      create_invoice: () => JSON.stringify({ ok: false, status: 403, message: "NOT_AUTHORIZED" }),
    });
    resetAll(tk);
    const before = mock.listInvoices().total;
    const { tools } = await getInvoiceTools({ owner: OWNER });
    const r = await tools.create_invoice.execute(createArgs, opts);
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/No draft was created/);
    expect(mock.listInvoices().total).toBe(before);
  });

  it("probe failure → local mock tools, every result labelled local-mock", async () => {
    const tk = makeToolkit({
      generate_invoice_number: () => JSON.stringify({ ok: false, status: 403, message: "NOT_AUTHORIZED" }),
    });
    resetAll(tk);
    const { tools, source } = await getInvoiceTools({ owner: OWNER });
    expect(source).toBe("local-mock");
    const r = await tools.create_invoice.execute(createArgs, opts);
    expect(r.source).toBe("local-mock");
    expect(r.invoice.id).toMatch(/^INV2-DEMO/);
    expect(tk.calls.create_invoice).toBeUndefined();
  });

  it("confirm on a PayPal invoice while PayPal is down → 503, nothing marked sent", async () => {
    const tk = makeToolkit();
    resetAll(tk);
    const { tools } = await getInvoiceTools({ owner: OWNER });
    const created = await tools.create_invoice.execute(createArgs, opts);
    const p = await tools.send_invoice.execute({ invoice_id: created.invoice.id }, opts);
    // PayPal disappears (e.g. creds removed / environment rejected) before confirm.
    vi.stubEnv("PAYPAL_ENVIRONMENT", "live");
    const r = await executePendingAction(p.pending_action_id, OWNER);
    expect(r.httpStatus).toBe(503);
    expect(r.body).toMatchObject({ code: "paypal_unavailable", retryable: true });
    expect(mock.getInvoice(created.invoice.id)?.status).toBe("DRAFT");
    expect(tk.calls.send_invoice).toBeUndefined();
    // nothing was dispatched, so the action is back to pending
    expect(getPendingRecord(p.pending_action_id)?.state).toBe("pending");
  });

  it("/api/invoices reports PayPal list failure as 502 with no mock rows", async () => {
    const tk = makeToolkit({
      list_invoices: () => {
        throw new Error("upstream down");
      },
    });
    resetAll(tk);
    const res = await invoicesGET(get("/api/invoices"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.source).toBe("paypal-sandbox");
  });

  it("/api/invoices lists PayPal rows with a computed summary", async () => {
    const tk = makeToolkit({
      list_invoices: () =>
        JSON.stringify({
          items: [
            { id: "INV2-A", status: "SENT", amount: { currency_code: "USD", value: "10.00" }, detail: { invoice_number: "1" } },
            { id: "INV2-B", status: "PAID", amount: { currency_code: "USD", value: "5.25" }, detail: { invoice_number: "2" } },
          ],
        }),
    });
    resetAll(tk);
    const body = await (await invoicesGET(get("/api/invoices"))).json();
    expect(body.source).toBe("paypal-sandbox");
    expect(body.items.every((i: any) => i.source === "paypal-sandbox")).toBe(true);
    expect(body.summary).toMatchObject({ unpaid_total: "10.00", paid_total: "5.25" });
  });
});

describe("probe cache", () => {
  let tk: ReturnType<typeof makeToolkit>;
  beforeEach(() => {
    liveSandboxEnv();
    tk = makeToolkit();
    resetAll(tk);
  });

  it("reuses a successful probe for 60 s and the toolkit instance", async () => {
    const t0 = Date.now();
    expect((await probePayPalInvoicing(t0)).ok).toBe(true);
    expect((await probePayPalInvoicing(t0 + 1000)).cached).toBe(true);
    await getInvoiceTools({ owner: OWNER });
    expect(tk.calls.generate_invoice_number).toHaveLength(1);
    await probePayPalInvoicing(t0 + 61_000);
    expect(tk.calls.generate_invoice_number).toHaveLength(2);
    expect(tk.state.factoryCalls).toBe(1);
  });

  it("dedupes concurrent probes and stays bounded across credential rotations", async () => {
    await Promise.all([probePayPalInvoicing(), probePayPalInvoicing(), probePayPalInvoicing()]);
    expect(tk.calls.generate_invoice_number).toHaveLength(1);
    for (let i = 0; i < 10; i++) {
      vi.stubEnv("PAYPAL_CLIENT_ID", `${FAKE.clientId}-${i}`);
      await probePayPalInvoicing();
    }
    expect(probeCacheSize()).toBeLessThanOrEqual(4);
  });
});

describe("live mode is loopback-only", () => {
  beforeEach(() => {
    liveSandboxEnv();
    resetAll(makeToolkit());
  });

  const body = { messages: [{ role: "user", content: "hi" }] };

  it("rejects non-loopback Host, forwarded remote clients and DNS-rebinding hosts", async () => {
    const cases: Record<string, string>[] = [
      { host: "invoice.example.com" },
      { host: "localhost:3000", "x-forwarded-for": "203.0.113.9" },
      { host: "attacker.example:3000" },
    ];
    for (const headers of cases) {
      const res = await chatPOST(jsonPost("/api/chat", body, headers));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("live_mode_local_only");
    }
    expect((await confirmPOST(jsonPost("/api/confirm", { pending_action_id: "x", confirmed: true }, { host: "invoice.example.com" }))).status).toBe(403);
    expect((await invoicesGET(get("/api/invoices", { host: "invoice.example.com" }))).status).toBe(403);
  });

  it("remote /api/health does not trigger a PayPal probe", async () => {
    const tk = makeToolkit();
    resetAll(tk);
    const res = await healthGET(get("/api/health", { host: "invoice.example.com" }));
    const data = await res.json();
    expect(data.mode.liveAccess).toBe(false);
    expect(tk.calls.generate_invoice_number).toBeUndefined();
  });

  it("loopback requests are served (demo agent path, no LLM key)", async () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      const res = await chatPOST(jsonPost("/api/chat", body, { host }));
      expect(res.status).toBe(200);
    }
  });
});

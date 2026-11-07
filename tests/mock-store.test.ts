import { describe, it, expect, beforeEach } from "vitest";
import {
  resetStore,
  createInvoice,
  sendInvoice,
  remindInvoice,
  cancelInvoice,
  listInvoices,
  summarizeOutstanding,
  generateQr,
  computeInvoiceTotal,
} from "../src/lib/mock-store";
import { createPendingAction, getPendingRecord } from "../src/lib/pending";
import { runDemoAgent } from "../src/lib/demo-agent";
import { executePendingAction } from "../src/lib/paypal-tools";

const OWNER = "00000000-0000-4000-8000-000000000001";

describe("mock PayPal invoice store", () => {
  beforeEach(() => resetStore());

  it("seeds demo invoices tagged local-mock without fake PayPal links", () => {
    const { total, items } = listInvoices();
    expect(total).toBeGreaterThanOrEqual(2);
    expect(items.some((i) => i.status === "SENT")).toBe(true);
    expect(items.every((i) => i.source === "local-mock")).toBe(true);
    expect(items.every((i) => !i.href)).toBe(true);
  });

  it("creates, sends, reminds, cancels", () => {
    const draft = createInvoice({
      recipient_email: "client@example.com",
      recipient_business: "Example Co",
      due_days: 10,
      items: [{ name: "Design", unit_price: 250 }],
    });
    expect(draft.status).toBe("DRAFT");
    expect(draft.amount.value).toBe("250.00");
    expect(draft.source).toBe("local-mock");

    expect(sendInvoice(draft.id).status).toBe("SENT");
    expect(remindInvoice(draft.id).reminder_count).toBe(1);
    expect(cancelInvoice(draft.id).status).toBe("CANCELLED");
  });

  it("totals quantity × unit price over all lines (cents exact)", () => {
    const inv = createInvoice({
      recipient_email: "x@example.com",
      items: [
        { name: "A", quantity: 2, unit_price: "10.10" },
        { name: "B", quantity: "3", unit_price: 0.1 },
        { name: "C", unit_price: 5 },
      ],
    });
    expect(inv.amount.value).toBe("25.50");
    expect(computeInvoiceTotal([{ quantity: 0.5, unit_price: 99.99 }])).toBe("50.00");
    expect(() => computeInvoiceTotal([{ quantity: 0, unit_price: 1 }])).toThrow(/quantity/);
    expect(() => computeInvoiceTotal([{ quantity: 1, unit_price: -1 }])).toThrow(/negative/);
  });

  it("summarizes outstanding", () => {
    const s = summarizeOutstanding();
    expect(Number(s.unpaid_total)).toBeGreaterThan(0);
    expect(s.currencies).toEqual(["USD"]);
  });

  it("QR is an explicitly labelled placeholder", () => {
    const inv = listInvoices().items[0];
    const qr = generateQr(inv.id);
    expect(qr.placeholder).toBe(true);
    expect(qr.note).toMatch(/not a scannable/i);
    expect(Buffer.from(qr.data_url.split(",")[1], "base64").toString()).toMatch(/PLACEHOLDER/);
  });
});

describe("demo agent", () => {
  beforeEach(() => resetStore());

  it("creates a local mock draft from natural language and only proposes sending", async () => {
    const result = await runDemoAgent(
      "Invoice Acme Corp $500 for logo design, due in 14 days, remind them in 3 days if unpaid",
      { owner: OWNER }
    );
    expect(result.text).toMatch(/Draft created in the \*\*local mock desk\*\*/);
    expect(result.text).not.toMatch(/Draft created on PayPal/);
    expect(result.pendingAction?.tool).toBe("send_invoice");
    expect(getPendingRecord(result.pendingAction!.id)?.state).toBe("pending");
  });

  it("summarizes who owes what", async () => {
    const result = await runDemoAgent("Who owes me money?", { owner: OWNER });
    expect(result.text).toMatch(/Unpaid/i);
    expect(result.text).toMatch(/no PayPal call/);
  });

  it("executes confirmed pending send once for the owner", async () => {
    const draft = createInvoice({ recipient_email: "a@b.com", items: [{ name: "Work", unit_price: 10 }] });
    const pending = createPendingAction({ tool: "send_invoice", invoice_id: draft.id, summary: "Send test", owner: OWNER });
    const first = await executePendingAction(pending.id, OWNER);
    expect(first.httpStatus).toBe(200);
    expect(first.body).toMatchObject({ status: "sent", source: "local-mock" });
    const second = await executePendingAction(pending.id, OWNER);
    expect(second.httpStatus).toBe(409);
    expect(second.body).toMatchObject({ code: "already_executed" });
  });
});

describe("demo agent end-to-end flow", () => {
  beforeEach(() => resetStore());

  it("create → confirm send → remind → QR → cancel", async () => {
    const created = await runDemoAgent("Invoice Bluebird LLC $1,200 for website redesign, due in 30 days", { owner: OWNER });
    expect(created.pendingAction?.tool).toBe("send_invoice");
    const num = created.text.match(/INV-\d+/)?.[0];
    expect(num).toBeTruthy();
    expect((await executePendingAction(created.pendingAction!.id, OWNER)).body).toMatchObject({ status: "sent" });

    const remind = await runDemoAgent("Remind Bluebird about their invoice", { owner: OWNER });
    expect(remind.pendingAction?.tool).toBe("send_invoice_reminder");
    expect((await executePendingAction(remind.pendingAction!.id, OWNER)).body).toMatchObject({ status: "reminded" });

    const qr = await runDemoAgent(`Show QR for ${num}`, { owner: OWNER });
    expect(qr.text).toMatch(/Placeholder/);
    expect(qr.text).toMatch(/not a scannable/);

    const cancel = await runDemoAgent(`Cancel invoice ${num}`, { owner: OWNER });
    expect(cancel.pendingAction?.tool).toBe("cancel_sent_invoice");
    expect((await executePendingAction(cancel.pendingAction!.id, OWNER)).body).toMatchObject({ status: "cancelled" });
  });

  it("greets and lists unpaid", async () => {
    const hi = await runDemoAgent("hello", { owner: OWNER });
    expect(hi.text).toMatch(/Invoice Copilot/i);
    const list = await runDemoAgent("List my unpaid invoices", { owner: OWNER });
    expect(list.text).toMatch(/INV-1001|Acme/i);
  });
});

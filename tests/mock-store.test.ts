import { describe, it, expect, beforeEach } from "vitest";
import {
  resetStore,
  createInvoice,
  sendInvoice,
  remindInvoice,
  cancelInvoice,
  listInvoices,
  summarizeOutstanding,
  createPendingAction,
  consumePendingAction,
  generateQr,
} from "../src/lib/mock-store";
import { runDemoAgent } from "../src/lib/demo-agent";
import { executePendingAction } from "../src/lib/paypal-tools";

describe("mock PayPal invoice store", () => {
  beforeEach(() => resetStore());

  it("seeds demo invoices", () => {
    const { total, items } = listInvoices();
    expect(total).toBeGreaterThanOrEqual(2);
    expect(items.some((i) => i.status === "SENT")).toBe(true);
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

    const sent = sendInvoice(draft.id);
    expect(sent.status).toBe("SENT");

    const reminded = remindInvoice(draft.id);
    expect(reminded.reminder_count).toBe(1);

    const cancelled = cancelInvoice(draft.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("summarizes outstanding", () => {
    const s = summarizeOutstanding();
    expect(Number(s.unpaid_total)).toBeGreaterThan(0);
  });

  it("generates QR placeholder", () => {
    const inv = listInvoices().items[0];
    const qr = generateQr(inv.id);
    expect(qr.data_url.startsWith("data:image/svg+xml")).toBe(true);
  });
});

describe("demo agent", () => {
  beforeEach(() => resetStore());

  it("creates invoice from natural language and asks confirmation", async () => {
    const result = await runDemoAgent(
      "Invoice Acme Corp $500 for logo design, due in 14 days, remind them in 3 days if unpaid"
    );
    expect(result.text).toMatch(/Draft created/i);
    expect(result.pendingAction?.tool).toBe("send_invoice");
  });

  it("summarizes who owes what", async () => {
    const result = await runDemoAgent("Who owes me money?");
    expect(result.text).toMatch(/Unpaid/i);
  });

  it("executes confirmed pending send", async () => {
    const draft = createInvoice({
      recipient_email: "a@b.com",
      items: [{ name: "Work", unit_price: 10 }],
    });
    const pending = createPendingAction(
      "send_invoice",
      draft.id,
      "Send test"
    );
    const result = await executePendingAction(pending.id);
    expect(result).toMatchObject({ status: "sent" });
    expect(consumePendingAction(pending.id)).toBeUndefined();
  });
});

describe("demo agent end-to-end flow", () => {
  beforeEach(() => resetStore());

  it("create → confirm send → remind → QR → cancel", async () => {
    const created = await runDemoAgent(
      "Invoice Bluebird LLC $1,200 for website redesign, due in 30 days"
    );
    expect(created.pendingAction?.tool).toBe("send_invoice");
    const num = created.text.match(/INV-\d+/)?.[0];
    expect(num).toBeTruthy();
    const sendResult = await executePendingAction(created.pendingAction!.id);
    expect(sendResult).toMatchObject({ status: "sent" });

    const remind = await runDemoAgent("Remind Bluebird about their invoice");
    expect(remind.pendingAction?.tool).toBe("send_invoice_reminder");
    const remindResult = await executePendingAction(remind.pendingAction!.id);
    expect(remindResult).toMatchObject({ status: "reminded" });

    const qr = await runDemoAgent(`Show QR for ${num}`);
    expect(qr.text).toMatch(/QR ready/i);

    const cancel = await runDemoAgent(`Cancel invoice ${num}`);
    expect(cancel.pendingAction?.tool).toBe("cancel_sent_invoice");
    const cancelResult = await executePendingAction(cancel.pendingAction!.id);
    expect(cancelResult).toMatchObject({ status: "cancelled" });
  });

  it("greets and lists unpaid", async () => {
    const hi = await runDemoAgent("hello");
    expect(hi.text).toMatch(/Invoice Copilot/i);
    const list = await runDemoAgent("List my unpaid invoices");
    expect(list.text).toMatch(/INV-1001|Acme/i);
  });
});

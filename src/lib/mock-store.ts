import type { Invoice, InvoiceItem, PendingAction } from "./types";
import { MERCHANT } from "./config";

const globalStore = globalThis as unknown as {
  __invoiceStore?: Map<string, Invoice>;
  __pendingActions?: Map<string, PendingAction>;
  __invoiceSeq?: number;
};

function store(): Map<string, Invoice> {
  if (!globalStore.__invoiceStore) {
    globalStore.__invoiceStore = new Map();
    seed();
  }
  return globalStore.__invoiceStore;
}

function pending(): Map<string, PendingAction> {
  if (!globalStore.__pendingActions) {
    globalStore.__pendingActions = new Map();
  }
  return globalStore.__pendingActions;
}

function nextNumber(): string {
  globalStore.__invoiceSeq = (globalStore.__invoiceSeq || 1000) + 1;
  return `INV-${globalStore.__invoiceSeq}`;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function seed() {
  const now = new Date();
  const due = new Date(now);
  due.setDate(due.getDate() + 14);
  const items: InvoiceItem[] = [
    {
      name: "Brand identity package",
      description: "Logo + style guide",
      quantity: "1",
      unit_amount: { currency_code: "USD", value: "850.00" },
    },
  ];
  const inv: Invoice = {
    id: "INV2-DEMO-ACME-001",
    invoice_number: "INV-1001",
    status: "SENT",
    currency_code: "USD",
    recipient_email: "ap@acmecorp.example",
    recipient_name: "Alex Rivera",
    recipient_business: "Acme Corp",
    note: "Thank you for partnering with Quang Studio.",
    due_date: due.toISOString().slice(0, 10),
    invoice_date: now.toISOString().slice(0, 10),
    items,
    amount: { currency_code: "USD", value: "850.00" },
    href: "https://www.sandbox.paypal.com/invoice/p/#DEMOACME001",
    reminder_count: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  store().set(inv.id, inv);

  const paid: Invoice = {
    id: "INV2-DEMO-PAID-002",
    invoice_number: "INV-1000",
    status: "PAID",
    currency_code: "USD",
    recipient_email: "finance@northwind.example",
    recipient_business: "Northwind Labs",
    note: "Website redesign milestone 1",
    due_date: now.toISOString().slice(0, 10),
    invoice_date: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10),
    items: [
      {
        name: "Website redesign – milestone 1",
        quantity: "1",
        unit_amount: { currency_code: "USD", value: "1200.00" },
      },
    ],
    amount: { currency_code: "USD", value: "1200.00" },
    href: "https://www.sandbox.paypal.com/invoice/p/#DEMOPAID002",
    reminder_count: 1,
    created_at: new Date(now.getTime() - 7 * 86400000).toISOString(),
    updated_at: now.toISOString(),
  };
  store().set(paid.id, paid);
  globalStore.__invoiceSeq = 1010; // next create → INV-1011 (seed uses 1000/1001)
}

function totalOf(items: InvoiceItem[]): string {
  const sum = items.reduce((acc, item) => {
    const q = parseFloat(item.quantity) || 1;
    const p = parseFloat(item.unit_amount.value) || 0;
    return acc + q * p;
  }, 0);
  return sum.toFixed(2);
}

export function listInvoices(opts?: {
  page?: number;
  page_size?: number;
  status?: string;
}): { items: Invoice[]; total: number } {
  let items = Array.from(store().values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  if (opts?.status) {
    items = items.filter((i) => i.status === opts.status);
  }
  const page = opts?.page || 1;
  const size = opts?.page_size || 20;
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), total: items.length };
}

export function getInvoice(invoice_id: string): Invoice | undefined {
  return store().get(invoice_id);
}

export function createInvoice(input: {
  recipient_email: string;
  recipient_name?: string;
  recipient_business?: string;
  currency_code?: string;
  note?: string;
  due_days?: number;
  items: Array<{ name: string; quantity?: number | string; unit_price: number | string; description?: string }>;
}): Invoice {
  const currency = input.currency_code || "USD";
  const items: InvoiceItem[] = input.items.map((it) => ({
    name: it.name,
    description: it.description,
    quantity: String(it.quantity ?? 1),
    unit_amount: {
      currency_code: currency,
      value: Number(it.unit_price).toFixed(2),
    },
  }));
  const now = new Date();
  const due = new Date(now);
  due.setDate(due.getDate() + (input.due_days ?? 14));
  const id = nextId("INV2-DEMO");
  const inv: Invoice = {
    id,
    invoice_number: nextNumber(),
    status: "DRAFT",
    currency_code: currency,
    recipient_email: input.recipient_email,
    recipient_name: input.recipient_name,
    recipient_business: input.recipient_business,
    note: input.note || `Invoice from ${MERCHANT.business_name}`,
    due_date: due.toISOString().slice(0, 10),
    invoice_date: now.toISOString().slice(0, 10),
    items,
    amount: { currency_code: currency, value: totalOf(items) },
    href: `https://www.sandbox.paypal.com/invoice/p/#${id.replace(/-/g, "")}`,
    reminder_count: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  store().set(id, inv);
  return inv;
}

export function sendInvoice(invoice_id: string): Invoice {
  const inv = mustGet(invoice_id);
  if (inv.status !== "DRAFT" && inv.status !== "SCHEDULED") {
    throw new Error(`Invoice ${invoice_id} cannot be sent from status ${inv.status}`);
  }
  inv.status = "SENT";
  inv.updated_at = new Date().toISOString();
  store().set(invoice_id, inv);
  return inv;
}

export function remindInvoice(invoice_id: string): Invoice {
  const inv = mustGet(invoice_id);
  if (inv.status !== "SENT" && inv.status !== "UNPAID" && inv.status !== "PARTIALLY_PAID") {
    throw new Error(`Cannot remind invoice in status ${inv.status}`);
  }
  inv.reminder_count += 1;
  inv.updated_at = new Date().toISOString();
  store().set(invoice_id, inv);
  return inv;
}

export function cancelInvoice(invoice_id: string): Invoice {
  const inv = mustGet(invoice_id);
  if (inv.status === "PAID" || inv.status === "CANCELLED") {
    throw new Error(`Cannot cancel invoice in status ${inv.status}`);
  }
  inv.status = "CANCELLED";
  inv.updated_at = new Date().toISOString();
  store().set(invoice_id, inv);
  return inv;
}

export function generateQr(invoice_id: string): { invoice_id: string; data_url: string; href: string } {
  const inv = mustGet(invoice_id);
  // Simple SVG QR placeholder (demo) — real PayPal returns a PNG QR for the payment link
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
  <rect width="180" height="180" fill="#fff"/>
  <rect x="16" y="16" width="40" height="40" fill="#003087"/>
  <rect x="124" y="16" width="40" height="40" fill="#003087"/>
  <rect x="16" y="124" width="40" height="40" fill="#003087"/>
  <rect x="70" y="70" width="40" height="40" fill="#009cde"/>
  <text x="90" y="175" text-anchor="middle" font-size="10" fill="#003087">PayPal QR</text>
</svg>`;
  const data_url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  inv.qr_code_data_url = data_url;
  inv.updated_at = new Date().toISOString();
  store().set(invoice_id, inv);
  return { invoice_id, data_url, href: inv.href || "" };
}

export function summarizeOutstanding(): {
  unpaid_count: number;
  unpaid_total: string;
  paid_total: string;
  draft_count: number;
  by_recipient: Array<{ email: string; amount: string; status: string; id: string }>;
} {
  const items = Array.from(store().values());
  const outstanding = items.filter((i) =>
    ["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"].includes(i.status)
  );
  const paid = items.filter((i) => i.status === "PAID" || i.status === "MARKED_AS_PAID");
  const drafts = items.filter((i) => i.status === "DRAFT");
  const unpaid_total = outstanding
    .reduce((a, i) => a + parseFloat(i.amount.value), 0)
    .toFixed(2);
  const paid_total = paid.reduce((a, i) => a + parseFloat(i.amount.value), 0).toFixed(2);
  return {
    unpaid_count: outstanding.length,
    unpaid_total,
    paid_total,
    draft_count: drafts.length,
    by_recipient: outstanding.map((i) => ({
      email: i.recipient_email,
      amount: `${i.amount.currency_code} ${i.amount.value}`,
      status: i.status,
      id: i.id,
    })),
  };
}

export function createPendingAction(
  tool: PendingAction["tool"],
  invoice_id: string,
  summary: string,
  args: Record<string, unknown> = {}
): PendingAction {
  const action: PendingAction = {
    id: nextId("pending"),
    tool,
    invoice_id,
    summary,
    args,
    created_at: new Date().toISOString(),
  };
  pending().set(action.id, action);
  return action;
}

export function getPendingAction(id: string): PendingAction | undefined {
  return pending().get(id);
}

export function consumePendingAction(id: string): PendingAction | undefined {
  const a = pending().get(id);
  if (a) pending().delete(id);
  return a;
}

function mustGet(id: string): Invoice {
  const inv = store().get(id);
  if (!inv) throw new Error(`Invoice not found: ${id}`);
  return inv;
}

export function resetStore() {
  globalStore.__invoiceStore = new Map();
  globalStore.__pendingActions = new Map();
  globalStore.__invoiceSeq = 1000;
  seed();
}

/**
 * Local in-memory invoice desk ("local-mock"). Nothing here calls PayPal or
 * emails anyone. Rows created by the live PayPal sandbox path are cached here
 * too, tagged `source: "paypal-sandbox"`. Single process only; lost on restart.
 */
import type { Invoice, InvoiceItem } from "./types";
import { MERCHANT } from "./config";
import { resetPending } from "./pending";

const globalStore = globalThis as unknown as {
  __invoiceStore?: Map<string, Invoice>;
  __invoiceSeq?: number;
};

function store(): Map<string, Invoice> {
  if (!globalStore.__invoiceStore) {
    globalStore.__invoiceStore = new Map();
    seed();
  }
  return globalStore.__invoiceStore;
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
    items: [
      {
        name: "Brand identity package",
        description: "Logo + style guide",
        quantity: "1",
        unit_amount: { currency_code: "USD", value: "850.00" },
      },
    ],
    amount: { currency_code: "USD", value: "850.00" },
    reminder_count: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    source: "local-mock",
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
    reminder_count: 1,
    created_at: new Date(now.getTime() - 7 * 86400000).toISOString(),
    updated_at: now.toISOString(),
    source: "local-mock",
  };
  store().set(paid.id, paid);
  globalStore.__invoiceSeq = 1010; // next create → INV-1011 (seed uses 1000/1001)
}

function toCents(v: string | number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${v}`);
  return Math.round(n * 100);
}

/** Sum of quantity × unit price over ALL lines, in integer cents (no float drift). */
export function computeInvoiceTotal(
  items: Array<{ quantity?: string | number; unit_price?: string | number; unit_amount?: { value: string } }>
): string {
  let cents = 0;
  for (const it of items) {
    const q = Number(it.quantity ?? 1);
    if (!Number.isFinite(q) || q <= 0) throw new Error(`Invalid quantity: ${it.quantity}`);
    const unit = toCents(it.unit_amount ? it.unit_amount.value : (it.unit_price ?? 0));
    if (unit < 0) throw new Error("Unit price cannot be negative");
    cents += Math.round(q * unit);
  }
  return (cents / 100).toFixed(2);
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
  const page = Math.max(1, Math.floor(Number(opts?.page) || 1));
  const size = Math.min(100, Math.max(1, Math.floor(Number(opts?.page_size) || 20)));
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), total: items.length };
}

export function getInvoice(invoice_id: string): Invoice | undefined {
  return store().get(invoice_id);
}

/** Local-mock rows (source local-mock or the INV2-DEMO id prefix) never reach PayPal. */
export function isLocalMockInvoice(invoice_id: string): boolean {
  const inv = store().get(invoice_id);
  if (inv) return inv.source !== "paypal-sandbox";
  return String(invoice_id).startsWith("INV2-DEMO");
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
  store(); // ensure seed + invoice sequence are initialized before nextNumber()
  if (!input.items?.length) throw new Error("At least one line item is required");
  const currency = (input.currency_code || "USD").toUpperCase();
  const items: InvoiceItem[] = input.items.map((it) => ({
    name: it.name,
    description: it.description,
    quantity: String(it.quantity ?? 1),
    unit_amount: {
      currency_code: currency,
      value: (toCents(it.unit_price) / 100).toFixed(2),
    },
  }));
  const total = computeInvoiceTotal(items);
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
    amount: { currency_code: currency, value: total },
    // No payment link: a local mock invoice has no PayPal page.
    reminder_count: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    source: "local-mock",
  };
  store().set(id, inv);
  return inv;
}

export function upsertLiveInvoice(inv: Invoice): Invoice {
  const row = { ...inv, source: "paypal-sandbox" as const };
  store().set(row.id, row);
  return row;
}

export function markInvoiceStatus(invoice_id: string, status: Invoice["status"], href?: string): Invoice | undefined {
  const inv = store().get(invoice_id);
  if (!inv) return undefined;
  inv.status = status;
  if (href) inv.href = href;
  inv.updated_at = new Date().toISOString();
  store().set(invoice_id, inv);
  return inv;
}

/** Thrown for a state-machine violation (maps to HTTP 409). */
export class InvoiceStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceStateError";
  }
}

export class InvoiceNotFoundError extends Error {
  constructor(id: string) {
    super(`Invoice not found: ${id}`);
    this.name = "InvoiceNotFoundError";
  }
}

export function sendInvoice(invoice_id: string): Invoice {
  const inv = mustGet(invoice_id);
  if (inv.status !== "DRAFT" && inv.status !== "SCHEDULED") {
    throw new InvoiceStateError(`Invoice ${inv.invoice_number} cannot be sent from status ${inv.status}`);
  }
  inv.status = "SENT";
  inv.updated_at = new Date().toISOString();
  store().set(invoice_id, inv);
  return inv;
}

export function remindInvoice(invoice_id: string): Invoice {
  const inv = mustGet(invoice_id);
  if (inv.status !== "SENT" && inv.status !== "UNPAID" && inv.status !== "PARTIALLY_PAID") {
    throw new InvoiceStateError(`Cannot remind invoice ${inv.invoice_number} in status ${inv.status}`);
  }
  inv.reminder_count += 1;
  inv.updated_at = new Date().toISOString();
  store().set(invoice_id, inv);
  return inv;
}

export function cancelInvoice(invoice_id: string): Invoice {
  const inv = mustGet(invoice_id);
  if (inv.status === "PAID" || inv.status === "CANCELLED") {
    throw new InvoiceStateError(`Cannot cancel invoice ${inv.invoice_number} in status ${inv.status}`);
  }
  inv.status = "CANCELLED";
  inv.updated_at = new Date().toISOString();
  store().set(invoice_id, inv);
  return inv;
}

/**
 * PLACEHOLDER graphic only. It is NOT a scannable QR code and encodes nothing;
 * this app never calls PayPal's generate-qr-code API.
 */
export function generateQr(invoice_id: string): {
  invoice_id: string;
  data_url: string;
  href: string;
  placeholder: true;
  note: string;
} {
  const inv = mustGet(invoice_id);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
  <rect width="180" height="180" fill="#fff"/>
  <rect x="16" y="16" width="40" height="40" fill="#003087"/>
  <rect x="124" y="16" width="40" height="40" fill="#003087"/>
  <rect x="16" y="124" width="40" height="40" fill="#003087"/>
  <rect x="70" y="70" width="40" height="40" fill="#009cde"/>
  <text x="90" y="150" text-anchor="middle" font-size="11" font-weight="bold" fill="#b45309">PLACEHOLDER</text>
  <text x="90" y="170" text-anchor="middle" font-size="10" fill="#003087">not a scannable QR</text>
</svg>`;
  const data_url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  inv.qr_code_data_url = data_url;
  inv.updated_at = new Date().toISOString();
  store().set(invoice_id, inv);
  return {
    invoice_id,
    data_url,
    href: inv.href || "",
    placeholder: true,
    note: "Placeholder image — not a scannable QR code. PayPal's QR API is not called by this app.",
  };
}

export type InvoiceSummary = {
  unpaid_count: number;
  unpaid_total: string;
  paid_total: string;
  draft_count: number;
  currencies: string[];
  by_recipient: Array<{ email: string; amount: string; status: string; id: string }>;
};

/** Summary over any invoice list (desk or PayPal), cents arithmetic. */
export function summarizeInvoices(items: Invoice[]): InvoiceSummary {
  const outstanding = items.filter((i) =>
    ["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"].includes(i.status)
  );
  const paid = items.filter((i) => i.status === "PAID" || i.status === "MARKED_AS_PAID");
  const drafts = items.filter((i) => i.status === "DRAFT");
  const sum = (list: Invoice[]) =>
    (list.reduce((a, i) => a + (Math.round(Number(i.amount.value) * 100) || 0), 0) / 100).toFixed(2);
  return {
    unpaid_count: outstanding.length,
    unpaid_total: sum(outstanding),
    paid_total: sum(paid),
    draft_count: drafts.length,
    currencies: [...new Set(items.map((i) => i.amount.currency_code))],
    by_recipient: outstanding.map((i) => ({
      email: i.recipient_email,
      amount: `${i.amount.currency_code} ${i.amount.value}`,
      status: i.status,
      id: i.id,
    })),
  };
}

export function summarizeOutstanding(): InvoiceSummary {
  return summarizeInvoices(Array.from(store().values()));
}

function mustGet(id: string): Invoice {
  const inv = store().get(id);
  if (!inv) throw new InvoiceNotFoundError(id);
  return inv;
}

export function resetStore() {
  globalStore.__invoiceStore = new Map();
  globalStore.__invoiceSeq = 1000;
  resetPending();
  seed();
}

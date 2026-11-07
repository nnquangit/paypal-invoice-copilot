/**
 * Deterministic demo agent — works with zero LLM credentials.
 * Parses common freelancer invoice intents and drives the mock/live tools.
 */
import { formatInvoice } from "./paypal-tools";
import * as mock from "./mock-store";
import { createPendingAction } from "./pending";
import type { PendingAction } from "./types";

const LOCAL_NOTE = "_Built-in demo agent · local mock desk: no PayPal call, no email is sent._";

export interface DemoAgentResult {
  text: string;
  pendingAction?: PendingAction;
}

function extractEmail(text: string): string | undefined {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m?.[0];
}

function extractMoney(text: string): number | undefined {
  const m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:USD|usd|dollars?)/);
  if (!m) return undefined;
  return parseFloat((m[1] || m[2]).replace(/,/g, ""));
}

function extractDueDays(text: string): number {
  const m = text.match(/due\s+in\s+(\d+)\s+days?/i) || text.match(/(\d+)\s+days?\s+due/i);
  if (m) return parseInt(m[1], 10);
  if (/net\s*30/i.test(text)) return 30;
  if (/net\s*15/i.test(text)) return 15;
  if (/net\s*7/i.test(text)) return 7;
  return 14;
}

function extractRemindDays(text: string): number | undefined {
  const m = text.match(/remind(?:\s+them)?(?:\s+in)?\s+(\d+)\s+days?/i);
  return m ? parseInt(m[1], 10) : undefined;
}

function extractBusiness(text: string): string | undefined {
  // "Invoice Acme Corp $500" / "for Acme Corp" / "Remind Acme" / "Cancel Acme"
  const m =
    text.match(/invoice\s+([A-Z][\w&.\s-]{1,40}?)\s+\$/i) ||
    text.match(/for\s+([A-Z][\w&.\s-]{1,40}?)(?:\s+\$|,|\s+for\b)/i) ||
    text.match(/to\s+([A-Z][\w&.\s-]{1,40}?)(?:\s+\$|<|,)/i) ||
    text.match(/(?:remind|cancel|about)\s+([A-Z][\w&.-]{1,40})/i);
  return m?.[1]?.trim();
}

function extractService(text: string): string {
  const m =
    text.match(/for\s+(.+?)(?:,|\.|$|due|remind)/i) ||
    text.match(/:\s*(.+)$/i);
  if (m) {
    let s = m[1].trim();
    // strip leading business name if duplicated
    s = s.replace(/^[A-Z][\w&.\s-]{1,40}?\s+/i, "").trim();
    if (s.length > 3 && s.length < 120) return s.replace(/^for\s+/i, "");
  }
  return "Professional services";
}

function findInvoiceRef(text: string) {
  const byId = text.match(/INV2-[A-Z0-9-]+/i);
  if (byId) return mock.getInvoice(byId[0]);
  const byNum = text.match(/INV-\d+/i);
  if (byNum) {
    return mock.listInvoices().items.find((i) => i.invoice_number === byNum[0].toUpperCase());
  }
  const email = extractEmail(text);
  if (email) {
    return mock
      .listInvoices()
      .items.find((i) => i.recipient_email.toLowerCase() === email.toLowerCase() && i.status !== "CANCELLED");
  }
  const business = extractBusiness(text);
  if (business) {
    return mock.listInvoices().items.find(
      (i) =>
        (i.recipient_business || "").toLowerCase().includes(business.toLowerCase()) ||
        (i.recipient_name || "").toLowerCase().includes(business.toLowerCase())
    );
  }
  return undefined;
}

export async function runDemoAgent(
  userText: string,
  opts: { owner: string }
): Promise<DemoAgentResult> {
  const { owner } = opts;
  const text = userText.trim().slice(0, 4000);
  const lower = text.toLowerCase();
  if (/^(hi|hello|hey|yo)\b/.test(lower) || lower.includes("what can you")) {
    return {
      text:
        "Hi — I'm **Invoice Copilot**, your PayPal invoicing agent.\n\n" +
        "Try things like:\n" +
        "• `Invoice Acme Corp $500 for logo design, due in 14 days`\n" +
        "• `List my unpaid invoices`\n" +
        "• `Who owes me money?`\n" +
        "• `Remind Acme about their invoice`\n" +
        "• `Show QR for INV-1001`\n" +
        "• `Cancel invoice INV-1001`\n\n" +
        "Send / remind / cancel always ask for your confirmation first.\n\n" +
        LOCAL_NOTE,
    };
  }

  // Prefer create-invoice intent when the utterance clearly asks to bill someone
  // (avoid matching the word "unpaid" inside reminder instructions).
  if (
    /^(who owes|outstanding|summary|summarize|dashboard|how much)|\blist\b.*\bunpaid\b|\bunpaid invoices\b|\bwho owes\b/i.test(
      lower
    )
  ) {
    const r = mock.summarizeOutstanding();
    const lines = r.by_recipient
      .map((x) => `• ${x.email} — ${x.amount} (${x.status}) \`${x.id}\``)
      .join("\n");
    return {
      text:
        `Here's your receivables snapshot:\n\n` +
        `• **Unpaid:** ${r.unpaid_count} invoice(s), **$${r.unpaid_total}**\n` +
        `• **Paid:** $${r.paid_total}\n` +
        `• **Drafts:** ${r.draft_count}\n\n` +
        (lines || "No outstanding invoices.") +
        `\n\n${LOCAL_NOTE}`,
    };
  }

  if (/list|show (all |my )?invoices|what invoices/i.test(lower)) {
    const status = /unpaid|sent/i.test(lower)
      ? "SENT"
      : /paid/i.test(lower)
        ? "PAID"
        : /draft/i.test(lower)
          ? "DRAFT"
          : undefined;
    const { items, total } = mock.listInvoices({ status });
    return {
      text:
        `Found **${total}** invoice(s)${status ? ` with status ${status}` : ""}:\n\n` +
        (items.map(formatInvoice).join("\n\n") || "None yet.") +
        `\n\n${LOCAL_NOTE}`,
    };
  }

  if (/qr|qr code|payment link/i.test(lower)) {
    const inv = findInvoiceRef(text) || mock.listInvoices().items.find((i) => i.status === "SENT");
    if (!inv) return { text: "I couldn't find an invoice to generate a QR for. Create or list invoices first." };
    const qr = mock.generateQr(inv.id);
    return {
      text:
        `**Placeholder** QR for **${inv.invoice_number}** — not a scannable code; ` +
        `this app does not call PayPal's QR API.\n` +
        `Payment link: ${qr.href || "none (local mock invoice has no PayPal page)"}\n\n` +
        `![Placeholder QR](${qr.data_url})`,
    };
  }

  if (/remind/i.test(lower) && !(/invoice\b/i.test(lower) && extractMoney(text))) {
    const inv =
      findInvoiceRef(text) ||
      mock.listInvoices().items.find((i) => i.status === "SENT" || i.status === "UNPAID");
    if (!inv) return { text: "No unpaid invoice found to remind." };
    const pending = createPendingAction({
      tool: "send_invoice_reminder",
      invoice_id: inv.id,
      summary: `Record a reminder for ${inv.invoice_number} to ${inv.recipient_email} — local mock desk, no email sent`,
      owner,
    });
    return {
      text:
        `I can remind **${inv.recipient_email}** about **${inv.invoice_number}** ` +
        `(${inv.amount.currency_code} ${inv.amount.value}).\n\n` +
        `Confirm in the card below to record the reminder.\n\n${LOCAL_NOTE}`,
      pendingAction: pending,
    };
  }

  if (/\bcancel\b/i.test(lower) && !(/invoice\b/i.test(lower) && extractMoney(text))) {
    const inv = findInvoiceRef(text);
    if (!inv) return { text: "Tell me which invoice to cancel (invoice number or recipient)." };
    const pending = createPendingAction({
      tool: "cancel_sent_invoice",
      invoice_id: inv.id,
      summary: `Cancel invoice ${inv.invoice_number} for ${inv.recipient_email} — local mock desk`,
      owner,
    });
    return {
      text: `Cancel **${inv.invoice_number}** for ${inv.recipient_email}? Confirm below.\n\n${LOCAL_NOTE}`,
      pendingAction: pending,
    };
  }

  if (/send/i.test(lower) && !/invoice\s+\w+/i.test(lower)) {
    const inv =
      findInvoiceRef(text) ||
      mock.listInvoices().items.find((i) => i.status === "DRAFT");
    if (!inv) return { text: "No draft invoice found to send. Create one first." };
    const pending = createPendingAction({
      tool: "send_invoice",
      invoice_id: inv.id,
      summary: `Mark ${inv.invoice_number} (${inv.amount.currency_code} ${inv.amount.value}) as sent to ${inv.recipient_email} — local mock desk, no email sent`,
      owner,
    });
    return {
      text: `Ready to send **${inv.invoice_number}** to ${inv.recipient_email}. Confirm below.\n\n${LOCAL_NOTE}`,
      pendingAction: pending,
    };
  }

  if (/invoice|bill|charge|create/i.test(lower)) {
    const amount = extractMoney(text);
    if (!amount) {
      return {
        text: "I can create that — how much should I invoice? e.g. `Invoice Acme Corp $500 for logo design`",
      };
    }
    const email =
      extractEmail(text) ||
      `${(extractBusiness(text) || "client").toLowerCase().replace(/[^a-z0-9]+/g, ".")}@example.com`;
    const business = extractBusiness(text);
    const service = extractService(text);
    const due_days = extractDueDays(text);
    const remind = extractRemindDays(text);

    const inv = mock.createInvoice({
      recipient_email: email,
      recipient_business: business,
      due_days,
      note: remind
        ? `Auto-remind planned in ${remind} days if unpaid.`
        : `Thanks for your business.`,
      items: [{ name: service, quantity: 1, unit_price: amount }],
    });

    const pending = createPendingAction({
      tool: "send_invoice",
      invoice_id: inv.id,
      summary: `Mark ${inv.invoice_number} (${inv.amount.currency_code} ${inv.amount.value}) as sent to ${inv.recipient_email} — local mock desk, no email sent`,
      owner,
    });

    return {
      text:
        `Draft created in the **local mock desk** (no PayPal call):\n\n${formatInvoice(inv)}\n\n` +
        (remind
          ? `Noted: remind them in **${remind} days** if still unpaid.\n\n`
          : "") +
        `Confirm below to mark it **sent** in the local desk (no email is sent).`,
      pendingAction: pending,
    };
  }

  if (/get|details|status/i.test(lower)) {
    const inv = findInvoiceRef(text);
    if (inv) return { text: formatInvoice(inv) };
  }

  return {
    text:
      "I didn't catch that. Examples:\n" +
      "• Invoice Bluebird LLC $1,200 for website redesign, due in 30 days\n" +
      "• List unpaid invoices\n" +
      "• Who owes me money?\n" +
      "• Remind Acme\n" +
      "• Show QR for INV-1001",
  };
}

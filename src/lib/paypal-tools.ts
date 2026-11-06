/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool as aiTool } from "ai";
import { z } from "zod";
import { isPayPalConfigured } from "./config";
import * as mock from "./mock-store";
import type { Invoice, PendingAction } from "./types";

export type ToolMap = Record<string, any>;

export type PayPalInvoicingProbe = {
  ok: boolean;
  status?: number;
  message?: string;
};

function parseToolkitPayload(result: unknown): any {
  if (result == null) return null;
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return { raw: result };
    }
  }
  return result;
}

function isAuthFailure(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  const msg = String(payload.message || payload.error || payload.name || "");
  const code = String(payload.code || payload.name || "");
  return (
    payload.ok === false &&
    (payload.status === 403 ||
      /NOT_AUTHORIZED|insufficient permissions|Authorization failed/i.test(
        `${msg} ${code}`
      ))
  );
}

async function getLiveToolkitTools(): Promise<ToolMap | null> {
  if (!isPayPalConfigured()) return null;
  try {
    const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
    const toolkit = new PayPalAgentToolkit({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
      configuration: {
        actions: {
          invoices: {
            create: true,
            list: true,
            get: true,
            send: true,
            sendReminder: true,
            cancel: true,
            generateQRC: true,
            generateInvoiceNumber: true,
            search: true,
            update: true,
            cancelReminders: true,
            recordPayment: true,
            setupReminders: true,
          },
        },
        context: {
          sandbox: (process.env.PAYPAL_ENVIRONMENT || "sandbox") !== "live",
        },
      },
    });
    return toolkit.getTools() as ToolMap;
  } catch (err) {
    console.error("Failed to init PayPal Agent Toolkit, falling back to mock:", err);
    return null;
  }
}

/** Lightweight probe: generate-next-invoice-number (no side effects beyond a number). */
export async function probePayPalInvoicing(): Promise<PayPalInvoicingProbe> {
  if (!isPayPalConfigured()) {
    return { ok: false, message: "PayPal credentials not configured" };
  }
  try {
    const live = await getLiveToolkitTools();
    const tool = live?.generate_invoice_number;
    if (!tool?.execute) {
      return { ok: false, message: "generate_invoice_number tool missing" };
    }
    const raw = await tool.execute({}, { toolCallId: "probe", messages: [] });
    const payload = parseToolkitPayload(raw);
    if (isAuthFailure(payload)) {
      return {
        ok: false,
        status: payload.status || 403,
        message:
          "PayPal OAuth works, but this REST app is missing the Invoicing feature/scope. Enable Invoicing under Apps & Credentials → Features, then mint a new token.",
      };
    }
    if (payload?.ok === false) {
      return {
        ok: false,
        status: payload.status,
        message: String(payload.message || "PayPal invoicing probe failed"),
      };
    }
    return { ok: true, message: "PayPal invoicing authorized" };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function formatInvoice(inv: Invoice): string {
  return [
    `• ${inv.invoice_number} (${inv.id})`,
    `  Status: ${inv.status}`,
    `  To: ${inv.recipient_business || inv.recipient_name || inv.recipient_email} <${inv.recipient_email}>`,
    `  Amount: ${inv.amount.currency_code} ${inv.amount.value}`,
    `  Due: ${inv.due_date || "n/a"}`,
    inv.href ? `  Link: ${inv.href}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function needsConfirmation(
  toolName: PendingAction["tool"],
  invoice_id: string,
  summary: string,
  args: Record<string, unknown> = {}
) {
  const pending = mock.createPendingAction(toolName, invoice_id, summary, args);
  return {
    status: "needs_confirmation" as const,
    pending_action_id: pending.id,
    tool: pending.tool,
    invoice_id,
    summary,
    message:
      "Human confirmation required before this action runs. Ask the user to confirm in the UI, then call confirm_pending_action with the pending_action_id.",
  };
}

export function buildMockInvoiceTools(): ToolMap {
  return {
    create_invoice: aiTool({
      description:
        "Create a PayPal invoice draft for a client. Prefer business/name when known. Does NOT send until send_invoice is confirmed.",
      parameters: z.object({
        recipient_email: z.string().email().describe("Client email"),
        recipient_name: z.string().optional(),
        recipient_business: z.string().optional(),
        currency_code: z.string().default("USD"),
        note: z.string().optional(),
        due_days: z.number().int().min(1).max(365).default(14),
        items: z
          .array(
            z.object({
              name: z.string(),
              quantity: z.union([z.number(), z.string()]).default(1),
              unit_price: z.union([z.number(), z.string()]),
              description: z.string().optional(),
            })
          )
          .min(1),
      }),
      execute: async (args) => {
        const inv = mock.createInvoice(args);
        return {
          status: "draft_created",
          invoice: inv,
          formatted: formatInvoice(inv),
          next_step:
            "Invoice is a DRAFT. Ask the user to confirm before calling send_invoice.",
        };
      },
    }),

    list_invoices: aiTool({
      description: "List PayPal invoices with optional status filter.",
      parameters: z.object({
        page: z.number().optional().default(1),
        page_size: z.number().optional().default(20),
        status: z.string().optional(),
      }),
      execute: async (args) => {
        const { items, total } = mock.listInvoices(args);
        return {
          total,
          invoices: items,
          formatted: items.map(formatInvoice).join("\n\n") || "No invoices found.",
        };
      },
    }),

    get_invoice: aiTool({
      description: "Get details for a specific invoice by ID.",
      parameters: z.object({ invoice_id: z.string() }),
      execute: async ({ invoice_id }: { invoice_id: string }) => {
        const inv = mock.getInvoice(invoice_id);
        if (!inv) return { error: `Invoice not found: ${invoice_id}` };
        return { invoice: inv, formatted: formatInvoice(inv) };
      },
    }),

    send_invoice: aiTool({
      description:
        "Request to send a draft invoice to the recipient. Requires human confirmation.",
      parameters: z.object({
        invoice_id: z.string(),
        note: z.string().optional(),
      }),
      execute: async ({ invoice_id, note }: { invoice_id: string; note?: string }) => {
        const inv = mock.getInvoice(invoice_id);
        const summary = inv
          ? `Send invoice ${inv.invoice_number} (${inv.amount.currency_code} ${inv.amount.value}) to ${inv.recipient_email}`
          : `Send PayPal invoice ${invoice_id}${note ? ` — ${note}` : ""}`;
        return needsConfirmation("send_invoice", invoice_id, summary, { note });
      },
    }),

    send_invoice_reminder: aiTool({
      description:
        "Request to remind a client about an unpaid invoice. Requires human confirmation.",
      parameters: z.object({
        invoice_id: z.string(),
        note: z.string().optional(),
      }),
      execute: async ({ invoice_id, note }: { invoice_id: string; note?: string }) => {
        const inv = mock.getInvoice(invoice_id);
        const summary = inv
          ? `Send reminder for ${inv.invoice_number} to ${inv.recipient_email}`
          : `Send reminder for PayPal invoice ${invoice_id}`;
        return needsConfirmation(
          "send_invoice_reminder",
          invoice_id,
          summary,
          { note }
        );
      },
    }),

    cancel_sent_invoice: aiTool({
      description:
        "Request to cancel a sent invoice. Requires human confirmation.",
      parameters: z.object({
        invoice_id: z.string(),
        note: z.string().optional(),
      }),
      execute: async ({ invoice_id, note }: { invoice_id: string; note?: string }) => {
        const inv = mock.getInvoice(invoice_id);
        const summary = inv
          ? `Cancel invoice ${inv.invoice_number} for ${inv.recipient_email}`
          : `Cancel PayPal invoice ${invoice_id}`;
        return needsConfirmation(
          "cancel_sent_invoice",
          invoice_id,
          summary,
          { note }
        );
      },
    }),

    generate_invoice_qr_code: aiTool({
      description: "Generate a QR code / payment deep link for an invoice.",
      parameters: z.object({ invoice_id: z.string() }),
      execute: async ({ invoice_id }: { invoice_id: string }) => mock.generateQr(invoice_id),
    }),

    summarize_outstanding: aiTool({
      description:
        "Summarize who owes what: unpaid totals, drafts, and paid totals.",
      parameters: z.object({}),
      execute: async () => mock.summarizeOutstanding(),
    }),

    confirm_pending_action: aiTool({
      description:
        "Execute a previously proposed send/remind/cancel action after the user confirmed in the UI.",
      parameters: z.object({
        pending_action_id: z.string(),
        confirmed: z.boolean(),
      }),
      execute: async ({
        pending_action_id,
        confirmed,
      }: {
        pending_action_id: string;
        confirmed: boolean;
      }) => {
        if (!confirmed) {
          mock.consumePendingAction(pending_action_id);
          return { status: "cancelled_by_user" };
        }
        return executePendingAction(pending_action_id);
      },
    }),
  };
}

export async function executePendingAction(pending_action_id: string) {
  const action = mock.consumePendingAction(pending_action_id);
  if (!action) return { error: "Pending action not found or already handled." };

  const live = await getLiveToolkitTools();
  if (live && live[action.tool]) {
    try {
      const result = await live[action.tool].execute?.(
        { invoice_id: action.invoice_id, ...action.args },
        { toolCallId: pending_action_id, messages: [] }
      );
      const payload = parseToolkitPayload(result);
      if (isAuthFailure(payload)) {
        const mockResult = await executeMockAction(action);
        return {
          ...mockResult,
          fell_back_from_live: true,
          live_error:
            "PayPal Invoicing not authorized on this app (enable Invoicing in Developer Dashboard → Features).",
        };
      }
      // Mirror status into mock desk when possible
      if (action.tool === "send_invoice" && mock.getInvoice(action.invoice_id)) {
        mock.sendInvoice(action.invoice_id);
      }
      return { status: "executed_live", tool: action.tool, result: payload ?? result };
    } catch (err) {
      const mockResult = await executeMockAction(action);
      return {
        ...mockResult,
        fell_back_from_live: true,
        live_error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return executeMockAction(action);
}

async function executeMockAction(action: PendingAction) {
  switch (action.tool) {
    case "send_invoice":
      return { status: "sent", invoice: mock.sendInvoice(action.invoice_id) };
    case "send_invoice_reminder":
      return {
        status: "reminded",
        invoice: mock.remindInvoice(action.invoice_id),
      };
    case "cancel_sent_invoice":
      return {
        status: "cancelled",
        invoice: mock.cancelInvoice(action.invoice_id),
      };
  }
}

function wrapLiveCreate(liveTool: any, mockCreate: any) {
  return aiTool({
    description:
      liveTool.description ||
      "Create a DRAFT PayPal invoice via the PayPal Agent Toolkit (sandbox/live).",
    parameters: liveTool.parameters,
    execute: async (args: any, opts: any) => {
      try {
        const raw = await liveTool.execute(args, opts);
        const payload = parseToolkitPayload(raw);
        if (isAuthFailure(payload)) {
          // Map flat toolkit fields into mock create so the desk still works
          const recipients = args.primary_recipients?.[0]?.billing_info || {};
          const items = (args.items || []).map((it: any) => ({
            name: it.name || "Item",
            quantity: it.quantity || 1,
            unit_price: it.unit_amount?.value || it.unit_price || 0,
            description: it.description,
          }));
          if (!items.length) {
            items.push({ name: "Service", quantity: 1, unit_price: 1 });
          }
          const mockResult = await mockCreate.execute(
            {
              recipient_email:
                recipients.email_address || "buyer-sandbox@example.com",
              recipient_name: recipients.name?.full_name,
              recipient_business: recipients.business_name,
              currency_code: args.currency_code || "USD",
              note: args.note,
              due_days: 14,
              items,
            },
            opts
          );
          return {
            ...mockResult,
            paypal_live: false,
            paypal_warning:
              "PayPal Invoicing API returned NOT_AUTHORIZED. Enable Invoicing on the sandbox REST app (Developer Dashboard → Features), then restart. Draft was saved to the local desk so you can still demo confirm/send.",
          };
        }
        // Best-effort: cache a desk row from live create
        try {
          const id =
            payload?.id ||
            payload?.invoice?.id ||
            payload?.href?.split("/").pop();
          const email =
            args.primary_recipients?.[0]?.billing_info?.email_address ||
            "buyer@example.com";
          const amount =
            args.items?.[0]?.unit_amount?.value ||
            payload?.due_amount?.value ||
            "0.00";
          if (id && !mock.getInvoice(id)) {
            mock.createInvoice({
              recipient_email: email,
              recipient_business:
                args.primary_recipients?.[0]?.billing_info?.business_name,
              currency_code: args.currency_code || "USD",
              note: args.note,
              due_days: 14,
              items: [
                {
                  name: args.items?.[0]?.name || "Invoice",
                  quantity: 1,
                  unit_price: amount,
                },
              ],
            });
          }
        } catch {
          /* ignore cache errors */
        }
        return {
          status: "draft_created_live",
          result: payload ?? raw,
          next_step:
            "Invoice is a DRAFT on PayPal. Ask the user to confirm before calling send_invoice.",
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });
}

function wrapLiveList(liveTool: any, mockList: any) {
  return aiTool({
    description: liveTool.description || "List PayPal invoices.",
    parameters: liveTool.parameters,
    execute: async (args: any, opts: any) => {
      try {
        const raw = await liveTool.execute(args, opts);
        const payload = parseToolkitPayload(raw);
        if (isAuthFailure(payload)) {
          const fallback = await mockList.execute(
            {
              page: args.page || 1,
              page_size: args.page_size || 20,
            },
            opts
          );
          return {
            ...fallback,
            paypal_live: false,
            paypal_warning:
              "PayPal list_invoices NOT_AUTHORIZED — showing local desk invoices.",
          };
        }
        return { status: "ok", result: payload ?? raw };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });
}


/**
 * Keep compact mock tool schemas for the LLM (PayPal toolkit schemas blow
 * small Groq TPM budgets), but execute create/list against live PayPal when
 * the REST app has Invoicing authorized. Confirmation wrappers stay mock-based
 * so human-in-the-loop works for both live and local invoice ids.
 */
export async function getInvoiceTools(): Promise<ToolMap> {
  const mockTools = buildMockInvoiceTools();
  const live = await getLiveToolkitTools();
  if (!live) return mockTools;

  const probe = await probePayPalInvoicing();
  if (!probe.ok) {
    // Credentials present but Invoicing feature off — keep mock tools so the
    // agent can still demo the full flow; health endpoint reports the gap.
    return mockTools;
  }

  const merged: ToolMap = { ...mockTools };

  merged.create_invoice = aiTool({
    description: mockTools.create_invoice.description,
    parameters: mockTools.create_invoice.parameters,
    execute: async (args: any, opts: any) => {
      const liveArgs = {
        currency_code: args.currency_code || "USD",
        invoicer_business_name: process.env.MERCHANT_BUSINESS_NAME || "Quang Studio",
        invoicer_email_address: process.env.MERCHANT_EMAIL || "billing@quang.studio",
        invoicer_given_name: process.env.MERCHANT_GIVEN_NAME || "Quang",
        invoicer_surname: process.env.MERCHANT_SURNAME || "Ngo",
        note: args.note,
        primary_recipients: [
          {
            billing_info: {
              email_address: args.recipient_email,
              business_name: args.recipient_business,
              name: args.recipient_name
                ? { full_name: args.recipient_name }
                : undefined,
            },
          },
        ],
        items: (args.items || []).map((it: any) => ({
          name: it.name,
          description: it.description,
          quantity: String(it.quantity ?? 1),
          unit_amount: {
            currency_code: args.currency_code || "USD",
            value: Number(it.unit_price).toFixed(2),
          },
        })),
      };
      try {
        const raw = await live.create_invoice.execute(liveArgs, opts);
        const payload = parseToolkitPayload(raw);
        if (isAuthFailure(payload)) {
          return mockTools.create_invoice.execute(args, opts);
        }
        const liveId = payload?.id || payload?.invoice?.id;
        // Also keep a local desk copy keyed for confirm/send UX
        const local = await mockTools.create_invoice.execute(args, opts);
        return {
          status: "draft_created_live",
          paypal_invoice_id: liveId,
          invoice: local.invoice,
          result: payload,
          formatted: local.formatted,
          next_step:
            "Invoice is a DRAFT on PayPal. Ask the user to confirm before calling send_invoice (use the local invoice.id).",
        };
      } catch {
        return mockTools.create_invoice.execute(args, opts);
      }
    },
  });

  merged.list_invoices = aiTool({
    description: mockTools.list_invoices.description,
    parameters: mockTools.list_invoices.parameters,
    execute: async (args: any, opts: any) => {
      try {
        const raw = await live.list_invoices.execute(
          {
            page: args.page || 1,
            page_size: args.page_size || 20,
            total_required: true,
          },
          opts
        );
        const payload = parseToolkitPayload(raw);
        if (isAuthFailure(payload)) {
          return mockTools.list_invoices.execute(args, opts);
        }
        const normalized = normalizeInvoiceList({ result: payload });
        return {
          total: normalized.items.length,
          invoices: normalized.items,
          formatted:
            normalized.items.map(formatInvoice).join("\n\n") ||
            "No invoices found.",
          source: normalized.source,
        };
      } catch {
        return mockTools.list_invoices.execute(args, opts);
      }
    },
  });

  return merged;
}

/** Normalize PayPal list payloads (or mock) into desk Invoice rows. */
export function normalizeInvoiceList(payload: any): {
  items: Invoice[];
  summary: ReturnType<typeof mock.summarizeOutstanding> | null;
  source: string;
} {
  if (!payload) {
    const { items } = mock.listInvoices({});
    return { items, summary: mock.summarizeOutstanding(), source: "mock" };
  }
  if (Array.isArray(payload.items)) {
    return {
      items: payload.items,
      summary: payload.summary || mock.summarizeOutstanding(),
      source: payload.source || "mock",
    };
  }
  const result = payload.result ?? payload;
  const parsed = typeof result === "string" ? parseToolkitPayload(result) : result;
  if (isAuthFailure(parsed)) {
    const { items } = mock.listInvoices({});
    return {
      items,
      summary: mock.summarizeOutstanding(),
      source: "mock-fallback",
    };
  }
  const itemsRaw =
    parsed?.items ||
    parsed?.invoices ||
    parsed?.result?.items ||
    [];
  const items: Invoice[] = (Array.isArray(itemsRaw) ? itemsRaw : []).map(
    (row: any, idx: number) => {
      const amount = row.due_amount || row.amount || {};
      const recipient =
        row.primary_recipients?.[0]?.billing_info ||
        row.primary_recipients?.[0] ||
        {};
      const currency = amount.currency_code || row.detail?.currency_code || "USD";
      const status = String(row.status || "DRAFT").toUpperCase() as Invoice["status"];
      const invoiceDate =
        row.detail?.invoice_date || new Date().toISOString().slice(0, 10);
      return {
        id: row.id || row.invoice_id || `pp-${idx}`,
        invoice_number:
          row.detail?.invoice_number || row.invoice_number || row.id || `INV-${idx}`,
        status,
        currency_code: currency,
        recipient_email: recipient.email_address || "unknown@example.com",
        recipient_name: recipient.name?.full_name,
        recipient_business: recipient.business_name,
        amount: {
          currency_code: currency,
          value: String(amount.value ?? "0.00"),
        },
        due_date: row.detail?.payment_term?.due_date || row.due_date,
        invoice_date: invoiceDate,
        href: row.detail?.metadata?.recipient_view_url || row.href,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [],
        reminder_count: 0,
      } as Invoice;
    }
  );
  if (!items.length) {
    const local = mock.listInvoices({});
    return {
      items: local.items,
      summary: mock.summarizeOutstanding(),
      source: "mock-empty-live",
    };
  }
  return { items, summary: null, source: "paypal" };
}

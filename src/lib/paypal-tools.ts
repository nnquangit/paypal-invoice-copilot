/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool as aiTool } from "ai";
import { z } from "zod";
import { isPayPalConfigured } from "./config";
import * as mock from "./mock-store";
import type { Invoice, PendingAction } from "./types";

export type ToolMap = Record<string, any>;

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
        if (!inv) return { error: `Invoice not found: ${invoice_id}` };
        return needsConfirmation(
          "send_invoice",
          invoice_id,
          `Send invoice ${inv.invoice_number} (${inv.amount.currency_code} ${inv.amount.value}) to ${inv.recipient_email}`,
          { note }
        );
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
        if (!inv) return { error: `Invoice not found: ${invoice_id}` };
        return needsConfirmation(
          "send_invoice_reminder",
          invoice_id,
          `Send reminder for ${inv.invoice_number} to ${inv.recipient_email}`,
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
        if (!inv) return { error: `Invoice not found: ${invoice_id}` };
        return needsConfirmation(
          "cancel_sent_invoice",
          invoice_id,
          `Cancel invoice ${inv.invoice_number} for ${inv.recipient_email}`,
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
      return { status: "executed_live", tool: action.tool, result };
    } catch (err) {
      return {
        status: "live_error_fell_back_to_mock",
        error: err instanceof Error ? err.message : String(err),
        mock: await executeMockAction(action),
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

/**
 * Prefer live PayPal Agent Toolkit tools when credentials exist,
 * but always overlay confirmation wrappers + summarize helper.
 */
export async function getInvoiceTools(): Promise<ToolMap> {
  const mockTools = buildMockInvoiceTools();
  const live = await getLiveToolkitTools();
  if (!live) return mockTools;

  const merged: ToolMap = { ...mockTools };
  for (const key of [
    "create_invoice",
    "list_invoices",
    "get_invoice",
    "generate_invoice_qr_code",
    "generate_invoice_number",
    "search_invoicing",
  ]) {
    if (live[key]) merged[key] = live[key];
  }
  return merged;
}

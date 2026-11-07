/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { tool as aiTool } from "ai";
import { z } from "zod";
import { isPayPalConfigured } from "./config";
import { logServerError, publicPayPalError, safeText } from "./errors";
import * as mock from "./mock-store";
import {
  claimPendingAction,
  completePendingAction,
  createPendingAction,
  failPendingAction,
  RECONCILE_MESSAGE,
  releasePendingAction,
} from "./pending";
import type { Invoice, InvoiceSource, PendingAction } from "./types";

export type ToolMap = Record<string, any>;

export type PayPalInvoicingProbe = {
  ok: boolean;
  status?: number;
  message?: string;
  cached?: boolean;
};

/* ------------------------------------------------------------------ */
/* Toolkit construction (sandbox-only, cached, injectable for tests)   */
/* ------------------------------------------------------------------ */

export type ToolkitFactory = (creds: { clientId: string; clientSecret: string }) => Promise<ToolMap>;

const defaultFactory: ToolkitFactory = async ({ clientId, clientSecret }) => {
  if (process.env.VITEST) {
    throw new Error("Real PayPal toolkit is disabled under tests; inject a stub factory.");
  }
  const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: {
        invoices: {
          create: true,
          list: true,
          get: true,
          send: true,
          sendReminder: true,
          cancel: true,
          generateInvoiceNumber: true,
        },
      },
      // Sandbox-only build: never anything else (config.ts rejects other values).
      context: { sandbox: true },
    },
  });
  return toolkit.getTools() as ToolMap;
};

let toolkitFactory: ToolkitFactory = defaultFactory;
let toolsCache: { key: string; tools: ToolMap } | null = null; // bounded: 1 entry

const PROBE_OK_TTL_MS = 60_000;
const PROBE_FAIL_TTL_MS = 15_000;
const PROBE_CACHE_MAX = 4;
const probeCache = new Map<string, { at: number; ttl: number; value: PayPalInvoicingProbe }>();
const probeInflight = new Map<string, Promise<PayPalInvoicingProbe>>();

/** Test hook: inject a fake toolkit. Pass null to restore the real one. */
export function __setToolkitFactoryForTests(f: ToolkitFactory | null) {
  toolkitFactory = f || defaultFactory;
  resetPayPalCaches();
}

export function resetPayPalCaches() {
  toolsCache = null;
  probeCache.clear();
  probeInflight.clear();
}

/** Hash of the credentials so caches never hold raw secrets as keys and rotate with them. */
function credKey(): string {
  return createHash("sha256")
    .update(`${process.env.PAYPAL_CLIENT_ID}\u0000${process.env.PAYPAL_CLIENT_SECRET}`)
    .digest("hex")
    .slice(0, 24);
}

export async function getLiveToolkitTools(): Promise<ToolMap | null> {
  if (!isPayPalConfigured()) return null;
  const key = credKey();
  if (toolsCache?.key === key) return toolsCache.tools;
  try {
    const tools = await toolkitFactory({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    });
    toolsCache = { key, tools };
    return tools;
  } catch (err) {
    logServerError("PayPal Agent Toolkit init failed:", err);
    return null;
  }
}

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

function extractPayPalInvoiceId(payload: any): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  if (payload.id) return String(payload.id);
  if (payload.invoice?.id) return String(payload.invoice.id);
  const href = payload.href || payload.links?.[0]?.href || "";
  const m = String(href).match(/invoices\/([^/?#]+)/);
  return m?.[1];
}

function isPayPalError(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (payload.ok === false) return true;
  // Non-JSON toolkit output that reads like an error is treated as one.
  return payload.raw !== undefined && /error|fail/i.test(String(payload.raw));
}

function isAuthFailure(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  const msg = String(payload.message || payload.error || payload.name || "");
  const code = String(payload.code || payload.name || "");
  return (
    payload.ok === false &&
    (payload.status === 403 ||
      /NOT_AUTHORIZED|insufficient permissions|Authorization failed/i.test(`${msg} ${code}`))
  );
}

async function runProbe(): Promise<PayPalInvoicingProbe> {
  try {
    const live = await getLiveToolkitTools();
    const tool = live?.generate_invoice_number;
    if (!tool?.execute) {
      return { ok: false, message: "PayPal toolkit unavailable (generate_invoice_number missing)" };
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
    if (isPayPalError(payload)) {
      return { ok: false, status: payload.status, message: publicPayPalError(payload, "PayPal invoicing probe failed") };
    }
    return { ok: true, message: "PayPal sandbox invoicing authorized" };
  } catch (err) {
    return { ok: false, message: publicPayPalError(err, "PayPal invoicing probe failed") };
  }
}

/**
 * Lightweight probe (generate-next-invoice-number). Cached per credential set:
 * 60 s on success, 15 s on failure, at most 4 keys, concurrent callers share one
 * in-flight request.
 */
export async function probePayPalInvoicing(now = Date.now()): Promise<PayPalInvoicingProbe> {
  if (!isPayPalConfigured()) {
    return { ok: false, message: "PayPal sandbox not configured" };
  }
  const key = credKey();
  const hit = probeCache.get(key);
  if (hit && now - hit.at < hit.ttl) return { ...hit.value, cached: true };
  const inflight = probeInflight.get(key);
  if (inflight) return inflight;
  const p = runProbe()
    .then((value) => {
      if (probeCache.size >= PROBE_CACHE_MAX && !probeCache.has(key)) {
        const oldest = probeCache.keys().next().value;
        if (oldest !== undefined) probeCache.delete(oldest);
      }
      probeCache.set(key, { at: now, ttl: value.ok ? PROBE_OK_TTL_MS : PROBE_FAIL_TTL_MS, value });
      return value;
    })
    .finally(() => probeInflight.delete(key));
  probeInflight.set(key, p);
  return p;
}

export function probeCacheSize(): number {
  return probeCache.size;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function sourceLabel(src?: InvoiceSource): string {
  return src === "paypal-sandbox" ? "PayPal sandbox" : "local mock (no PayPal call)";
}

export function formatInvoice(inv: Invoice): string {
  return [
    `• ${inv.invoice_number} (${inv.id})`,
    `  Status: ${inv.status}`,
    `  To: ${inv.recipient_business || inv.recipient_name || inv.recipient_email} <${inv.recipient_email}>`,
    `  Amount: ${inv.amount.currency_code} ${inv.amount.value}`,
    `  Due: ${inv.due_date || "n/a"}`,
    `  Source: ${sourceLabel(inv.source)}`,
    inv.href ? `  Link: ${inv.href}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* LLM tool set (no execute/confirm capability)                        */
/* ------------------------------------------------------------------ */

const itemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.coerce.number().positive().max(100000).default(1),
  unit_price: z.coerce.number().min(0).max(1_000_000),
  description: z.string().max(500).optional(),
});

const createSchema = z.object({
  recipient_email: z.string().email().max(254).describe("Client email"),
  recipient_name: z.string().max(200).optional(),
  recipient_business: z.string().max(200).optional(),
  currency_code: z.string().length(3).default("USD").describe("ISO 4217 code, e.g. USD"),
  note: z.string().max(1000).optional(),
  due_days: z.number().int().min(1).max(365).default(14),
  items: z.array(itemSchema).min(1).max(50),
});

const actionSchema = z.object({
  invoice_id: z.string().min(1).max(100),
  note: z.string().max(1000).optional(),
});

function proposeAction(
  owner: string,
  toolName: PendingAction["tool"],
  invoice_id: string,
  verb: string,
  note?: string
) {
  const inv = mock.getInvoice(invoice_id);
  const base = inv
    ? `${verb} ${inv.invoice_number} (${inv.amount.currency_code} ${inv.amount.value}) for ${inv.recipient_email}`
    : `${verb} PayPal invoice ${invoice_id}`;
  const where = mock.isLocalMockInvoice(invoice_id) ? "local mock desk" : "PayPal sandbox";
  const summary = `${base} — ${where}${note ? ` — note: ${safeText(note, 200)}` : ""}`;
  const pending = createPendingAction({ tool: toolName, invoice_id, summary, owner, args: note ? { note } : {} });
  return {
    status: "needs_confirmation" as const,
    pending_action_id: pending.id,
    tool: pending.tool,
    invoice_id,
    summary,
    message:
      "Nothing has happened yet. Only the human can execute this by pressing Confirm in the UI; you have no tool to confirm or execute it.",
  };
}

export function buildMockInvoiceTools(opts: { owner: string }): ToolMap {
  const { owner } = opts;
  return {
    create_invoice: aiTool({
      description:
        "Create an invoice DRAFT for a client. Does NOT send. Result field `source` says whether it is on PayPal sandbox or the local mock desk.",
      parameters: createSchema,
      execute: async (args) => {
        try {
          const inv = mock.createInvoice(args);
          return {
            status: "draft_created",
            source: "local-mock",
            invoice: inv,
            formatted: formatInvoice(inv),
            next_step: "Local mock DRAFT (no PayPal call). Call send_invoice to propose sending; the human must confirm.",
          };
        } catch (err) {
          return { status: "error", error: safeText(err instanceof Error ? err.message : err) };
        }
      },
    }),

    list_invoices: aiTool({
      description: "List invoices on the local desk with optional status filter.",
      parameters: z.object({
        page: z.number().int().min(1).optional().default(1),
        page_size: z.number().int().min(1).max(100).optional().default(20),
        status: z.string().max(30).optional(),
      }),
      execute: async (args) => {
        const { items, total } = mock.listInvoices(args);
        return {
          source: "local-mock",
          total,
          invoices: items,
          formatted: items.map(formatInvoice).join("\n\n") || "No invoices found.",
        };
      },
    }),

    get_invoice: aiTool({
      description: "Get details for a specific invoice on the desk by ID.",
      parameters: z.object({ invoice_id: z.string().min(1).max(100) }),
      execute: async ({ invoice_id }: { invoice_id: string }) => {
        const inv = mock.getInvoice(invoice_id);
        if (!inv) return { status: "error", error: `Invoice not found: ${safeText(invoice_id, 100)}` };
        return { invoice: inv, source: inv.source, formatted: formatInvoice(inv) };
      },
    }),

    send_invoice: aiTool({
      description: "PROPOSE sending a draft invoice. Only creates a pending action; the human confirms in the UI.",
      parameters: actionSchema,
      execute: async ({ invoice_id, note }) => proposeAction(owner, "send_invoice", invoice_id, "Send invoice", note),
    }),

    send_invoice_reminder: aiTool({
      description: "PROPOSE a payment reminder. Only creates a pending action; the human confirms in the UI.",
      parameters: actionSchema,
      execute: async ({ invoice_id, note }) =>
        proposeAction(owner, "send_invoice_reminder", invoice_id, "Send reminder for", note),
    }),

    cancel_sent_invoice: aiTool({
      description: "PROPOSE cancelling a sent invoice. Only creates a pending action; the human confirms in the UI.",
      parameters: actionSchema,
      execute: async ({ invoice_id, note }) => proposeAction(owner, "cancel_sent_invoice", invoice_id, "Cancel invoice", note),
    }),

    generate_invoice_qr_code: aiTool({
      description:
        "Return a PLACEHOLDER QR image for an invoice on the desk. It is not scannable; say so to the user.",
      parameters: z.object({ invoice_id: z.string().min(1).max(100) }),
      execute: async ({ invoice_id }: { invoice_id: string }) => {
        try {
          return mock.generateQr(invoice_id);
        } catch (err) {
          return { status: "error", error: safeText(err instanceof Error ? err.message : err) };
        }
      },
    }),

    summarize_outstanding: aiTool({
      description: "Summarize who owes what on the local desk: unpaid totals, drafts, and paid totals.",
      parameters: z.object({}),
      execute: async () => ({ source: "local desk", ...mock.summarizeOutstanding() }),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Execution — only reachable from POST /api/confirm                   */
/* ------------------------------------------------------------------ */

export type ExecResult = { httpStatus: number; body: Record<string, unknown> };

function errorBody(code: string, error: string, extra: Record<string, unknown> = {}) {
  return { status: "error", code, error, ...extra };
}

function executeMockAction(action: PendingAction): Record<string, unknown> {
  switch (action.tool) {
    case "send_invoice":
      return { status: "sent", source: "local-mock", invoice: mock.sendInvoice(action.invoice_id) };
    case "send_invoice_reminder":
      return { status: "reminded", source: "local-mock", invoice: mock.remindInvoice(action.invoice_id) };
    case "cancel_sent_invoice":
      return { status: "cancelled", source: "local-mock", invoice: mock.cancelInvoice(action.invoice_id) };
  }
}

/**
 * How a failed live action is classified:
 * - "predispatch": nothing was sent to PayPal (tool missing) → may be confirmed again.
 * - "definite": PayPal answered with a 4xx / authorization rejection → terminal `failed`.
 * - "outcome_unknown": the call was dispatched and threw, timed out, returned 5xx
 *   or an unclassifiable error → terminal; the user must check PayPal first.
 */
type LiveFailure = {
  ok: false;
  httpStatus: number;
  code: string;
  error: string;
  kind: "predispatch" | "definite" | "outcome_unknown";
};

async function executeLiveAction(
  action: PendingAction,
  live: ToolMap
): Promise<{ ok: true; body: Record<string, unknown> } | LiveFailure> {
  const tool = live[action.tool];
  if (!tool?.execute) {
    return {
      ok: false,
      httpStatus: 503,
      code: "paypal_unavailable",
      error: `PayPal tool ${action.tool} unavailable; nothing was sent.`,
      kind: "predispatch",
    };
  }
  const execArgs =
    action.tool === "send_invoice"
      ? { invoice_id: action.invoice_id, send_to_recipient: true, ...action.args }
      : { invoice_id: action.invoice_id, ...action.args };
  let payload: any;
  try {
    const raw = await tool.execute(execArgs, { toolCallId: action.id, messages: [] });
    payload = parseToolkitPayload(raw);
  } catch (err) {
    logServerError("PayPal action threw after dispatch:", err);
    return {
      ok: false,
      httpStatus: 502,
      code: "outcome_unknown",
      error: `${publicPayPalError(err)}. ${RECONCILE_MESSAGE}`,
      kind: "outcome_unknown",
    };
  }
  if (isAuthFailure(payload)) {
    return {
      ok: false,
      httpStatus: 502,
      code: "paypal_not_authorized",
      error: "PayPal Invoicing is not authorized on this sandbox app (enable Invoicing under Features). Nothing was sent.",
      kind: "definite",
    };
  }
  if (isPayPalError(payload)) {
    const status = Number(payload?.status);
    if (status >= 400 && status < 500) {
      return { ok: false, httpStatus: 502, code: "paypal_rejected", error: publicPayPalError(payload), kind: "definite" };
    }
    return {
      ok: false,
      httpStatus: 502,
      code: "outcome_unknown",
      error: `${publicPayPalError(payload)}. ${RECONCILE_MESSAGE}`,
      kind: "outcome_unknown",
    };
  }

  let href: string | undefined =
    payload?.href || payload?.links?.find?.((l: any) => l.rel === "payer-view")?.href || undefined;
  let liveInvoice: any = null;
  if (live.get_invoice?.execute) {
    try {
      liveInvoice = parseToolkitPayload(
        await live.get_invoice.execute({ invoice_id: action.invoice_id }, { toolCallId: `${action.id}-get`, messages: [] })
      );
      href =
        href ||
        liveInvoice?.detail?.metadata?.recipient_view_url ||
        liveInvoice?.links?.find?.((l: any) => /payer|recipient/i.test(l.rel || ""))?.href;
    } catch {
      /* status refresh is best-effort; the action itself succeeded */
    }
  }
  const fallbackStatus =
    action.tool === "send_invoice" ? "SENT" : action.tool === "cancel_sent_invoice" ? "CANCELLED" : "";
  const status = String(liveInvoice?.status || fallbackStatus).toUpperCase();
  if (status) mock.markInvoiceStatus(action.invoice_id, status as Invoice["status"], href);
  const desk = mock.getInvoice(action.invoice_id);
  return {
    ok: true,
    body: {
      status:
        action.tool === "send_invoice" ? "sent" : action.tool === "send_invoice_reminder" ? "reminded" : "cancelled",
      source: "paypal-sandbox",
      paypal_live: true,
      tool: action.tool,
      invoice: desk || undefined,
      paypal_status: status || undefined,
      href,
    },
  };
}

/**
 * Execute a pending action for the owning session. Within this process the
 * action is dispatched to PayPal at most once; only pre-dispatch failures can be
 * confirmed again (see pending.ts). Local mock invoices run against the
 * in-memory desk; PayPal sandbox invoices require a working sandbox toolkit —
 * there is no silent mock fallback.
 */
export async function executePendingAction(pending_action_id: string, owner: string | undefined): Promise<ExecResult> {
  const claim = claimPendingAction(pending_action_id, owner);
  if (!claim.ok) {
    return {
      httpStatus: claim.httpStatus,
      body: errorBody(claim.code, claim.error, claim.result ? { previous_result: claim.result } : {}),
    };
  }
  const action = claim.record;

  if (mock.isLocalMockInvoice(action.invoice_id)) {
    try {
      const body = executeMockAction(action);
      completePendingAction(action.id, body);
      return { httpStatus: 200, body };
    } catch (err) {
      const isState = err instanceof mock.InvoiceStateError;
      const isMissing = err instanceof mock.InvoiceNotFoundError;
      failPendingAction(action.id, safeText(err instanceof Error ? err.message : err, 200), "definite");
      if (isState || isMissing) {
        return {
          httpStatus: isState ? 409 : 404,
          body: errorBody(isState ? "invalid_invoice_state" : "invoice_not_found", safeText((err as Error).message), { retryable: false }),
        };
      }
      logServerError("mock action failed:", err);
      return { httpStatus: 500, body: errorBody("internal_error", "Unexpected error; nothing was changed.", { retryable: false }) };
    }
  }

  const live = await getLiveToolkitTools();
  const probe = live ? await probePayPalInvoicing() : { ok: false, message: "PayPal sandbox not configured" };
  if (!live || !probe.ok) {
    // Nothing was dispatched: safe to allow another Confirm.
    const retryable = releasePendingAction(action.id, "paypal unavailable");
    return {
      httpStatus: 503,
      body: errorBody(
        "paypal_unavailable",
        `PayPal sandbox is unavailable (${safeText(probe.message || "not configured", 160)}); nothing was sent.`,
        { retryable }
      ),
    };
  }
  const out = await executeLiveAction(action, live);
  if (out.ok) {
    completePendingAction(action.id, out.body);
    return { httpStatus: 200, body: out.body };
  }
  if (out.kind === "predispatch") {
    const retryable = releasePendingAction(action.id, out.error);
    return { httpStatus: out.httpStatus, body: errorBody(out.code, out.error, { retryable }) };
  }
  failPendingAction(action.id, out.error, out.kind);
  return {
    httpStatus: out.httpStatus,
    body: errorBody(out.code, out.error, {
      retryable: false,
      ...(out.kind === "outcome_unknown" ? { outcome_unknown: true, reconcile: true } : {}),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Live PayPal sandbox tools                                           */
/* ------------------------------------------------------------------ */

/**
 * Compact schemas for the LLM (toolkit schemas blow small TPM budgets). When the
 * sandbox probe passes, create/list execute on PayPal sandbox and report errors
 * honestly instead of creating a fake local draft. When it fails, the local
 * mock tools are used and every result says `source: "local-mock"`.
 */
export async function getInvoiceTools(opts: { owner: string }): Promise<{ tools: ToolMap; source: InvoiceSource }> {
  const mockTools = buildMockInvoiceTools(opts);
  const live = await getLiveToolkitTools();
  if (!live) return { tools: mockTools, source: "local-mock" };
  const probe = await probePayPalInvoicing();
  if (!probe.ok) return { tools: mockTools, source: "local-mock" };

  const merged: ToolMap = { ...mockTools };

  merged.create_invoice = aiTool({
    description:
      "Create a DRAFT invoice on PayPal sandbox. Does NOT send. On error nothing is created; report the error.",
    parameters: createSchema,
    execute: async (args, toolOpts) => {
      const currency = (args.currency_code || "USD").toUpperCase();
      let total: string;
      try {
        total = mock.computeInvoiceTotal(args.items);
      } catch (err) {
        return { status: "error", source: "paypal-sandbox", error: safeText((err as Error).message) };
      }
      const liveArgs: Record<string, unknown> = {
        currency_code: currency,
        invoicer_business_name: process.env.MERCHANT_BUSINESS_NAME || "Quang Studio",
        note: args.note,
        primary_recipients: [
          {
            billing_info: {
              email_address: args.recipient_email,
              business_name: args.recipient_business,
              name: args.recipient_name ? { full_name: args.recipient_name } : undefined,
            },
          },
        ],
        items: args.items.map((it) => ({
          name: it.name,
          description: it.description,
          quantity: String(it.quantity ?? 1),
          unit_amount: { currency_code: currency, value: Number(it.unit_price).toFixed(2) },
        })),
      };
      // Do NOT set invoicer_email_address unless it is the sandbox merchant email —
      // a mismatched email causes send to fail with "User is not associated with paypal".
      if (process.env.MERCHANT_EMAIL_USE_ON_INVOICE === "true" && process.env.MERCHANT_EMAIL) {
        liveArgs.invoicer_email_address = process.env.MERCHANT_EMAIL;
      }
      let payload: any;
      try {
        payload = parseToolkitPayload(await live.create_invoice.execute(liveArgs, toolOpts));
      } catch (err) {
        logServerError("PayPal create threw:", err);
        return { status: "error", source: "paypal-sandbox", error: `PayPal sandbox create failed: ${publicPayPalError(err)}. No draft was created.` };
      }
      if (isAuthFailure(payload) || isPayPalError(payload)) {
        return { status: "error", source: "paypal-sandbox", error: `PayPal sandbox create failed: ${publicPayPalError(payload)}. No draft was created.` };
      }
      let liveId = extractPayPalInvoiceId(payload);
      let details: any = null;
      if (liveId && live.get_invoice?.execute) {
        try {
          details = parseToolkitPayload(
            await live.get_invoice.execute({ invoice_id: liveId }, { toolCallId: "post-create-get", messages: [] })
          );
          liveId = details?.id || liveId;
        } catch {
          /* ignore */
        }
      }
      if (!liveId) {
        return {
          status: "error",
          source: "paypal-sandbox",
          error: "PayPal sandbox returned no invoice id; the draft state is unknown. Check the PayPal sandbox dashboard.",
        };
      }
      const now = new Date();
      const due = new Date(now);
      due.setDate(due.getDate() + (args.due_days ?? 14));
      const desk = mock.upsertLiveInvoice({
        id: liveId,
        invoice_number: details?.detail?.invoice_number || liveId.replace(/^INV2-/, "PP-"),
        status: "DRAFT",
        currency_code: currency,
        recipient_email: args.recipient_email,
        recipient_name: args.recipient_name,
        recipient_business: args.recipient_business,
        note: args.note,
        due_date: due.toISOString().slice(0, 10),
        invoice_date: now.toISOString().slice(0, 10),
        items: args.items.map((it) => ({
          name: it.name,
          description: it.description,
          quantity: String(it.quantity ?? 1),
          unit_amount: { currency_code: currency, value: Number(it.unit_price).toFixed(2) },
        })),
        amount: {
          currency_code: currency,
          value: String(details?.amount?.value || details?.due_amount?.value || total),
        },
        href: details?.detail?.metadata?.recipient_view_url || undefined,
        reminder_count: 0,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      return {
        status: "draft_created_live",
        source: "paypal-sandbox",
        paypal_live: true,
        paypal_invoice_id: liveId,
        invoice: desk,
        formatted: formatInvoice(desk),
        next_step: "DRAFT on PayPal sandbox. Call send_invoice with this invoice.id to propose sending; the human must confirm.",
      };
    },
  });

  merged.list_invoices = aiTool({
    description: "List invoices from PayPal sandbox.",
    parameters: mockTools.list_invoices.parameters,
    execute: async (args: any) => {
      try {
        const normalized = await listLiveInvoices({ page: args.page || 1, page_size: args.page_size || 20 }, live);
        return {
          source: "paypal-sandbox",
          total: normalized.length,
          invoices: normalized,
          formatted: normalized.map(formatInvoice).join("\n\n") || "No invoices found.",
        };
      } catch (err) {
        return { status: "error", source: "paypal-sandbox", error: publicPayPalError(err) };
      }
    },
  });

  return { tools: merged, source: "paypal-sandbox" };
}

export class PayPalListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalListError";
  }
}

/** List invoices from PayPal sandbox. Throws PayPalListError instead of falling back to mock rows. */
export async function listLiveInvoices(
  opts: { page: number; page_size: number },
  liveTools?: ToolMap | null
): Promise<Invoice[]> {
  const live = liveTools ?? (await getLiveToolkitTools());
  if (!live?.list_invoices?.execute) throw new PayPalListError("PayPal sandbox list_invoices unavailable");
  let raw: unknown;
  try {
    raw = await live.list_invoices.execute(
      { page: opts.page, page_size: opts.page_size, total_required: true },
      { toolCallId: "api-list", messages: [] }
    );
  } catch (err) {
    throw new PayPalListError(publicPayPalError(err, "PayPal list failed"));
  }
  return normalizePayPalList(parseToolkitPayload(raw));
}

/** Normalize a PayPal list payload into desk rows tagged paypal-sandbox. */
export function normalizePayPalList(parsed: any): Invoice[] {
  if (isAuthFailure(parsed)) {
    throw new PayPalListError("PayPal Invoicing not authorized on this sandbox app (enable Invoicing under Features).");
  }
  if (isPayPalError(parsed)) throw new PayPalListError(publicPayPalError(parsed, "PayPal list failed"));
  const itemsRaw = parsed?.items || parsed?.invoices || parsed?.result?.items || [];
  return (Array.isArray(itemsRaw) ? itemsRaw : []).map((row: any, idx: number) => {
    const amount = row.amount || row.due_amount || {};
    const recipient = row.primary_recipients?.[0]?.billing_info || row.primary_recipients?.[0] || {};
    const currency = amount.currency_code || row.detail?.currency_code || "USD";
    const status = String(row.status || "DRAFT").toUpperCase() as Invoice["status"];
    return {
      id: row.id || row.invoice_id || `pp-${idx}`,
      invoice_number: row.detail?.invoice_number || row.invoice_number || row.id || `INV-${idx}`,
      status,
      currency_code: currency,
      recipient_email: recipient.email_address || "unknown@example.com",
      recipient_name: recipient.name?.full_name,
      recipient_business: recipient.business_name,
      amount: { currency_code: currency, value: String(amount.value ?? "0.00") },
      due_date: row.detail?.payment_term?.due_date || row.due_date,
      invoice_date: row.detail?.invoice_date || new Date().toISOString().slice(0, 10),
      href: row.detail?.metadata?.recipient_view_url || row.href,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: [],
      reminder_count: 0,
      source: "paypal-sandbox",
    } as Invoice;
  });
}

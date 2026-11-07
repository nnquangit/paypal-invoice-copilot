"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmCard } from "./ConfirmCard";
import { renderMarkdownLite } from "@/lib/markdown-lite";
import type { AppMode, PendingAction } from "@/lib/types";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pendingAction?: PendingAction;
};

const SUGGESTIONS = [
  "Invoice Acme Sandbox LLC at buyer-sandbox@example.com $500 for logo design, due in 14 days",
  "Who owes me money?",
  "List my unpaid invoices",
  "Remind Acme about their invoice",
  "Show QR for INV-1001",
];

/** History sent to /api/chat (server caps at 40 messages). */
const HISTORY_LIMIT = 30;

type ConfirmResponse = {
  status?: string;
  code?: string;
  error?: string;
  retryable?: boolean;
  source?: string;
  href?: string;
  paypal_status?: string;
  invoice?: { id?: string; invoice_number?: string; recipient_email?: string; reminder_count?: number; href?: string };
  previous_result?: ConfirmResponse;
};

function where(data: ConfirmResponse): string {
  return data.source === "paypal-sandbox"
    ? "on PayPal sandbox"
    : "in the local mock desk (no PayPal call, no email sent)";
}

function describeSuccess(data: ConfirmResponse): string {
  const num = data.invoice?.invoice_number || data.invoice?.id || "invoice";
  const link = data.href || data.invoice?.href;
  switch (data.status) {
    case "sent":
      return `Sent **${num}**${data.invoice?.recipient_email ? ` to ${data.invoice.recipient_email}` : ""} ${where(data)}.${
        data.invoice?.id ? `\nID: \`${data.invoice.id}\`` : ""
      }${link ? `\nLink: ${link}` : ""}`;
    case "reminded":
      return `Reminder recorded for **${num}** ${where(data)} (reminders: ${data.invoice?.reminder_count ?? "?"}).`;
    case "cancelled":
      return `Cancelled **${num}** ${where(data)}.`;
    default:
      return `Done (${data.status || "ok"}) ${where(data)}.`;
  }
}

export function ChatPanel({
  mode,
  onInvoicesChanged,
}: {
  mode: AppMode | null;
  onInvoicesChanged: () => void;
}) {
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to **PayPal Invoice Copilot**.\n\nTell me who to bill in plain English — I'll draft a PayPal invoice, then ask before sending, reminding, or cancelling.\n\nTry: `Invoice Acme Corp $500 for logo design, due in 14 days`",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next
            .slice(-HISTORY_LIMIT)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data) throw new Error(`HTTP ${res.status}`);
      const assistant: UiMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.text || data.error || (res.ok ? "Done." : `Request failed (HTTP ${res.status}).`),
        pendingAction: res.ok ? data.pendingAction || undefined : undefined,
      };
      // Also surface needs_confirmation from toolResults (LLM path)
      if (res.ok && !assistant.pendingAction && Array.isArray(data.toolResults)) {
        for (const tr of data.toolResults) {
          const result = tr?.result || tr;
          if (result?.status === "needs_confirmation" && result.pending_action_id) {
            assistant.pendingAction = {
              id: result.pending_action_id,
              tool: result.tool,
              invoice_id: result.invoice_id,
              summary: result.summary,
              args: {},
              created_at: new Date().toISOString(),
            };
          }
        }
      }
      setMessages((m) => [...m, assistant]);
      onInvoicesChanged();
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `Something went wrong: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(action: PendingAction, confirmed: boolean) {
    setConfirmBusy(action.id);
    let text: string;
    let keepCard = false;
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending_action_id: action.id,
          confirmed,
        }),
      });
      const data = ((await res.json().catch(() => null)) || {}) as ConfirmResponse;
      if (res.ok && data.status !== "error") {
        text = confirmed ? describeSuccess(data) : "Okay — I cancelled that action. Nothing was sent.";
      } else if (data.code === "already_executed" && data.previous_result) {
        text = `Already done earlier — not repeated. ${describeSuccess(data.previous_result)}`;
      } else {
        keepCard = Boolean(data.retryable);
        text = `Not executed (HTTP ${res.status}${data.code ? ` · ${data.code}` : ""}): ${
          data.error || "unknown error"
        }${keepCard ? "\nYou can press Confirm again to retry." : ""}`;
      }
    } catch (err) {
      // Browser↔server failure: keep the card. Pressing Confirm again is safe because
      // the server dispatches each pending action at most once and otherwise
      // answers with the stored result or an outcome_unknown notice.
      keepCard = true;
      text = `Could not reach the server (${err instanceof Error ? err.message : "network error"}). Press Confirm again to see the result; the server will not dispatch it twice.`;
    } finally {
      setConfirmBusy(null);
    }

    setMessages((m) => [
      ...m.map((msg) =>
        msg.pendingAction?.id === action.id && !keepCard ? { ...msg, pendingAction: undefined } : msg
      ),
      {
        id: `c-${Date.now()}`,
        role: "assistant",
        content: text,
      },
    ]);
    onInvoicesChanged();
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-[var(--pp-border)] bg-white/95 shadow-sm backdrop-blur">
      <div className="border-b border-[var(--pp-border)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#003087] to-[#009cde] text-sm font-bold text-white shadow-md shadow-sky-700/20">
            IC
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--pp-navy)]">
              Invoice Copilot
            </h1>
            <p className="text-xs text-[var(--pp-muted)]">
              Chat → draft → confirm → PayPal
              {mode
                ? mode.paypalEnvironment === "sandbox"
                  ? " · PayPal sandbox"
                  : " · local mock desk (no PayPal calls)"
                : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`fade-up flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] ${
                m.role === "user"
                  ? "bg-[var(--pp-blue)] text-white shadow-md shadow-sky-900/10"
                  : "border border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="prose-chat">{renderMarkdownLite(m.content)}</div>
              ) : (
                m.content
              )}
              {m.pendingAction && (
                <ConfirmCard
                  action={m.pendingAction}
                  busy={confirmBusy === m.pendingAction.id}
                  onConfirm={() => handleConfirm(m.pendingAction!, true)}
                  onCancel={() => handleConfirm(m.pendingAction!, false)}
                />
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="fade-up text-xs text-slate-500">Copilot is working…</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--pp-border)] p-4">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
            >
              {s.length > 42 ? s.slice(0, 42) + "…" : s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='e.g. Invoice Northwind $1,200 for website redesign, due in 30 days'
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-sky-200 placeholder:text-slate-400 focus:border-sky-300 focus:ring-2"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-2xl bg-gradient-to-br from-[#003087] to-[#009cde] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-sky-700/20 transition hover:brightness-110 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </section>
  );
}

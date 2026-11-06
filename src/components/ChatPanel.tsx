"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmCard } from "./ConfirmCard";
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

function renderMarkdownLite(text: string) {
  // very small markdown subset for demo responses
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\((data:image[^)]+)\)/g, '<img alt="$1" src="$2" class="mt-2 rounded-lg border border-slate-200 bg-white p-2" width="140" height="140" />')
    .replace(/\n/g, "<br/>");
  return { __html: html };
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
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const assistant: UiMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.text || "Done.",
        pendingAction: data.pendingAction || undefined,
      };
      // Also surface needs_confirmation from toolResults (LLM path)
      if (!assistant.pendingAction && Array.isArray(data.toolResults)) {
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
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending_action_id: action.id,
          confirmed,
        }),
      });
      const data = await res.json();
      const text = confirmed
        ? data.status === "sent"
          ? `Sent **${data.invoice?.invoice_number}** to ${data.invoice?.recipient_email}.\nLink: ${data.invoice?.href || "PayPal invoice"}`
          : data.status === "reminded"
            ? `Reminder sent for **${data.invoice?.invoice_number}** (reminders: ${data.invoice?.reminder_count}).`
            : data.status === "cancelled"
              ? `Cancelled **${data.invoice?.invoice_number}**.`
              : data.status === "executed_live"
                ? `Executed on live PayPal sandbox: \`${data.tool}\`.`
                : data.fell_back_from_live && data.invoice
                  ? `Sent **${data.invoice?.invoice_number}** (local desk; PayPal Invoicing not authorized on this app yet).\nLink: ${data.invoice?.href || "n/a"}`
                  : JSON.stringify(data, null, 2)
        : "Okay — I cancelled that action. Nothing was sent.";

      setMessages((m) => [
        ...m.map((msg) =>
          msg.pendingAction?.id === action.id
            ? { ...msg, pendingAction: undefined }
            : msg
        ),
        {
          id: `c-${Date.now()}`,
          role: "assistant",
          content: text,
        },
      ]);
      onInvoicesChanged();
    } finally {
      setConfirmBusy(null);
    }
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
              {mode?.demoMode ? " · demo-ready without keys" : " · live sandbox"}
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
                <div
                  className="prose-chat"
                  dangerouslySetInnerHTML={renderMarkdownLite(m.content)}
                />
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

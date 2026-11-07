"use client";

import { statusColor } from "@/lib/status";
import type { Invoice } from "@/lib/types";

export function InvoiceDashboard({
  invoices,
  summary,
  loading,
  onRefresh,
  source,
  error,
}: {
  source?: string;
  error?: string;
  invoices: Invoice[];
  summary?: {
    unpaid_count: number;
    unpaid_total: string;
    paid_total: string;
    draft_count: number;
  } | null;
  loading?: boolean;
  onRefresh: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-3xl border border-[var(--pp-border)] bg-white/90 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between border-b border-[var(--pp-border)] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--pp-navy)]">Invoice desk</h2>
          <p className="text-xs text-[var(--pp-muted)]">
            {source === "paypal-sandbox"
              ? "Source: PayPal sandbox"
              : source === "local-mock"
                ? "Source: local mock desk (not PayPal)"
                : "Source: unknown"}
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div role="alert" className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-2 border-b border-[var(--pp-border)] p-4">
          <Stat label="Unpaid" value={`$${summary.unpaid_total}`} hint={`${summary.unpaid_count} open`} accent="sky" />
          <Stat label="Collected" value={`$${summary.paid_total}`} hint="paid" accent="emerald" />
          <Stat label="Drafts" value={String(summary.draft_count)} hint="ready to send" accent="amber" />
          <Stat label="Visible" value={String(invoices.length)} hint="this panel" accent="slate" />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {invoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            No invoices yet. Ask the copilot to create one.
          </div>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="fade-up rounded-2xl border border-slate-150 border-slate-200 bg-slate-50/60 p-3 transition hover:border-sky-200 hover:bg-sky-50/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {inv.recipient_business || inv.recipient_name || inv.recipient_email}
                    </div>
                    <div className="text-xs text-slate-500">{inv.invoice_number}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor(inv.status)}`}
                  >
                    {inv.status}
                  </span>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div className="text-base font-semibold text-[var(--pp-navy)]">
                    {inv.amount.currency_code} {inv.amount.value}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Due {inv.due_date || "—"}
                  </div>
                </div>
                <div className="mt-1 truncate text-[11px] text-slate-400">{inv.recipient_email}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent: "sky" | "emerald" | "amber" | "slate";
}) {
  const map = {
    sky: "from-sky-50 to-white border-sky-100",
    emerald: "from-emerald-50 to-white border-emerald-100",
    amber: "from-amber-50 to-white border-amber-100",
    slate: "from-slate-50 to-white border-slate-100",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-3 ${map[accent]}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}

"use client";

import type { PendingAction } from "@/lib/types";

export function ConfirmCard({
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  action: PendingAction;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const label =
    action.tool === "send_invoice"
      ? "Send invoice"
      : action.tool === "send_invoice_reminder"
        ? "Send reminder"
        : "Cancel invoice";

  return (
    <div className="fade-up mt-3 overflow-hidden rounded-2xl border border-[#009cde]/40 bg-gradient-to-br from-[#003087] to-[#001c64] text-white shadow-lg shadow-sky-900/10">
      <div className="border-b border-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100">
        Human confirmation required
      </div>
      <div className="px-4 py-3">
        <div className="text-sm font-semibold">{label}</div>
        <p className="mt-1 text-sm text-sky-50/90">{action.summary}</p>
        <p className="mt-2 text-xs text-sky-100/70">
          Invoice ID: <code className="rounded bg-white/10 px-1">{action.invoice_id}</code>
        </p>
        <div className="mt-4 flex gap-2">
          <button
            disabled={busy}
            onClick={onConfirm}
            className="rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-[#003087] transition hover:bg-sky-50 disabled:opacity-60"
          >
            {busy ? "Working…" : "Confirm"}
          </button>
          <button
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-white/25 bg-white/5 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

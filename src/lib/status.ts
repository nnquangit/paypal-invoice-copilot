import type { InvoiceStatus } from "./types";

export function statusColor(status: InvoiceStatus | string): string {
  switch (status) {
    case "PAID":
    case "MARKED_AS_PAID":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "SENT":
    case "UNPAID":
    case "PAYMENT_PENDING":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "DRAFT":
    case "SCHEDULED":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "CANCELLED":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "PARTIALLY_PAID":
      return "bg-violet-50 text-violet-700 border-violet-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

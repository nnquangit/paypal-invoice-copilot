"use client";

import type { AppMode } from "@/lib/types";

export function ModeBadge({ mode }: { mode: AppMode | null }) {
  if (!mode) return null;
  const liveLlm = mode.llmConfigured && !mode.demoMode;
  const paypalOk = mode.paypalConfigured;
  const invoicingOk = mode.paypalInvoicingOk === true;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
          liveLlm
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${liveLlm ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        {liveLlm ? "Live LLM" : "Demo mode"}
      </span>
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
        PayPal: {mode.paypalEnvironment}
        {paypalOk ? (invoicingOk ? " · invoicing OK" : " · OAuth OK, invoicing off") : ""}
      </span>
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
        LLM: {mode.llmConfigured ? `${mode.llmProvider}${mode.llmModel ? ` · ${mode.llmModel}` : ""}` : "built-in demo agent"}
      </span>
    </div>
  );
}

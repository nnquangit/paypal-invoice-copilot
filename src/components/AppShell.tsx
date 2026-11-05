"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { InvoiceDashboard } from "./InvoiceDashboard";
import { ModeBadge } from "./ModeBadge";
import type { AppMode, Invoice } from "@/lib/types";

export function AppShell() {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<{
    unpaid_count: number;
    unpaid_total: string;
    paid_total: string;
    draft_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [health, inv] = await Promise.all([
        fetch("/api/health").then((r) => r.json()),
        fetch("/api/invoices").then((r) => r.json()),
      ]);
      setMode(health.mode);
      if (inv.items) setInvoices(inv.items);
      if (inv.summary) setSummary(inv.summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#009cde]">
            PayPal AI Hackathon
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--pp-navy)]">
            Invoice Copilot
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--pp-muted)]">
            Agentic commerce for freelancers — create, send, remind, and settle PayPal
            invoices from a single chat.
          </p>
        </div>
        <ModeBadge mode={mode} />
      </header>

      <div className="grid min-h-[72vh] flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.9fr)]">
        <ChatPanel mode={mode} onInvoicesChanged={refresh} />
        <InvoiceDashboard
          invoices={invoices}
          summary={summary}
          loading={loading}
          onRefresh={refresh}
        />
      </div>

      <footer className="pb-2 text-center text-[11px] text-slate-400">
        MIT © Quang Ngo · Built with PayPal Agent Toolkit + Vercel AI SDK ·{" "}
        <a
          className="underline hover:text-sky-700"
          href="https://paypalaihackathon.devpost.com/"
          target="_blank"
          rel="noreferrer"
        >
          Hackathon
        </a>
      </footer>
    </div>
  );
}

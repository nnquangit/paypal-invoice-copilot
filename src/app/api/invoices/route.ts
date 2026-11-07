import { NextResponse } from "next/server";
import { isPayPalConfigured } from "@/lib/config";
import { guardRequest } from "@/lib/access";
import { logServerError, publicPayPalError } from "@/lib/errors";
import * as mock from "@/lib/mock-store";
import { listLiveInvoices } from "@/lib/paypal-tools";

export const runtime = "nodejs";

function intParam(v: string | null, def: number, min: number, max: number): number {
  const n = Math.floor(Number(v ?? def));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

export async function GET(req: Request) {
  const blocked = guardRequest(req, { mutation: false });
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.slice(0, 30) || undefined;
  const page = intParam(searchParams.get("page"), 1, 1, 1000);
  const page_size = intParam(searchParams.get("page_size"), 50, 1, 100);

  if (isPayPalConfigured()) {
    try {
      let items = await listLiveInvoices({ page, page_size });
      if (status) items = items.filter((i) => i.status === status);
      return NextResponse.json({
        source: "paypal-sandbox",
        total: items.length,
        items,
        summary: mock.summarizeInvoices(items),
        status,
      });
    } catch (err) {
      logServerError("PayPal sandbox list failed:", err);
      // No silent fallback to mock rows: report the failure.
      return NextResponse.json(
        {
          source: "paypal-sandbox",
          error: `PayPal sandbox list failed: ${publicPayPalError(err)}`,
          total: 0,
          items: [],
          summary: null,
        },
        { status: 502 }
      );
    }
  }

  const { items, total } = mock.listInvoices({ page, page_size, status });
  return NextResponse.json({ source: "local-mock", total, items, summary: mock.summarizeOutstanding() });
}

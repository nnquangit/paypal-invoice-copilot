import { NextResponse } from "next/server";
import { isPayPalConfigured } from "@/lib/config";
import * as mock from "@/lib/mock-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const page = Number(searchParams.get("page") || 1);
  const page_size = Number(searchParams.get("page_size") || 50);

  // Live list via toolkit when configured; otherwise mock store (also used as cache UI).
  if (isPayPalConfigured()) {
    try {
      const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
      const toolkit = new PayPalAgentToolkit({
        clientId: process.env.PAYPAL_CLIENT_ID!,
        clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
        configuration: {
          actions: { invoices: { list: true } },
          context: {
            sandbox: (process.env.PAYPAL_ENVIRONMENT || "sandbox") !== "live",
          },
        },
      });
      const tools = toolkit.getTools();
      const listTool = tools.list_invoices as {
        execute?: (a: unknown, o: unknown) => Promise<unknown>;
      };
      if (listTool?.execute) {
        const result = await listTool.execute(
          { page, page_size, total_required: true },
          { toolCallId: "api-list", messages: [] }
        );
        return NextResponse.json({ source: "paypal", result, status });
      }
    } catch (err) {
      console.error("live list failed, using mock", err);
    }
  }

  const { items, total } = mock.listInvoices({ page, page_size, status });
  const summary = mock.summarizeOutstanding();
  return NextResponse.json({ source: "mock", total, items, summary });
}

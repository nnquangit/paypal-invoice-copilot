import { NextResponse } from "next/server";
import { getAppMode, getLlmModel } from "@/lib/config";
import { probePayPalInvoicing } from "@/lib/paypal-tools";

export const runtime = "nodejs";

export async function GET() {
  const mode = getAppMode();
  const probe = mode.paypalConfigured
    ? await probePayPalInvoicing()
    : { ok: false, message: "PayPal not configured" };

  return NextResponse.json({
    ok: true,
    app: "paypal-invoice-copilot",
    mode: {
      ...mode,
      paypalInvoicingOk: probe.ok,
      paypalInvoicingMessage: probe.message,
      llmModel: getLlmModel(),
    },
    time: new Date().toISOString(),
  });
}

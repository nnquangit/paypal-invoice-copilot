import { NextResponse } from "next/server";
import { getAppMode, getLlmModel, liveCredentialsActive } from "@/lib/config";
import { isLoopbackRequest } from "@/lib/access";
import { probePayPalInvoicing } from "@/lib/paypal-tools";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const mode = getAppMode();
  // Never trigger PayPal calls for remote callers while live credentials are active.
  const liveAccess = !liveCredentialsActive() || isLoopbackRequest(req);
  const probe =
    mode.paypalConfigured && liveAccess
      ? await probePayPalInvoicing()
      : {
          ok: false,
          message: mode.paypalConfigured
            ? "Not probed: live mode only answers loopback requests"
            : mode.paypalConfigError || "PayPal not configured (local mock desk)",
        };

  return NextResponse.json({
    ok: true,
    app: "paypal-invoice-copilot",
    mode: {
      ...mode,
      liveAccess,
      paypalInvoicingOk: probe.ok,
      paypalInvoicingMessage: probe.message,
      llmModel: mode.llmConfigured ? getLlmModel() : undefined,
    },
    time: new Date().toISOString(),
  });
}

import { NextResponse } from "next/server";
import { getAppMode } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "paypal-invoice-copilot",
    mode: getAppMode(),
    time: new Date().toISOString(),
  });
}

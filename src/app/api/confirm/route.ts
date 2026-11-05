import { NextResponse } from "next/server";
import { executePendingAction } from "@/lib/paypal-tools";
import * as mock from "@/lib/mock-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { pending_action_id, confirmed } = body as {
    pending_action_id?: string;
    confirmed?: boolean;
  };

  if (!pending_action_id) {
    return NextResponse.json({ error: "pending_action_id required" }, { status: 400 });
  }

  if (!confirmed) {
    mock.consumePendingAction(pending_action_id);
    return NextResponse.json({ status: "cancelled_by_user" });
  }

  const result = await executePendingAction(pending_action_id);
  return NextResponse.json(result);
}

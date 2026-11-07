import { z } from "zod";
import { getSessionId, guardRequest } from "@/lib/access";
import { logServerError } from "@/lib/errors";
import { cancelPendingAction } from "@/lib/pending";
import { executePendingAction } from "@/lib/paypal-tools";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    pending_action_id: z.string().min(1).max(200),
    confirmed: z.boolean(),
  })
  .strict();

/**
 * The only path that executes send / remind / cancel. Requires the same browser
 * session (HttpOnly cookie) that received the proposal. Status codes:
 * 200 done · 400 bad body · 403 other session / cross-origin / remote in live mode
 * 404 unknown or invoice gone · 409 already executed / in progress / failed /
 * outcome_unknown / cancelled / invalid invoice state · 410 expired ·
 * 415 not JSON · 502 PayPal rejected (definite) or outcome_unknown (dispatched,
 * result unknown: not retried, reconcile in PayPal) · 503 PayPal unavailable
 * before dispatch (retryable) · 500 unexpected.
 */
export async function POST(req: Request) {
  const blocked = guardRequest(req, { mutation: true });
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ status: "error", code: "bad_request", error: "Body must be valid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { status: "error", code: "bad_request", error: "Expected { pending_action_id: string, confirmed: boolean }." },
      { status: 400 }
    );
  }
  const { pending_action_id, confirmed } = parsed.data;
  const owner = getSessionId(req);

  try {
    if (!confirmed) {
      const res = cancelPendingAction(pending_action_id, owner);
      if (!res.ok) {
        return Response.json({ status: "error", code: res.code, error: res.error }, { status: res.httpStatus });
      }
      return Response.json({ status: "cancelled_by_user" });
    }
    const { httpStatus, body } = await executePendingAction(pending_action_id, owner);
    return Response.json(body, { status: httpStatus });
  } catch (err) {
    logServerError("confirm route error:", err);
    return Response.json(
      { status: "error", code: "internal_error", error: "Unexpected server error; the action outcome was not recorded." },
      { status: 500 }
    );
  }
}

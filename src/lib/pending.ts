/**
 * Server-side human-in-the-loop store for send / remind / cancel.
 *
 * Only POST /api/confirm can move an action past `pending`; no LLM tool can.
 *
 * Lifecycle:
 *   pending ──claim──▶ executing ──▶ succeeded        (done)
 *                                 ├▶ failed           (definite failure, terminal)
 *                                 ├▶ outcome_unknown  (request dispatched, result unknown, terminal)
 *                                 └▶ pending          (released: failed BEFORE anything was dispatched)
 *   pending ──cancel──▶ cancelled
 *
 * Guarantee (per Node process): each pending action is dispatched to PayPal at
 * most once. Only a failure proven to happen before dispatch (PayPal toolkit /
 * probe unavailable) returns the action to `pending` for another Confirm, up to
 * MAX_ATTEMPTS. A dispatched call that throws or returns an ambiguous error is
 * terminal `outcome_unknown`: the user must check PayPal before proposing a new
 * action. This is NOT an end-to-end exactly-once guarantee: state lives in
 * process memory (lost on restart, not shared across instances), and a user can
 * always propose the same action again.
 */
import { randomUUID } from "node:crypto";
import type { PendingAction } from "./types";

export type PendingState =
  | "pending"
  | "executing"
  | "succeeded"
  | "failed"
  | "outcome_unknown"
  | "cancelled";

export interface PendingRecord extends PendingAction {
  owner: string;
  state: PendingState;
  /** Number of claims (dispatch attempts including pre-dispatch releases). */
  attempts: number;
  expires_at: number;
  result?: Record<string, unknown>;
  last_error?: string;
}

export const TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const MAX_RECORDS = 500;

const g = globalThis as unknown as { __pendingActionsV2?: Map<string, PendingRecord> };

function table(): Map<string, PendingRecord> {
  if (!g.__pendingActionsV2) g.__pendingActionsV2 = new Map();
  return g.__pendingActionsV2;
}

function prune(now = Date.now()) {
  const t = table();
  for (const [id, r] of t) {
    if (r.expires_at < now && r.state !== "executing") t.delete(id);
  }
  // Hard bound: drop oldest non-executing records first.
  while (t.size >= MAX_RECORDS) {
    const oldest = [...t.values()].find((r) => r.state !== "executing");
    if (!oldest) break;
    t.delete(oldest.id);
  }
}

export function createPendingAction(input: {
  tool: PendingAction["tool"];
  invoice_id: string;
  summary: string;
  owner: string;
  args?: Record<string, unknown>;
}): PendingAction {
  if (!input.owner) throw new Error("pending action requires an owner session");
  prune();
  const now = Date.now();
  const rec: PendingRecord = {
    id: `pending-${randomUUID()}`,
    tool: input.tool,
    invoice_id: input.invoice_id,
    summary: input.summary,
    args: input.args || {},
    created_at: new Date(now).toISOString(),
    owner: input.owner,
    state: "pending",
    attempts: 0,
    expires_at: now + TTL_MS,
  };
  table().set(rec.id, rec);
  return publicView(rec);
}

export function publicView(r: PendingRecord): PendingAction {
  return {
    id: r.id,
    tool: r.tool,
    invoice_id: r.invoice_id,
    summary: r.summary,
    args: r.args,
    created_at: r.created_at,
  };
}

export const RECONCILE_MESSAGE =
  "The request reached (or may have reached) PayPal but the result is unknown. It will not be retried automatically. Check the invoice in the PayPal sandbox dashboard before proposing a new action.";

export type ClaimError = {
  ok: false;
  httpStatus: number;
  code:
    | "not_found"
    | "forbidden"
    | "expired"
    | "in_progress"
    | "already_executed"
    | "failed"
    | "outcome_unknown"
    | "cancelled"
    | "too_many_attempts";
  error: string;
  result?: Record<string, unknown>;
};

function check(id: string, owner: string | undefined, now: number): PendingRecord | ClaimError {
  const r = table().get(id);
  if (!r) {
    return {
      ok: false,
      httpStatus: 404,
      code: "not_found",
      error:
        "Pending action not found. It may have expired, or the server restarted (pending actions live in this process's memory only).",
    };
  }
  if (!owner || r.owner !== owner) {
    return { ok: false, httpStatus: 403, code: "forbidden", error: "This pending action belongs to a different browser session." };
  }
  switch (r.state) {
    case "executing":
      return { ok: false, httpStatus: 409, code: "in_progress", error: "This action is already being executed." };
    case "succeeded":
      return { ok: false, httpStatus: 409, code: "already_executed", error: "This action was already executed; it will not run twice.", result: r.result };
    case "failed":
      return { ok: false, httpStatus: 409, code: "failed", error: `This action already failed (${r.last_error || "error"}); it will not be retried. Propose a new one if needed.` };
    case "outcome_unknown":
      return { ok: false, httpStatus: 409, code: "outcome_unknown", error: RECONCILE_MESSAGE };
    case "cancelled":
      return { ok: false, httpStatus: 409, code: "cancelled", error: "This action was cancelled." };
  }
  if (r.expires_at < now) {
    return { ok: false, httpStatus: 410, code: "expired", error: "This pending action expired. Ask the copilot again." };
  }
  return r;
}

/** Atomically move pending → executing for the owning session. */
export function claimPendingAction(
  id: string,
  owner: string | undefined,
  now = Date.now()
): { ok: true; record: PendingRecord } | ClaimError {
  const r = check(id, owner, now);
  if ("ok" in r) return r;
  if (r.attempts >= MAX_ATTEMPTS) {
    r.state = "failed";
    r.last_error = "too many attempts";
    return { ok: false, httpStatus: 409, code: "too_many_attempts", error: `Gave up after ${MAX_ATTEMPTS} attempts.` };
  }
  r.state = "executing";
  r.attempts += 1;
  return { ok: true, record: r };
}

export function completePendingAction(id: string, result: Record<string, unknown>) {
  const r = table().get(id);
  if (!r) return;
  r.state = "succeeded";
  r.result = result;
}

/**
 * Terminal failure. `definite` = the provider (or local store) clearly rejected
 * the action; `outcome_unknown` = it was dispatched and may have taken effect.
 */
export function failPendingAction(id: string, error: string, kind: "definite" | "outcome_unknown") {
  const r = table().get(id);
  if (!r) return;
  r.last_error = error;
  r.state = kind === "definite" ? "failed" : "outcome_unknown";
}

/**
 * Failure proven to happen BEFORE anything was sent to PayPal: return the action
 * to `pending` so the user may press Confirm again (bounded by MAX_ATTEMPTS).
 * Returns true when another attempt is allowed.
 */
export function releasePendingAction(id: string, error: string): boolean {
  const r = table().get(id);
  if (!r) return false;
  r.last_error = error;
  if (r.attempts >= MAX_ATTEMPTS) {
    r.state = "failed";
    return false;
  }
  r.state = "pending";
  return true;
}

export function cancelPendingAction(
  id: string,
  owner: string | undefined,
  now = Date.now()
): { ok: true } | ClaimError {
  const r = check(id, owner, now);
  if ("ok" in r) return r;
  r.state = "cancelled";
  return { ok: true };
}

export function getPendingRecord(id: string): PendingRecord | undefined {
  return table().get(id);
}

export function resetPending() {
  g.__pendingActionsV2 = new Map();
}

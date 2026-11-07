import { generateText } from "ai";
import { getAppMode, isLlmConfigured } from "@/lib/config";
import { ensureSession, guardRequest, withCookie } from "@/lib/access";
import { parseChatBody } from "@/lib/chat-input";
import { logServerError, publicLlmError } from "@/lib/errors";
import { getInvoiceTools } from "@/lib/paypal-tools";
import { runDemoAgent } from "@/lib/demo-agent";
import { getModel } from "@/lib/llm";
import { buildSystemPrompt } from "@/lib/system-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

type PendingOut = {
  id: string;
  tool: string;
  invoice_id: string;
  summary: string;
  args: Record<string, unknown>;
  created_at: string;
};

export async function POST(req: Request) {
  const blocked = guardRequest(req, { mutation: true });
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ type: "error", text: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = parseChatBody(raw);
  if (!parsed.ok) {
    return Response.json({ type: "error", text: parsed.error }, { status: 400 });
  }
  const messages = parsed.messages;
  const lastUser = messages[messages.length - 1];
  const mode = getAppMode();
  const session = ensureSession(req);

  // Zero-credential path: deterministic agent on the local mock desk.
  if (!isLlmConfigured()) {
    try {
      const result = await runDemoAgent(lastUser.content || "hello", { owner: session.id });
      return withCookie(
        Response.json(
          { type: "demo", source: "local-mock", text: result.text, pendingAction: result.pendingAction || null, mode },
          { headers: { "X-Invoice-Copilot-Mode": "demo-agent" } }
        ),
        session.setCookie
      );
    } catch (err) {
      logServerError("demo agent error:", err);
      return withCookie(
        Response.json({ type: "error", text: "The demo agent failed on this request; nothing was changed.", mode }, { status: 500 }),
        session.setCookie
      );
    }
  }

  try {
    const { tools, source } = await getInvoiceTools({ owner: session.id });
    const system = buildSystemPrompt({ ...mode, toolSource: source });
    const result = await generateText({
      model: getModel(),
      system,
      messages,
      tools,
      maxSteps: 6,
      temperature: 0.2,
    });

    // result.toolCalls/toolResults are the last step only; steps[] holds every step.
    const steps = (result.steps || []) as Array<{ toolCalls?: unknown[]; toolResults?: unknown[] }>;
    const toolCalls = steps.length ? steps.flatMap((s) => s.toolCalls || []) : result.toolCalls || [];
    const toolResults: unknown[] = steps.length
      ? steps.flatMap((s) => s.toolResults || [])
      : [...(result.toolResults || [])];

    let pendingAction: PendingOut | null = null;
    let draftInvoice: { id?: string } | null = null;
    for (const tr of toolResults as Array<{ result?: Record<string, unknown> }>) {
      const res = tr?.result;
      if (!res) continue;
      if (res.invoice && (res.status === "draft_created" || res.status === "draft_created_live")) {
        draftInvoice = res.invoice as { id?: string };
      }
      if (res.status === "needs_confirmation" && typeof res.pending_action_id === "string") {
        pendingAction = {
          id: res.pending_action_id,
          tool: String(res.tool),
          invoice_id: String(res.invoice_id),
          summary: String(res.summary),
          args: {},
          created_at: new Date().toISOString(),
        };
      }
    }
    // Propose (never execute) a send when the model created a draft but forgot send_invoice.
    if (!pendingAction && draftInvoice?.id && tools.send_invoice?.execute) {
      const queued = await tools.send_invoice.execute(
        { invoice_id: draftInvoice.id },
        { toolCallId: "auto-queue-send", messages: [] }
      );
      if (queued?.status === "needs_confirmation") {
        pendingAction = {
          id: queued.pending_action_id,
          tool: queued.tool,
          invoice_id: queued.invoice_id,
          summary: queued.summary,
          args: {},
          created_at: new Date().toISOString(),
        };
        toolResults.push({ toolName: "send_invoice", result: queued });
      }
    }

    return withCookie(
      Response.json({ type: "llm", source, text: result.text, toolCalls, toolResults, pendingAction, mode }),
      session.setCookie
    );
  } catch (err) {
    logServerError("chat LLM error:", err);
    return withCookie(
      Response.json({ type: "error", text: `LLM error: ${publicLlmError(err)}`, mode }, { status: 502 }),
      session.setCookie
    );
  }
}

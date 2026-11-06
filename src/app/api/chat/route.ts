import { streamText, generateText } from "ai";
import { getAppMode, isLlmConfigured } from "@/lib/config";
import { getInvoiceTools } from "@/lib/paypal-tools";
import { runDemoAgent } from "@/lib/demo-agent";
import { getModel } from "@/lib/llm";
import { buildSystemPrompt } from "@/lib/system-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const messages = (body.messages || []) as Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const mode = getAppMode();

  // Zero-credential demo path: deterministic agent, still streams-like JSON.
  if (!isLlmConfigured() || process.env.FORCE_DEMO_AGENT === "true") {
    const result = await runDemoAgent(lastUser?.content || "hello");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const payload = {
          type: "demo",
          text: result.text,
          pendingAction: result.pendingAction || null,
          mode,
        };
        controller.enqueue(encoder.encode(JSON.stringify(payload)));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/json",
        "X-Invoice-Copilot-Mode": "demo-agent",
      },
    });
  }

  const tools = await getInvoiceTools();
  const system = buildSystemPrompt(mode);

  // Prefer streaming when the client asks for it via Accept header.
  const wantsStream = (req.headers.get("accept") || "").includes("text/event-stream");

  if (wantsStream) {
    const result = streamText({
      model: getModel(),
      system,
      messages,
      tools,
      maxSteps: 6,
      temperature: 0.2,
    });
    return result.toDataStreamResponse({
      headers: { "X-Invoice-Copilot-Mode": "llm-stream" },
    });
  }

  try {
    const result = await generateText({
      model: getModel(),
      system,
      messages,
      tools,
      maxSteps: 6,
      temperature: 0.2,
    });

    // Flatten tool activity across maxSteps so the UI can surface Confirm cards.
    const toolCalls = [
      ...(result.toolCalls || []),
      ...((result.steps || []).flatMap((s: { toolCalls?: unknown[] }) => s.toolCalls || [])),
    ];
    const toolResults = [
      ...(result.toolResults || []),
      ...((result.steps || []).flatMap((s: { toolResults?: unknown[] }) => s.toolResults || [])),
    ];
    let pendingAction = null as null | {
      id: string;
      tool: string;
      invoice_id: string;
      summary: string;
      args: Record<string, unknown>;
      created_at: string;
    };
    let draftInvoice: any = null;
    for (const tr of toolResults as Array<{ result?: any; output?: any }>) {
      const res = (tr as any)?.result ?? (tr as any)?.output ?? tr;
      if (res?.invoice && (res.status === "draft_created" || res.status === "draft_created_live")) {
        draftInvoice = res.invoice;
      }
      if (res?.status === "needs_confirmation" && res.pending_action_id) {
        pendingAction = {
          id: res.pending_action_id,
          tool: res.tool,
          invoice_id: res.invoice_id,
          summary: res.summary,
          args: {},
          created_at: new Date().toISOString(),
        };
      }
    }
    // Guarantee a Confirm card after draft when the model forgot send_invoice.
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

    return Response.json({
      type: "llm",
      text: result.text,
      toolCalls,
      toolResults,
      pendingAction,
      mode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("chat LLM error:", message);
    return Response.json(
      {
        type: "error",
        text: `LLM error: ${message}`,
        mode,
      },
      { status: 502 }
    );
  }
}

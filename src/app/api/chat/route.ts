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

  const result = await generateText({
    model: getModel(),
    system,
    messages,
    tools,
    maxSteps: 6,
    temperature: 0.2,
  });

  return Response.json({
    type: "llm",
    text: result.text,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
    mode,
  });
}

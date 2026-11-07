import { z } from "zod";

export const MAX_MESSAGES = 40;
export const MAX_CONTENT_CHARS = 4000;
export const MAX_TOTAL_CHARS = 40000;

/**
 * Client-supplied history. Only "user" and "assistant" roles with plain string
 * content are accepted: "system", "tool", tool-call parts, or extra fields are
 * rejected so a client cannot inject system instructions or fake tool results.
 */
const messageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(MAX_CONTENT_CHARS),
  })
  .strict();

const bodySchema = z
  .object({
    messages: z.array(messageSchema).min(1).max(MAX_MESSAGES),
  })
  .strict();

export type ChatInputMessage = z.infer<typeof messageSchema>;

export function parseChatBody(
  body: unknown
): { ok: true; messages: ChatInputMessage[] } | { ok: false; error: string } {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.join(".") || "body";
    return { ok: false, error: `Invalid chat request at ${where}: ${issue?.message || "invalid"}` };
  }
  const messages = parsed.data.messages;
  const total = messages.reduce((n, m) => n + m.content.length, 0);
  if (total > MAX_TOTAL_CHARS) return { ok: false, error: "Conversation too long." };
  if (messages[messages.length - 1].role !== "user") {
    return { ok: false, error: "The last message must be from the user." };
  }
  return { ok: true, messages };
}

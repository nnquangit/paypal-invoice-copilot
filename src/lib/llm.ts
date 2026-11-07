import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getLlmBaseUrl, getLlmModel, isLlmConfigured } from "./config";

/**
 * OpenAI-compatible LLM. Works with:
 * - Groq (default): LLM_BASE_URL=https://api.groq.com/openai/v1  LLM_MODEL=openai/gpt-oss-20b
 * - OpenRouter:     LLM_BASE_URL=https://openrouter.ai/api/v1    LLM_MODEL=openrouter/free
 * - Gemini:         LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
 *                   LLM_MODEL=gemini-2.0-flash
 * - OpenAI:         LLM_BASE_URL=https://api.openai.com/v1       LLM_MODEL=gpt-4o-mini
 * Defaults live in config.ts (DEFAULT_LLM_BASE_URL / DEFAULT_LLM_MODEL).
 */
export function getModel() {
  const { url } = getLlmBaseUrl();
  if (!isLlmConfigured() || !url) {
    throw new Error("LLM not configured");
  }
  const provider = createOpenAICompatible({
    name: "invoice-copilot-llm",
    apiKey: process.env.LLM_API_KEY!,
    baseURL: url.toString().replace(/\/$/, ""),
  });
  return provider(getLlmModel());
}

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isLlmConfigured } from "./config";

/**
 * OpenAI-compatible LLM. Works with:
 * - Groq:       LLM_BASE_URL=https://api.groq.com/openai/v1  LLM_MODEL=llama-3.3-70b-versatile
 * - OpenRouter: LLM_BASE_URL=https://openrouter.ai/api/v1    LLM_MODEL=google/gemma-2-9b-it:free
 * - Gemini:     LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
 *               LLM_MODEL=gemini-2.0-flash
 * - OpenAI:     LLM_BASE_URL=https://api.openai.com/v1       LLM_MODEL=gpt-4o-mini
 */
export function getModel() {
  if (!isLlmConfigured()) {
    throw new Error("LLM_API_KEY not configured");
  }
  const baseURL = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  const modelId = process.env.LLM_MODEL || "llama-3.3-70b-versatile";
  const provider = createOpenAICompatible({
    name: "invoice-copilot-llm",
    apiKey: process.env.LLM_API_KEY!,
    baseURL,
  });
  return provider(modelId);
}

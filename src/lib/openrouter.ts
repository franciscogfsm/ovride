// Minimal OpenRouter client (OpenAI-compatible chat completions). Key stays server-side.
import { z } from "zod";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export const hasKey = () => Boolean(process.env.OPENROUTER_API_KEY);

// Models with dependable tool calling, main model first. Any other OpenRouter id can be typed in the UI.
export const MODELS = [
  { id: "z-ai/glm-5.3", label: "GLM 5.3", price: "$0.45 / $1.96" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", price: "$0.10 / $0.50" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", price: "$0.10 / $0.50" },
  { id: "deepseek/deepseek-v4.1-flash-1017", label: "DeepSeek V4.1 Flash", price: "$0.15 / $0.60" },
  { id: "qwen/qwen3.8-flash", label: "Qwen 3.8 Flash", price: "$0.15 / $0.47" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", price: "$0.83 / $4.13" },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", price: "$2 / $10" },
];

export const DEFAULT_MODEL = process.env.OVRIDE_MODEL || MODELS[0].id;

export const ModelId = z.string().max(100).regex(/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i, "Not an OpenRouter model id");

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatResponse = {
  model?: string;
  choices: { finish_reason: string | null; message: { content: string | null; tool_calls?: ToolCall[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

export async function chat(body: Record<string, unknown>, signal?: AbortSignal): Promise<ChatResponse> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/franciscogfsm/ovride",
      "X-Title": "OVRIDE",
    },
    body: JSON.stringify({ usage: { include: true }, ...body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as ChatResponse & { error?: { message?: string } };
  if (json.error || !json.choices?.length) throw new Error(`OpenRouter: ${json.error?.message ?? "empty response"}`);
  return json;
}

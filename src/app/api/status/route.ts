import { systemPrompt } from "@/lib/agent";
import { DEFAULT_POLICY, AGENT_PERMISSIONS } from "@/lib/policy";
import { TASK } from "@/lib/sandbox";
import { DEFAULT_MODEL, MODELS, hasKey } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ live: hasKey(), defaultModel: DEFAULT_MODEL, models: MODELS, task: TASK, systemPrompt: systemPrompt(), tools: AGENT_PERMISSIONS, defaultPolicy: DEFAULT_POLICY });
}

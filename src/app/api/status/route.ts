import { MODEL, SYSTEM_PROMPT } from "@/lib/agent";
import { DEFAULT_POLICY, AGENT_PERMISSIONS } from "@/lib/policy";
import { TASK } from "@/lib/sandbox";

export const runtime = "nodejs";

export function GET() {
  const live = Boolean(process.env.ANTHROPIC_API_KEY);
  return Response.json({ live, model: live ? MODEL : "scripted-agent", task: TASK, systemPrompt: SYSTEM_PROMPT, tools: AGENT_PERMISSIONS, defaultPolicy: DEFAULT_POLICY });
}

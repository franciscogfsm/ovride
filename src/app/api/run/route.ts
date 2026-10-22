import { z } from "zod";
import { runBranch, type Emit } from "@/lib/agent";
import { PolicySchema } from "@/lib/policy";
import type { Branch } from "@/lib/events";
import { DEFAULT_MODEL, ModelId, hasKey } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ attack: z.string().min(1).max(4000), policy: PolicySchema, model: ModelId.optional(), mode: z.enum(["demo", "live"]).optional() });

// Runs both realities concurrently, each with its own fresh world, and streams every event as SSE.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { attack, policy, model = DEFAULT_MODEL, mode } = parsed.data;
  // "demo" forces the scripted agent even when a key is set; it still uses the real tools and policy.
  const live = hasKey() && mode !== "demo";
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  const enc = new TextEncoder();
  const start = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      const seq = { A: 0, B: 0 };
      const send = (branch: Branch): Emit => (e) => {
        if (ac.signal.aborted) return;
        const ev = { ...e, branch, seq: seq[branch]++, t: Date.now() - start };
        controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
      };
      await Promise.all([
        runBranch({ enforce: false, attack, policy, live, model, emit: send("A"), signal: ac.signal }),
        runBranch({ enforce: true, attack, policy, live, model, emit: send("B"), signal: ac.signal }),
      ]);
      if (!ac.signal.aborted) controller.enqueue(enc.encode(`data: {"kind":"done"}\n\n`));
      controller.close();
    },
    cancel() { ac.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

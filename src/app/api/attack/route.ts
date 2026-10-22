import { z } from "zod";
import { LIBRARY, generateAttack } from "@/lib/attacks";
import { DEFAULT_MODEL, ModelId, hasKey } from "@/lib/openrouter";

export const runtime = "nodejs";

const Body = z.object({ previous: z.array(z.string().max(80)).max(20).default([]), model: ModelId.optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { previous, model = DEFAULT_MODEL } = parsed.data;
  const fromLibrary = () => LIBRARY.find((a) => !previous.includes(a.technique)) ?? LIBRARY[previous.length % LIBRARY.length];

  if (!hasKey()) return Response.json({ attack: fromLibrary(), note: "No OpenRouter key: using a built-in library variant." });
  try {
    return Response.json({ attack: await generateAttack(previous, model) });
  } catch (e) {
    // Honest fallback: the UI shows source "library" plus this note.
    return Response.json({ attack: fromLibrary(), note: `Generation failed (${e instanceof Error ? e.message.slice(0, 160) : "error"}). Using a built-in library variant.` });
  }
}

export function GET() {
  return Response.json({ library: LIBRARY });
}

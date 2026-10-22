import { z } from "zod";
import { LIBRARY, generateAttack } from "@/lib/attacks";

export const runtime = "nodejs";

const Body = z.object({ previous: z.array(z.string().max(80)).max(20).default([]) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { previous } = parsed.data;
  const fromLibrary = () => LIBRARY.find((a) => !previous.includes(a.technique)) ?? LIBRARY[previous.length % LIBRARY.length];

  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ attack: fromLibrary(), note: "No API key: using built-in library variant." });
  try {
    return Response.json({ attack: await generateAttack(previous) });
  } catch (e) {
    // Honest fallback: the UI shows source "library" plus this note.
    return Response.json({ attack: fromLibrary(), note: `Generation failed (${e instanceof Error ? e.message : "error"}). Using built-in library variant.` });
  }
}

import { NextResponse } from "next/server";
import { generateMinimaxInstrumental } from "@/lib/audio/minimax-music";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_PROMPT = 2000;

/** Ambiance instrumentale via MiniMax Music (pas de voix). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim() ?? "";
    if (!prompt) {
      return NextResponse.json({ error: "Prompt audio vide" }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT) {
      return NextResponse.json({ error: "Prompt audio trop long" }, { status: 400 });
    }

    const spoken = await generateMinimaxInstrumental(prompt);
    if (!spoken.ok) {
      return NextResponse.json({ error: spoken.error }, { status: spoken.status });
    }

    return new NextResponse(Buffer.from(spoken.bytes), {
      status: 200,
      headers: {
        "Content-Type": spoken.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur audio" },
      { status: 500 },
    );
  }
}

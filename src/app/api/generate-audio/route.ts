import { NextResponse } from "next/server";

export const runtime = "nodejs";

const AUDIO_BASE = "https://gen.pollinations.ai/audio";
const TIMEOUT_MS = 55_000;
const MAX_PROMPT = 400;

function audioUrl(
  prompt: string,
  kind: "sfx" | "tts",
  voice?: string,
): string {
  const model =
    kind === "sfx"
      ? process.env.POLLINATIONS_SFX_MODEL?.trim() || "eleven-sfx"
      : process.env.POLLINATIONS_TTS_MODEL?.trim() || "qwen-tts";
  const params = new URLSearchParams({ model });
  if (kind === "tts" && voice) params.set("voice", voice);
  return `${AUDIO_BASE}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      kind?: "sfx" | "tts";
      prompt?: string;
      voice?: string;
    };
    const kind = body.kind === "tts" ? "tts" : "sfx";
    const prompt = body.prompt?.trim() ?? "";
    if (!prompt) {
      return NextResponse.json({ error: "Prompt audio vide" }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT) {
      return NextResponse.json({ error: "Prompt audio trop long" }, { status: 400 });
    }

    const headers: Record<string, string> = { Accept: "audio/*,application/octet-stream" };
    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(audioUrl(prompt, kind, body.voice?.trim()), {
        method: "GET",
        headers,
        cache: "no-store",
        signal: ctrl.signal,
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return NextResponse.json(
        { error: aborted ? "Pollinations audio a trop tardé" : "Pollinations audio injoignable" },
        { status: 504 },
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 402) {
      return NextResponse.json(
        { error: "Pollen insuffisant pour l’audio Pollinations" },
        { status: 402 },
      );
    }
    if (!res.ok) {
      const status = res.status === 401 || res.status === 403 ? 401 : 502;
      return NextResponse.json(
        {
          error:
            status === 401
              ? "Clé Pollinations invalide."
              : `Pollinations audio a refusé (${res.status})`,
        },
        { status },
      );
    }

    const type = res.headers.get("content-type") || "";
    if (type.includes("json") || type.includes("text/html")) {
      return NextResponse.json(
        { error: "Pollinations n’a pas renvoyé un audio" },
        { status: 502 },
      );
    }

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 256) {
      return NextResponse.json({ error: "Audio Pollinations trop petit" }, { status: 502 });
    }

    const contentType = type.startsWith("audio/")
      ? type.split(";")[0]
      : "audio/mpeg";
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
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

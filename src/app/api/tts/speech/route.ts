import { NextResponse } from "next/server";
import { fishApiKey, synthesizeFishSpeech } from "@/lib/tts/fish";

export const runtime = "nodejs";

function studioBase(): string {
  return (
    process.env.TTS_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_TTS_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3900/v1"
  );
}

async function speakVoiceStudio(
  input: string,
  voice: string,
  responseFormat: string,
  language: string,
): Promise<NextResponse> {
  const base = studioBase();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(`${base}/audio/speech`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer none",
      },
      body: JSON.stringify({
        model: process.env.TTS_MODEL || "tts-1",
        input: input.slice(0, 4000),
        voice,
        response_format: responseFormat,
        language,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `VoiceStudio ${res.status}: ${errText.slice(0, 200) || res.statusText}`,
        },
        { status: 502 },
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) {
      return NextResponse.json(
        { error: "VoiceStudio a renvoyé un audio vide." },
        { status: 502 },
      );
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? "VoiceStudio timeout."
          : e instanceof Error
            ? e.message
            : "VoiceStudio injoignable",
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Fish Audio first ; VoiceStudio only if no FISH_API_KEY. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      input?: string;
      voice?: string;
      response_format?: string;
      language?: string;
    };
    const input = body.input?.trim() ?? "";
    if (!input) {
      return NextResponse.json({ error: "Texte vide" }, { status: 400 });
    }

    if (fishApiKey()) {
      const spoken = await synthesizeFishSpeech({
        text: input,
        referenceId: body.voice?.trim(),
      });
      if (!spoken.ok) {
        return NextResponse.json(
          { error: spoken.error },
          { status: spoken.status },
        );
      }
      return new NextResponse(spoken.bytes, {
        status: 200,
        headers: {
          "Content-Type": spoken.contentType,
          "Cache-Control": "no-store",
        },
      });
    }

    return speakVoiceStudio(
      input,
      body.voice || process.env.TTS_VOICE_ID || "5e9fff91",
      body.response_format || "mp3",
      body.language || "fr",
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur TTS" },
      { status: 500 },
    );
  }
}

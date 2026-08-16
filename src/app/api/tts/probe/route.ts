import { NextResponse } from "next/server";
import { fishApiKey, fishModel, probeFish } from "@/lib/tts/fish";

export const runtime = "nodejs";

function studioBase(): string {
  return (
    process.env.TTS_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_TTS_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3900/v1"
  );
}

export async function GET() {
  if (fishApiKey()) {
    const fish = await probeFish();
    return NextResponse.json({
      ok: fish.ok,
      speechReady: fish.speechReady,
      engine: "fish",
      model: fishModel(),
      hint: fish.hint,
    });
  }

  const base = studioBase();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${base}/audio/voices`, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Authorization: "Bearer none" },
    });
    clearTimeout(t);
    if (res.ok || res.status === 405) {
      return NextResponse.json({
        ok: true,
        speechReady: true,
        engine: "voicestudio",
        base,
        hint: "Pas de FISH_API_KEY — secours VoiceStudio.",
      });
    }
  } catch {
    // fall through
  }

  return NextResponse.json({
    ok: false,
    speechReady: false,
    engine: null,
    hint: "Ajoute FISH_API_KEY (https://fish.audio/app/api-keys) ou lance VoiceStudio.",
  });
}

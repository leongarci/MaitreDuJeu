import { NextResponse } from "next/server";
import {
  fishApiKey,
  fishNarratorId,
  listFishVoices,
  type FishVoice,
} from "@/lib/tts/fish";

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
    const voices = await listFishVoices("fr");
    const narratorId = fishNarratorId();
    const preferred =
      voices.find((v) => v.voice_id === narratorId) || voices[0] || null;
    return NextResponse.json({
      engine: "fish",
      voices,
      preferred: preferred
        ? { voice_id: preferred.voice_id, name: preferred.name }
        : null,
      characterVoices: voices.filter((v) => v.voice_id !== preferred?.voice_id),
    });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${studioBase()}/audio/voices`, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Authorization: "Bearer none" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return NextResponse.json(
        { error: `VoiceStudio ${res.status}`, voices: [], engine: "voicestudio" },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { voices?: FishVoice[] };
    const voices = Array.isArray(data.voices) ? data.voices : [];
    return NextResponse.json({
      engine: "voicestudio",
      voices,
      preferred: null,
      characterVoices: [],
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Voices injoignables",
        voices: [],
        preferred: null,
        engine: null,
      },
      { status: 503 },
    );
  }
}

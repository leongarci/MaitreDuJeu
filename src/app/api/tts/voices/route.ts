import { NextResponse } from "next/server";

export const runtime = "nodejs";

function baseUrl(): string {
  return (
    process.env.TTS_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_TTS_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3900/v1"
  );
}

export type StudioVoice = {
  voice_id: string;
  name: string;
  type?: string;
  language?: string | null;
};

/** Proxy VoiceStudio voice list (same-origin, no CORS). */
export async function GET() {
  const base = baseUrl();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${base}/audio/voices`, {
      method: "GET",
      signal: ctrl.signal,
      headers: { Authorization: "Bearer none" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return NextResponse.json(
        { error: `VoiceStudio ${res.status}`, voices: [] },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { voices?: StudioVoice[] };
    const voices = Array.isArray(data.voices) ? data.voices : [];
    const preferred =
      voices.find(
        (v) =>
          v.type === "profile" &&
          v.name.trim().toLowerCase() === "mimir",
      ) ||
      voices.find(
        (v) =>
          v.type === "profile" &&
          String(v.language || "")
            .toLowerCase()
            .startsWith("fr"),
      ) ||
      null;

    return NextResponse.json({
      voices,
      preferred: preferred
        ? { voice_id: preferred.voice_id, name: preferred.name }
        : null,
      characterVoices: [],
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Voices injoignables",
        voices: [],
        preferred: null,
      },
      { status: 503 },
    );
  }
}

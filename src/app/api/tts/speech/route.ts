import { NextResponse } from "next/server";

export const runtime = "nodejs";

function baseUrl(): string {
  return (
    process.env.TTS_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_TTS_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3900/v1"
  );
}

function studioRoot(base: string): string {
  return base.replace(/\/v1\/?$/, "") || "http://127.0.0.1:3900";
}

async function modelSpeechReady(root: string): Promise<{
  ready: boolean;
  detail?: string;
}> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${root}/model/status`, {
      method: "GET",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ready: true }; // don't block if status unknown
    const model = (await res.json()) as {
      loaded?: boolean;
      loading?: boolean;
      progress?: number;
      error?: string | null;
      detail?: string;
    };
    const loaded = Boolean(model.loaded);
    const stuck =
      Boolean(model.loading) &&
      !loaded &&
      (model.progress ?? 0) >= 100 &&
      !model.error;
    if (stuck) {
      return {
        ready: false,
        detail:
          "OmniVoice bloqué (loading). Redémarre VoiceStudio et génère un test dedans.",
      };
    }
    return { ready: true, detail: model.detail };
  } catch {
    return { ready: true };
  }
}

/** Proxy TTS to VoiceStudio — same-origin for the browser, no CORS. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      input?: string;
      voice?: string;
      model?: string;
      response_format?: string;
      language?: string;
    };
    const input = body.input?.trim() ?? "";
    if (!input) {
      return NextResponse.json({ error: "Texte vide" }, { status: 400 });
    }

    const base = baseUrl();
    const root = studioRoot(base);
    const gate = await modelSpeechReady(root);
    if (!gate.ready) {
      return NextResponse.json(
        { error: gate.detail || "Moteur VoiceStudio pas prêt" },
        { status: 503 },
      );
    }

    const voice = body.voice || process.env.TTS_VOICE_ID || "5e9fff91";
    const model =
      body.model || process.env.TTS_MODEL || process.env.NEXT_PUBLIC_TTS_MODEL || "tts-1";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);

    let res: Response;
    try {
      res = await fetch(`${base}/audio/speech`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer none",
        },
        body: JSON.stringify({
          model,
          input: input.slice(0, 4000),
          voice,
          response_format: body.response_format || "mp3",
          language: body.language || "fr",
        }),
      });
    } finally {
      clearTimeout(timer);
    }

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
        { error: "VoiceStudio a renvoyé un audio vide — charge OmniVoice dans l’app." },
        { status: 502 },
      );
    }
    const contentType = res.headers.get("content-type") || "audio/mpeg";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? "VoiceStudio timeout — OmniVoice trop lent (1er appel ou texte long). Génère un test dans VoiceStudio pour chauffer le modèle, puis réessaie."
          : e instanceof Error
            ? e.message
            : "VoiceStudio injoignable (127.0.0.1:3900)",
      },
      { status: 503 },
    );
  }
}

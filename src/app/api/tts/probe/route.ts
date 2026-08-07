import { NextResponse } from "next/server";

export const runtime = "nodejs";

function baseUrl(): string {
  return (
    process.env.TTS_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_TTS_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3900/v1"
  );
}

/** Host without `/v1` — VoiceStudio also exposes `/health`, `/model/status`, `/engines`. */
function studioRoot(base: string): string {
  return base.replace(/\/v1\/?$/, "") || "http://127.0.0.1:3900";
}

type ModelStatus = {
  status?: string;
  loaded?: boolean;
  loading?: boolean;
  progress?: number;
  detail?: string;
  error?: string | null;
};

/**
 * Server-side probe — avoids browser CORS to VoiceStudio.
 * `ok` = API reachable. `speechReady` = model actually usable for /audio/speech.
 */
export async function GET() {
  const base = baseUrl();
  const root = studioRoot(base);

  let apiOk = false;
  let via: string | null = null;
  const endpoints = [`${base}/audio/voices`, `${root}/health`, base];
  for (const url of endpoints) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        headers: { Authorization: "Bearer none" },
      });
      clearTimeout(t);
      if (res.ok || res.status === 405) {
        apiOk = true;
        via = url;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!apiOk) {
    return NextResponse.json(
      {
        ok: false,
        speechReady: false,
        base,
        hint: "Lance VoiceStudio (backend :3900), puis réessaie.",
      },
      { status: 503 },
    );
  }

  let model: ModelStatus | null = null;
  let engine: string | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${root}/model/status`, {
      method: "GET",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) model = (await res.json()) as ModelStatus;
  } catch {
    // optional
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${root}/engines`, {
      method: "GET",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const data = (await res.json()) as { tts?: { active?: string } };
      engine = data.tts?.active ?? null;
    }
  } catch {
    // optional
  }

  const loaded = Boolean(model?.loaded);
  const stuckLoading =
    Boolean(model?.loading) &&
    !loaded &&
    (model?.progress ?? 0) >= 100 &&
    !model?.error;

  // Only block when status explicitly says stuck. Unknown/missing status → try speech.
  const speechReady = !stuckLoading && (model === null || loaded || !model.loading);

  let hint: string | null = null;
  if (stuckLoading) {
    hint =
      "VoiceStudio répond, mais le modèle OmniVoice est coincé (loading sans loaded). Ferme complètement VoiceStudio, relance-le, génère un clip test dans l’app, puis réessaie.";
  } else if (model && !loaded && model.loading) {
    hint =
      "OmniVoice charge encore le modèle — génère un test dans VoiceStudio, ou patiente.";
  }

  return NextResponse.json({
    ok: true,
    speechReady,
    base,
    via,
    engine,
    model: model
      ? {
          status: model.status ?? null,
          loaded,
          loading: Boolean(model.loading),
          progress: model.progress ?? null,
          detail: model.detail ?? null,
          error: model.error ?? null,
        }
      : null,
    hint,
  });
}

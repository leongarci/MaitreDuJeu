const MUSIC_URL = "https://api.minimax.io/v1/music_generation";

export function minimaxApiKey(): string {
  return (
    process.env.MINIMAX_API_KEY?.trim() ||
    process.env.MINIMAX_GROUP_API_KEY?.trim() ||
    ""
  );
}

export function minimaxMusicModel(): string {
  return process.env.MINIMAX_MUSIC_MODEL?.trim() || "music-3.0-free";
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function friendlyStatus(code: number, msg: string): { status: number; error: string } {
  if (code === 1004 || code === 2049) {
    return { status: 401, error: "Clé MiniMax invalide. Vérifie MINIMAX_API_KEY." };
  }
  if (code === 1008) {
    return { status: 402, error: "Solde MiniMax insuffisant." };
  }
  if (code === 1002) {
    return { status: 429, error: "Limite MiniMax (3 req/min en free). Réessaie dans un instant." };
  }
  if (code === 1026) {
    return { status: 422, error: "MiniMax a filtré le prompt d’ambiance." };
  }
  return { status: 502, error: `MiniMax ${code}: ${msg || "échec musique"}` };
}

export async function generateMinimaxInstrumental(
  prompt: string,
): Promise<
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; status: number; error: string }
> {
  const key = minimaxApiKey();
  if (!key) {
    return {
      ok: false,
      status: 401,
      error: "MINIMAX_API_KEY manquante dans .env.local",
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(MUSIC_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: ctrl.signal,
      body: JSON.stringify({
        model: minimaxMusicModel(),
        prompt: prompt.slice(0, 2000),
        is_instrumental: true,
        output_format: "hex",
        audio_setting: {
          sample_rate: 44100,
          bitrate: 128000,
          format: "mp3",
        },
      }),
    });

    const raw = (await res.json().catch(() => ({}))) as {
      data?: { audio?: string; status?: number };
      base_resp?: { status_code?: number; status_msg?: string };
    };

    const code = raw.base_resp?.status_code ?? (res.ok ? 0 : res.status);
    if (code !== 0) {
      return {
        ok: false,
        ...friendlyStatus(code, raw.base_resp?.status_msg || res.statusText),
      };
    }

    const hex = raw.data?.audio?.trim() || "";
    if (!hex) {
      return { ok: false, status: 502, error: "MiniMax n’a pas renvoyé d’audio." };
    }
    const bytes = hexToBytes(hex);
    if (bytes.byteLength < 256) {
      return { ok: false, status: 502, error: "Audio MiniMax trop petit." };
    }
    return { ok: true, bytes, contentType: "audio/mpeg" };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      status: 504,
      error: aborted
        ? "MiniMax a trop tardé."
        : e instanceof Error
          ? e.message
          : "MiniMax injoignable",
    };
  } finally {
    clearTimeout(timer);
  }
}

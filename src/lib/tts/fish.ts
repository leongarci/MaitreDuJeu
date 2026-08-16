export const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
export const FISH_MODELS_URL = "https://api.fish.audio/model";
/** Public library voice from Fish docs — used if none is configured. */
export const FISH_DEFAULT_NARRATOR_ID = "ca3007f96ae7499ab87d27ea3599956a";

export type FishVoice = {
  voice_id: string;
  name: string;
  type?: string;
  language?: string | null;
};

export function fishApiKey(): string {
  return (
    process.env.FISH_API_KEY?.trim() ||
    process.env.FISH_AUDIO_API_KEY?.trim() ||
    ""
  );
}

export function fishModel(): string {
  return process.env.FISH_TTS_MODEL?.trim() || "s2.1-pro-free";
}

export function fishNarratorId(): string {
  return process.env.FISH_NARRATOR_VOICE_ID?.trim() || FISH_DEFAULT_NARRATOR_ID;
}

export function fishHeaders(json = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${fishApiKey()}`,
    model: fishModel(),
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

type FishModelItem = {
  _id?: string;
  id?: string;
  title?: string;
  languages?: string[];
};

export async function listFishVoices(language = "fr"): Promise<FishVoice[]> {
  const key = fishApiKey();
  if (!key) return [];

  const url = new URL(FISH_MODELS_URL);
  url.searchParams.set("page_size", "24");
  url.searchParams.set("page_number", "1");
  url.searchParams.set("language", language);
  url.searchParams.set("sort_by", "task_count");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: FishModelItem[] };
    const items = Array.isArray(data.items) ? data.items : [];
    const voices: FishVoice[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const id = String(item._id || item.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      voices.push({
        voice_id: id,
        name: String(item.title || id).trim() || id,
        type: "fish",
        language: item.languages?.[0] || language,
      });
    }
    const narrator = fishNarratorId();
    if (!seen.has(narrator)) {
      voices.unshift({
        voice_id: narrator,
        name: "Narrateur",
        type: "fish",
        language,
      });
    }
    return voices;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function synthesizeFishSpeech(opts: {
  text: string;
  referenceId?: string;
}): Promise<
  | { ok: true; bytes: ArrayBuffer; contentType: string }
  | { ok: false; status: number; error: string }
> {
  const key = fishApiKey();
  if (!key) {
    return { ok: false, status: 401, error: "FISH_API_KEY manquante dans .env.local" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(FISH_TTS_URL, {
      method: "POST",
      headers: fishHeaders(true),
      cache: "no-store",
      signal: ctrl.signal,
      body: JSON.stringify({
        text: opts.text.slice(0, 4000),
        reference_id: opts.referenceId || fishNarratorId(),
        format: "mp3",
        mp3_bitrate: 128,
        latency: "balanced",
        normalize: false,
        chunk_length: 250,
        prosody: { speed: 1, volume: 0, normalize_loudness: true },
      }),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      let message = raw.slice(0, 220) || res.statusText;
      try {
        const parsed = JSON.parse(raw) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        // keep raw
      }
      if (res.status === 401) {
        return { ok: false, status: 401, error: "Clé Fish Audio invalide." };
      }
      if (res.status === 402) {
        return {
          ok: false,
          status: 402,
          error: "Crédits Fish Audio épuisés — recharge sur fish.audio/app/billing.",
        };
      }
      return {
        ok: false,
        status: res.status >= 500 ? 502 : res.status,
        error: `Fish Audio ${res.status}: ${message}`,
      };
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 64) {
      return { ok: false, status: 502, error: "Fish Audio a renvoyé un audio vide." };
    }
    return {
      ok: true,
      bytes,
      contentType: res.headers.get("content-type") || "audio/mpeg",
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      status: 504,
      error: aborted
        ? "Fish Audio a trop tardé."
        : e instanceof Error
          ? e.message
          : "Fish Audio injoignable",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeFish(): Promise<{
  ok: boolean;
  speechReady: boolean;
  hint: string | null;
}> {
  const key = fishApiKey();
  if (!key) {
    return {
      ok: false,
      speechReady: false,
      hint: "Ajoute FISH_API_KEY (https://fish.audio/app/api-keys).",
    };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const url = new URL(FISH_MODELS_URL);
    url.searchParams.set("page_size", "1");
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        speechReady: false,
        hint: "Clé Fish Audio invalide — vérifie FISH_API_KEY.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        speechReady: false,
        hint: `Fish Audio a répondu ${res.status}.`,
      };
    }
    return { ok: true, speechReady: true, hint: null };
  } catch {
    return {
      ok: false,
      speechReady: false,
      hint: "Fish Audio injoignable.",
    };
  } finally {
    clearTimeout(timer);
  }
}

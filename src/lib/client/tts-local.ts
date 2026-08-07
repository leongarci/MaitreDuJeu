/** VoiceStudio / OmniVoice via Next.js proxy (évite CORS navigateur → :3900). */

let currentAudio: HTMLAudioElement | null = null;
let sharedAudioCtx: AudioContext | null = null;
let activeSources: AudioBufferSourceNode[] = [];
let playbackGeneration = 0;
let audioUnlocked = false;
let voiceCatalogPromise: Promise<StudioVoice[]> | null = null;

/** Client must wait longer than the server speech proxy (90s). */
const SPEECH_TIMEOUT_MS = 120_000;
/** Prefer one request when OmniVoice is warm — avoids seam gaps. */
const SINGLE_SHOT_MAX_CHARS = 3200;
/** Fallback chunks: large enough that next fetch finishes during playback. */
const CHUNK_MAX_CHARS = 1100;

/** Unique voix : profil Mimir (VoiceStudio). */
export const DEFAULT_NARRATOR_VOICE_ID = "8777577e";
export const DEFAULT_NARRATOR_VOICE_NAME = "Mimir";

export type LocalTtsProbe = {
  ok: boolean;
  speechReady: boolean;
  hint?: string | null;
  engine?: string | null;
};

export type StudioVoice = {
  voice_id: string;
  name: string;
  type?: string;
  language?: string | null;
};

/** Old narrator defaults to migrate away from (incl. former Kratos id). */
const LEGACY_NARRATOR_VOICE_IDS = new Set([
  "demo0001",
  "alloy",
  "e4bf2d65",
]);

export function getNarratorVoiceId(): string {
  if (typeof window === "undefined") return DEFAULT_NARRATOR_VOICE_ID;
  const stored = localStorage.getItem("mdj_tts_narrator_voice");
  if (!stored || LEGACY_NARRATOR_VOICE_IDS.has(stored)) {
    return DEFAULT_NARRATOR_VOICE_ID;
  }
  return stored;
}

export function setNarratorVoiceId(id: string): void {
  localStorage.setItem("mdj_tts_narrator_voice", id);
}

async function loadStudioVoices(): Promise<StudioVoice[]> {
  if (!voiceCatalogPromise) {
    voiceCatalogPromise = (async () => {
      try {
        const res = await fetch("/api/tts/voices");
        const data = (await res.json()) as { voices?: StudioVoice[] };
        return Array.isArray(data.voices) ? data.voices : [];
      } catch {
        return [];
      }
    })();
  }
  return voiceCatalogPromise;
}

/** Resolve Mimir from VoiceStudio profiles. */
export async function ensureVoiceCast(): Promise<void> {
  if (typeof window === "undefined") return;
  const voices = await loadStudioVoices();
  const mimir = voices.find(
    (v) =>
      v.type === "profile" && v.name.trim().toLowerCase() === "mimir",
  );
  const nextId = mimir?.voice_id || DEFAULT_NARRATOR_VOICE_ID;
  if (localStorage.getItem("mdj_tts_narrator_voice") !== nextId) {
    setNarratorVoiceId(nextId);
  }
}

export async function ensureNarratorVoiceId(): Promise<string> {
  await ensureVoiceCast();
  return getNarratorVoiceId();
}

/** Call from a user gesture — unlocks HTMLAudio autoplay after later async work. */
export async function unlockAudio(): Promise<void> {
  if (typeof window === "undefined" || audioUnlocked) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) {
      audioUnlocked = true;
      return;
    }
    const ctx = new Ctx();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        void ctx.close().catch(() => undefined);
        return;
      }
    }
    if (ctx.state === "suspended") {
      void ctx.close().catch(() => undefined);
      return;
    }
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    void ctx.close().catch(() => undefined);
    audioUnlocked = true;
  } catch {
    // Ignore — HTMLAudioElement may still play after a click.
  }
}

export async function probeLocalTts(): Promise<boolean> {
  const detail = await probeLocalTtsDetail();
  return detail.speechReady;
}

export async function probeLocalTtsDetail(): Promise<LocalTtsProbe> {
  try {
    const res = await fetch("/api/tts/probe", { method: "GET" });
    const data = (await res.json()) as {
      ok?: boolean;
      speechReady?: boolean;
      hint?: string | null;
      engine?: string | null;
    };
    return {
      ok: Boolean(data.ok),
      speechReady: Boolean(data.speechReady),
      hint: data.hint ?? null,
      engine: data.engine ?? null,
    };
  } catch {
    return { ok: false, speechReady: false, hint: "Probe TTS impossible" };
  }
}

export function stopLocalAudio(): void {
  playbackGeneration += 1;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  for (const src of activeSources) {
    try {
      src.stop();
    } catch {
      // already stopped
    }
    try {
      src.disconnect();
    } catch {
      // ignore
    }
  }
  activeSources = [];
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

async function playBlob(blob: Blob): Promise<void> {
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // fall through to HTMLAudio
      }
    }
    if (ctx.state !== "suspended") {
      const gen = playbackGeneration;
      try {
        const raw = await blob.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(raw.slice(0));
        if (gen !== playbackGeneration) return;
        await new Promise<void>((resolve, reject) => {
          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(ctx.destination);
          activeSources.push(src);
          src.onended = () => {
            activeSources = activeSources.filter((s) => s !== src);
            try {
              src.disconnect();
            } catch {
              // ignore
            }
            resolve();
          };
          try {
            src.start(0);
          } catch (e) {
            activeSources = activeSources.filter((s) => s !== src);
            reject(e instanceof Error ? e : new Error("audio start failed"));
          }
        });
        return;
      } catch {
        // decode failed — HTMLAudio fallback below
      }
    }
  }

  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      reject(new Error("audio error"));
    };
    void audio.play().catch(reject);
  });
}

async function ensurePlayableContext(): Promise<AudioContext | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx.state === "suspended" ? null : ctx;
}

function scheduleBuffer(
  ctx: AudioContext,
  audioBuf: AudioBuffer,
  when: number,
): { endAt: number; ended: Promise<void> } {
  const src = ctx.createBufferSource();
  src.buffer = audioBuf;
  src.connect(ctx.destination);
  activeSources.push(src);
  const ended = new Promise<void>((resolve) => {
    src.onended = () => {
      activeSources = activeSources.filter((s) => s !== src);
      try {
        src.disconnect();
      } catch {
        // ignore
      }
      resolve();
    };
  });
  src.start(when);
  return { endAt: when + audioBuf.duration, ended };
}

/** Split long narration so OmniVoice doesn't stall on huge payloads. */
export function chunkForTts(text: string, maxChars = CHUNK_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const parts: string[] = [];
  const sentences = trimmed.split(/(?<=[.!?…])\s+/);
  let buf = "";
  for (const sentence of sentences) {
    if (!sentence) continue;
    if (!buf) {
      buf = sentence;
      continue;
    }
    if ((buf + " " + sentence).length <= maxChars) {
      buf = `${buf} ${sentence}`;
    } else {
      parts.push(buf);
      buf = sentence;
    }
  }
  if (buf) parts.push(buf);

  // Hard-split any leftover giant chunk.
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= maxChars) {
      out.push(p);
      continue;
    }
    for (let i = 0; i < p.length; i += maxChars) {
      out.push(p.slice(i, i + maxChars));
    }
  }
  return out;
}

type SpeechFetchResult =
  | { ok: true; blob: Blob }
  | { ok: false; error: string };

function isRetryableTtsError(error?: string): boolean {
  const e = error || "";
  return (
    e.includes("temps") ||
    e.includes("503") ||
    e.includes("timeout") ||
    e.includes("502")
  );
}

async function fetchSpeechBlob(
  text: string,
  voiceId: string,
): Promise<SpeechFetchResult> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), SPEECH_TIMEOUT_MS);

  try {
    const res = await fetch("/api/tts/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: "tts-1",
        input: text.slice(0, 4000),
        voice: voiceId || DEFAULT_NARRATOR_VOICE_ID,
        response_format: "mp3",
        language: "fr",
      }),
    });
    window.clearTimeout(timer);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error: data.error || `TTS HTTP ${res.status}`,
      };
    }

    const blob = await res.blob();
    if (blob.size < 64) {
      return { ok: false, error: "Audio vide renvoyé par VoiceStudio" };
    }
    return { ok: true, blob };
  } catch (e) {
    window.clearTimeout(timer);
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError") {
      return {
        ok: false,
        error: "VoiceStudio ne répond pas à temps. Vérifie OmniVoice.",
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Échec lecture audio",
    };
  }
}

async function fetchSpeechBlobWithRetry(
  text: string,
  voiceId: string,
): Promise<SpeechFetchResult> {
  let result = await fetchSpeechBlob(text, voiceId);
  if (!result.ok && isRetryableTtsError(result.error)) {
    await new Promise((r) => window.setTimeout(r, 1200));
    result = await fetchSpeechBlob(text, voiceId);
  }
  return result;
}

export async function speakLocalLine(
  text: string,
  voiceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true };

  await unlockAudio();

  // Warm OmniVoice: one continuous clip when the line fits.
  if (trimmed.length <= SINGLE_SHOT_MAX_CHARS) {
    const single = await fetchSpeechBlobWithRetry(trimmed, voiceId);
    if (single.ok) {
      try {
        await playBlob(single.blob);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Échec lecture audio",
        };
      }
    }
    // Timeout on long single → fall through to chunked path.
    if (!isRetryableTtsError(single.error)) {
      return { ok: false, error: single.error };
    }
  }

  const chunks = chunkForTts(trimmed, CHUNK_MAX_CHARS);
  if (!chunks.length) return { ok: true };

  const ctx = await ensurePlayableContext();
  const gen = playbackGeneration;

  // Prefetch + schedule on a continuous timeline (no stop between chunks).
  if (ctx) {
    try {
      let nextFetch = fetchSpeechBlobWithRetry(chunks[0]!, voiceId);
      let cursor = 0;
      let lastEnded: Promise<void> = Promise.resolve();

      for (let i = 0; i < chunks.length; i++) {
        if (gen !== playbackGeneration) return { ok: true };
        const result = await nextFetch;
        if (i + 1 < chunks.length) {
          nextFetch = fetchSpeechBlobWithRetry(chunks[i + 1]!, voiceId);
        }
        if (!result.ok) return { ok: false, error: result.error };

        const raw = await result.blob.arrayBuffer();
        if (gen !== playbackGeneration) return { ok: true };
        const audioBuf = await ctx.decodeAudioData(raw.slice(0));
        if (gen !== playbackGeneration) return { ok: true };

        if (i === 0) cursor = ctx.currentTime + 0.03;
        // If generation lagged behind playback, continue ASAP (tiny seam only).
        if (cursor < ctx.currentTime + 0.02) {
          cursor = ctx.currentTime + 0.02;
        }
        const scheduled = scheduleBuffer(ctx, audioBuf, cursor);
        cursor = scheduled.endAt;
        lastEnded = scheduled.ended;
      }

      await lastEnded;
      return { ok: true };
    } catch {
      // fall through to sequential HTMLAudio
      stopLocalAudio();
    }
  }

  let nextFetch = fetchSpeechBlobWithRetry(chunks[0]!, voiceId);
  for (let i = 0; i < chunks.length; i++) {
    const result = await nextFetch;
    if (i + 1 < chunks.length) {
      nextFetch = fetchSpeechBlobWithRetry(chunks[i + 1]!, voiceId);
    }
    if (!result.ok) return { ok: false, error: result.error };
    try {
      await playBlob(result.blob);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Échec lecture audio",
      };
    }
  }
  return { ok: true };
}

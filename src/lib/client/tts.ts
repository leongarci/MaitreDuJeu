/** TTS: VoiceStudio only — voix unique Mimir. */

import type { SpeechLine } from "@/lib/types";
import {
  DEFAULT_NARRATOR_VOICE_NAME,
  ensureNarratorVoiceId,
  ensureVoiceCast,
  probeLocalTtsDetail,
  speakLocalLine,
  stopLocalAudio,
  unlockAudio,
} from "@/lib/client/tts-local";

let speaking = false;
let lastError: string | null = null;

export function getLastTtsError(): string | null {
  return lastError;
}

/** Always one narrator line — multi-voice disabled (Mimir only). */
export function planSpeechLines(
  narration: string,
  _lines?: SpeechLine[] | null,
): SpeechLine[] {
  const text = narration.trim();
  if (!text) return [];
  return [{ speaker: "narrator", text }];
}

export function stopTts(): void {
  stopLocalAudio();
  speaking = false;
}

export async function refreshLocalTtsProbe(): Promise<boolean> {
  const detail = await probeLocalTtsDetail();
  return detail.ok || detail.speechReady;
}

/** Speak a short sample immediately (call from a click handler). */
export async function speakTestSample(): Promise<{
  ok: boolean;
  via: "local";
  error?: string;
  hint?: string;
  voiceName?: string;
}> {
  lastError = null;
  await unlockAudio();
  stopTts();

  const detail = await probeLocalTtsDetail();
  if (!detail.ok && !detail.speechReady) {
    lastError =
      detail.hint ||
      "VoiceStudio / OmniVoice pas prêt. Lance VoiceStudio et génère un test dedans.";
    return { ok: false, via: "local", error: lastError, hint: detail.hint || undefined };
  }

  await ensureVoiceCast();
  const voiceId = await ensureNarratorVoiceId();
  const result = await speakLocalLine(
    "Test de voix. Je suis Mimir, le maître du jeu.",
    voiceId,
  );
  if (!result.ok) {
    lastError = result.error || "Échec VoiceStudio";
    return { ok: false, via: "local", error: lastError };
  }
  return {
    ok: true,
    via: "local",
    voiceName: DEFAULT_NARRATOR_VOICE_NAME,
  };
}

export async function speakNarration(
  text: string,
  muted: boolean,
  _lines?: SpeechLine[] | null,
): Promise<void> {
  if (muted || !text.trim()) return;
  if (typeof window === "undefined") return;

  lastError = null;
  stopTts();
  speaking = true;
  await unlockAudio();

  const detail = await probeLocalTtsDetail();
  if (!detail.ok && !detail.speechReady) {
    lastError =
      detail.hint ||
      "VoiceStudio indisponible — aucune voix de secours. Ouvre OmniVoice puis réessaie.";
    speaking = false;
    return;
  }

  await ensureVoiceCast();
  const voiceId = await ensureNarratorVoiceId();

  try {
    const result = await speakLocalLine(text.trim(), voiceId);
    if (!result.ok) {
      lastError = result.error || "Échec VoiceStudio";
    }
  } finally {
    speaking = false;
  }
}

export function isSpeaking(): boolean {
  return speaking;
}

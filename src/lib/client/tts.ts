/** TTS: Fish Audio (voix) — VoiceStudio seulement si pas de FISH_API_KEY. */

import type { SpeechLine } from "@/lib/types";
import {
  DEFAULT_NARRATOR_VOICE_NAME,
  ensureNarratorVoiceId,
  ensureVoiceCast,
  probeLocalTtsDetail,
  speakLocalLine,
  stopLocalAudio,
  unlockAudio,
  voiceIdForSpeaker,
} from "@/lib/client/tts-local";

let speaking = false;
let lastError: string | null = null;

export function getLastTtsError(): string | null {
  return lastError;
}

export function planSpeechLines(
  narration: string,
  lines?: SpeechLine[] | null,
): SpeechLine[] {
  const cleaned = (lines ?? []).filter((l) => l.text.trim() && l.speaker.trim());
  if (cleaned.length) return cleaned;
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

export async function speakTestSample(): Promise<{
  ok: boolean;
  via: "fish" | "local";
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
      "Fish Audio pas prêt. Ajoute FISH_API_KEY (https://fish.audio/app/api-keys).";
    return { ok: false, via: "fish", error: lastError, hint: detail.hint || undefined };
  }

  await ensureVoiceCast();
  const voiceId = await ensureNarratorVoiceId();
  const result = await speakLocalLine(
    "Test de voix. Je suis le maître du jeu.",
    voiceId,
  );
  if (!result.ok) {
    lastError = result.error || "Échec Fish Audio";
    return { ok: false, via: "fish", error: lastError };
  }
  return {
    ok: true,
    via: detail.engine === "voicestudio" ? "local" : "fish",
    voiceName: DEFAULT_NARRATOR_VOICE_NAME,
  };
}

export async function speakNarration(
  text: string,
  muted: boolean,
  lines?: SpeechLine[] | null,
): Promise<void> {
  if (muted || !text.trim()) return;
  if (typeof window === "undefined") return;

  lastError = null;
  stopTts();
  speaking = true;
  await unlockAudio();

  const planned = planSpeechLines(text, lines);
  const detail = await probeLocalTtsDetail();
  if (!detail.ok && !detail.speechReady) {
    lastError =
      detail.hint ||
      "Fish Audio indisponible. Vérifie FISH_API_KEY.";
    speaking = false;
    return;
  }

  try {
    for (const line of planned) {
      if (!speaking) return;
      const voiceId = await voiceIdForSpeaker(line.speaker);
      const result = await speakLocalLine(line.text, voiceId);
      if (!result.ok) {
        lastError = result.error || "Échec voix";
      }
    }
  } finally {
    speaking = false;
  }
}

export function isSpeaking(): boolean {
  return speaking;
}

/** TTS: VoiceStudio (Mimir) + secours / répliques Pollinations. */

import { speakPollinationsLine } from "@/lib/client/pollinations-tts";
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

function isNarrator(speaker: string): boolean {
  const s = speaker.trim().toLowerCase();
  return !s || s === "narrator" || s === "mj" || s === "narrateur";
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

  const planned = planSpeechLines(text, _lines);
  const detail = await probeLocalTtsDetail();
  const localReady = detail.ok || detail.speechReady;
  if (localReady) {
    await ensureVoiceCast();
  }
  const voiceId = localReady ? await ensureNarratorVoiceId() : "";

  try {
    for (const line of planned) {
      if (!speaking) return;
      if (isNarrator(line.speaker) && localReady) {
        const result = await speakLocalLine(line.text, voiceId);
        if (result.ok) continue;
        const fallback = await speakPollinationsLine(line.text, "narrator");
        if (!fallback.ok) {
          lastError = result.error || fallback.error || "Échec voix";
        }
        continue;
      }
      const spoken = await speakPollinationsLine(line.text, line.speaker);
      if (!spoken.ok) {
        if (isNarrator(line.speaker) && localReady) {
          const result = await speakLocalLine(line.text, voiceId);
          if (!result.ok) lastError = spoken.error || result.error || "Échec voix";
        } else {
          lastError = spoken.error || "Échec voix Pollinations";
        }
      }
    }
  } finally {
    speaking = false;
  }
}

export function isSpeaking(): boolean {
  return speaking;
}

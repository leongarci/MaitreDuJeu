const VOICES = [
  "onyx",
  "nova",
  "fable",
  "echo",
  "sage",
  "coral",
  "verse",
  "ballad",
] as const;

function hashSpeaker(speaker: string): number {
  let h = 0;
  for (let i = 0; i < speaker.length; i++) {
    h = (h * 31 + speaker.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function voiceForSpeaker(speaker: string): string {
  const key = speaker.trim().toLowerCase();
  if (!key || key === "narrator" || key === "mj" || key === "narrateur") {
    return "onyx";
  }
  return VOICES[hashSpeaker(key) % VOICES.length];
}

export async function speakPollinationsLine(
  text: string,
  speaker: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = text.trim().slice(0, 400);
  if (!trimmed) return { ok: true };

  const res = await fetch("/api/generate-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "tts",
      prompt: trimmed,
      voice: voiceForSpeaker(speaker),
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error || `TTS Pollinations ${res.status}` };
  }
  const blob = await res.blob();
  if (blob.size < 256) {
    return { ok: false, error: "Audio Pollinations vide" };
  }
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Lecture Pollinations"));
      void audio.play().catch(reject);
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Lecture Pollinations",
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

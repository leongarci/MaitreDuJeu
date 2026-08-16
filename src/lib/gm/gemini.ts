export const GEMINI_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

export function geminiModelCandidates(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  return preferred
    ? [preferred, ...GEMINI_MODELS.filter((m) => m !== preferred)]
    : GEMINI_MODELS;
}

export function isMissingGeminiModel(msg: string): boolean {
  return msg.includes("404") || /not found|not supported/i.test(msg);
}

export function isTransientGeminiError(msg: string): boolean {
  return (
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    /overloaded|unavailable|high demand|timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
      msg,
    )
  );
}

export function describeGeminiFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("429") || /quota|rate.?limit/i.test(raw)) {
    return "Quota Gemini dépassé — réessaie dans une minute.";
  }
  if (raw.includes("503") || /overloaded|unavailable|high demand/i.test(raw)) {
    return "Gemini saturé (503) — réessaie dans une minute.";
  }
  if (isMissingGeminiModel(raw)) {
    return "Modèle Gemini introuvable — vérifie GEMINI_MODEL.";
  }
  if (/API_KEY|403|invalid.*key/i.test(raw)) {
    return "Clé Gemini invalide.";
  }
  return "Gemini n’a pas répondu.";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

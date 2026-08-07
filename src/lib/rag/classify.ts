export type ChunkAudience = "player" | "mj" | "secret" | "general";

export type ClassifiedChunk = {
  text: string;
  audience: ChunkAudience;
};

const MJ_PATTERNS =
  /\b(pour le m\.?j\.?|ma[iî]tre du jeu|note(?:s)? (?:au|du) m\.?j\.?|info(?:rmation)? m\.?j\.?|\[m\.?j\.?\]|ne (?:pas )?lire aux joueurs|ne lisez pas|à ne pas lire|hors fiction|en coulisses)\b/i;

const PLAYER_PATTERNS =
  /\b(lisez (?:ceci )?aux joueurs|à lire aux joueurs|lire à voix haute|aux joueurs\s*:|description (?:à lire|du lieu)|lisez\s*:)/i;

const SECRET_PATTERNS =
  /\b(secret|confidentiel|révélation|ne révèle|si les? p[jh]s? (?:découvrent|ouvrent|réussissent)|vérité cachée|information cachée)\b/i;

function scoreAudience(text: string): ChunkAudience {
  const mj = MJ_PATTERNS.test(text);
  const player = PLAYER_PATTERNS.test(text);
  const secret = SECRET_PATTERNS.test(text);

  if (secret && !player) return "secret";
  if (mj && !player) return "mj";
  if (player && !mj) return "player";
  if (secret) return "secret";
  if (mj) return "mj";
  if (player) return "player";
  return "general";
}

/** Split raw PDF text into classified scenario chunks. */
export function classifyScenarioText(fullText: string, maxLen = 850): ClassifiedChunk[] {
  const cleaned = fullText.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];

  // Prefer splitting on headings / MJ markers to keep notes together
  const rough = cleaned.split(
    /(?=\n#{1,3}\s)|(?=\n[A-ZÉÈÀÂÊÎÔÛÙÇ][A-ZÉÈÀÂÊÎÔÛÙÇ \-]{6,}\n)|(?=\n(?:MJ|Maître du jeu|Pour le MJ|Aux joueurs|Secret)\s*[:\-])/i,
  );

  const pieces: string[] = [];
  for (const block of rough) {
    const t = block.trim();
    if (!t) continue;
    if (t.length <= maxLen) {
      pieces.push(t);
      continue;
    }
    // Fallback paragraph chunking
    let current = "";
    for (const para of t.split(/\n\n+/)) {
      const next = current ? `${current}\n\n${para}` : para;
      if (next.length <= maxLen) {
        current = next;
      } else {
        if (current) pieces.push(current.trim());
        if (para.length <= maxLen) current = para;
        else {
          for (let i = 0; i < para.length; i += maxLen) {
            pieces.push(para.slice(i, i + maxLen).trim());
          }
          current = "";
        }
      }
    }
    if (current.trim()) pieces.push(current.trim());
  }

  return pieces.filter(Boolean).map((text) => ({
    text,
    audience: scoreAudience(text),
  }));
}

export function formatChunkForPrompt(
  chunk: { text: string; audience?: ChunkAudience; index?: number },
  i: number,
): string {
  const audience = chunk.audience ?? "general";
  const label =
    audience === "player"
      ? "TEXTE À LIRE AUX JOUEURS (reproduis fidèlement / paraphrases minimales)"
      : audience === "mj"
        ? "NOTE MJ (ne pas lire tel quel aux joueurs — instructions de mise en scène)"
        : audience === "secret"
          ? "SECRET / CONFIDENTIEL (ne révéler QUE si la condition de révélation est remplie par les actions des PJ)"
          : "EXTRAIT SCÉNARIO";
  return `[${label} #${(chunk.index ?? i) + 1}]\n${chunk.text}`;
}

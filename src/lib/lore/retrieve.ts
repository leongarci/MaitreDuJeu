import type { LoreEntry, LoreEntryPrompt, LoreKind } from "@/lib/types";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 2);
}

function entryBlob(e: LoreEntry): string {
  return [e.name, ...e.aliases, e.summary, e.mjNotes, e.kind].join(" ");
}

export function retrieveLoreEntries(
  entries: LoreEntry[],
  query: string,
  opts?: { boostNames?: string[]; topK?: number },
): LoreEntry[] {
  if (entries.length === 0) return [];
  const topK = opts?.topK ?? 8;
  const qNorm = normalize(query);
  const qTokens = new Set(tokenize(query));
  const boosts = (opts?.boostNames ?? []).map(normalize).filter(Boolean);

  const scored = entries.map((entry) => {
    const nameN = normalize(entry.name);
    const aliasesN = entry.aliases.map(normalize);
    let score = 0;

    if (nameN.length > 2 && qNorm.includes(nameN)) {
      score += 12;
    }
    for (const a of aliasesN) {
      if (a.length > 2 && qNorm.includes(a)) score += 10;
    }
    for (const b of boosts) {
      if (!b) continue;
      if (b.includes(nameN) || nameN.includes(b)) score += 14;
      for (const a of aliasesN) {
        if (a.length > 2 && (b.includes(a) || a.includes(b))) score += 12;
      }
    }

    const tokens = tokenize(entryBlob(entry));
    for (const t of tokens) {
      if (qTokens.has(t)) score += 1;
    }
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const hits = scored.filter((s) => s.score > 0).slice(0, topK);
  if (hits.length > 0) return hits.map((h) => h.entry);

  // Soft fallback: nothing matched — return empty (don't dump the whole bible).
  return [];
}

export function toLorePrompts(entries: LoreEntry[]): LoreEntryPrompt[] {
  return entries.map((e) => ({
    kind: e.kind,
    name: e.name,
    summary: e.summary,
    mjNotes: e.mjNotes,
    secrets: e.secrets,
  }));
}

const KIND_LABEL: Record<LoreKind, string> = {
  pnj: "PNJ",
  creature: "Créature / type",
  lieu: "Lieu",
  faction: "Faction",
  objet: "Objet",
  autre: "Référence",
};

export function formatLoreForPrompt(entries: LoreEntryPrompt[]): string {
  if (entries.length === 0) {
    return "(aucune fiche pertinente pour ce tour)";
  }
  return entries
    .map((e) => {
      return `[${KIND_LABEL[e.kind] ?? e.kind} — ${e.name}]
Apparence / info joueurs (utilisable pour décrire):
${e.summary || "(vide)"}
Notes MJ (jeu, attitude, règles locales):
${e.mjNotes || "(aucune)"}
SECRETS (NE PAS révéler tant que les PJ ne l'ont pas mérité / découvert):
${e.secrets || "(aucun)"}`;
    })
    .join("\n\n");
}

import { formatChunkForPrompt } from "@/lib/rag/classify";
import type { PdfChunk } from "@/lib/types";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9àâäéèêëïîôùûüç]+/i)
    .filter((t) => t.length > 2);
}

export function retrieveChunks(
  chunks: PdfChunk[],
  query: string,
  topK = 5,
): PdfChunk[] {
  if (chunks.length === 0) return [];
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    return chunks.slice(0, topK);
  }

  const scored = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text);
    let score = 0;
    for (const token of tokens) {
      if (queryTokens.has(token)) score += 1;
    }
    return { chunk, score: score - chunk.index * 0.001 };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, topK);
  if (top.length === 0) return chunks.slice(0, Math.min(topK, 3));
  return top.map((s) => s.chunk);
}

/**
 * Window around scenario cursor (ordered trame) + a few keyword matches.
 * Cursor window is the source of truth for "what happens now".
 */
export function buildLorePack(
  chunks: PdfChunk[],
  query: string,
  opts?: {
    cursor?: number;
    windowBefore?: number;
    windowAfter?: number;
    relevantCount?: number;
  },
): PdfChunk[] {
  if (chunks.length === 0) return [];
  const byIndex = [...chunks].sort((a, b) => a.index - b.index);
  const cursor = Math.min(
    Math.max(0, opts?.cursor ?? 0),
    Math.max(0, byIndex.length - 1),
  );
  const before = opts?.windowBefore ?? 1;
  const after = opts?.windowAfter ?? 2;
  const relevantCount = opts?.relevantCount ?? 4;

  const start = Math.max(0, cursor - before);
  const end = Math.min(byIndex.length, cursor + after + 1);
  const window = byIndex.slice(start, end);

  const relevant = retrieveChunks(chunks, query, relevantCount);
  const seen = new Set<string>();
  const pack: PdfChunk[] = [];
  for (const c of [...window, ...relevant]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    pack.push(c);
  }
  pack.sort((a, b) => a.index - b.index);
  return pack;
}

export function lorePackToPromptLines(
  chunks: Array<{ text: string; audience?: PdfChunk["audience"]; index?: number }>,
): string {
  if (chunks.length === 0) return "(aucun extrait PDF)";
  return chunks.map((c, i) => formatChunkForPrompt(c, i)).join("\n\n");
}

/** @deprecated kept for pdf-ingest fallback */
export function chunkText(text: string, maxLen = 900): string[] {
  const cleaned = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];
  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    const next = current ? `${current}\n\n${para}` : para;
    if (next.length <= maxLen) {
      current = next;
      continue;
    }
    if (current) chunks.push(current.trim());
    if (para.length <= maxLen) current = para;
    else {
      for (let i = 0; i < para.length; i += maxLen) {
        chunks.push(para.slice(i, i + maxLen).trim());
      }
      current = "";
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

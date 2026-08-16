import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import {
  geminiModelCandidates,
  isMissingGeminiModel,
  isTransientGeminiError,
  sleep,
} from "@/lib/gm/gemini";
import type { LoreEntryDraft, LoreKind } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const SEGMENT_CHARS = 18_000;
const MAX_INPUT_CHARS = 400_000;

const KINDS: LoreKind[] = [
  "pnj",
  "creature",
  "lieu",
  "faction",
  "objet",
  "autre",
];

const SAFETY = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({
  category,
  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
}));

function modelCandidates(): string[] {
  return geminiModelCandidates();
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Réponse non JSON");
  }
}

function parseKind(raw: unknown): LoreKind {
  if (typeof raw === "string" && KINDS.includes(raw as LoreKind)) {
    return raw as LoreKind;
  }
  return "autre";
}

function parseEntries(raw: string): LoreEntryDraft[] {
  const data = extractJson(raw) as { entries?: unknown };
  if (!Array.isArray(data.entries)) return [];
  const out: LoreEntryDraft[] = [];
  for (const item of data.entries) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (!name) continue;
    const aliases = Array.isArray(e.aliases)
      ? e.aliases
          .filter((a): a is string => typeof a === "string")
          .map((a) => a.trim())
          .filter(Boolean)
      : [];
    out.push({
      kind: parseKind(e.kind),
      name,
      aliases,
      summary: typeof e.summary === "string" ? e.summary.trim() : "",
      mjNotes: typeof e.mjNotes === "string" ? e.mjNotes.trim() : "",
      secrets: typeof e.secrets === "string" ? e.secrets.trim() : "",
    });
  }
  return out;
}

function splitSegments(text: string): string[] {
  if (text.length <= SEGMENT_CHARS) return [text];
  const segments: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + SEGMENT_CHARS, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const breakAt = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf("\n"),
      );
      if (breakAt > SEGMENT_CHARS * 0.45) end = start + breakAt;
    }
    const piece = text.slice(start, end).trim();
    if (piece) segments.push(piece);
    start = end;
  }
  return segments.length ? segments : [text];
}

function mergeEntries(all: LoreEntryDraft[]): LoreEntryDraft[] {
  const byKey = new Map<string, LoreEntryDraft>();
  for (const e of all) {
    const key = e.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, e);
      continue;
    }
    byKey.set(key, {
      kind: prev.kind === "autre" ? e.kind : prev.kind,
      name: prev.name.length >= e.name.length ? prev.name : e.name,
      aliases: Array.from(new Set([...prev.aliases, ...e.aliases, e.name, prev.name])),
      summary: prev.summary.length >= e.summary.length ? prev.summary : e.summary,
      mjNotes: [prev.mjNotes, e.mjNotes].filter(Boolean).join("\n").slice(0, 2000),
      secrets: [prev.secrets, e.secrets].filter(Boolean).join("\n").slice(0, 2000),
    });
  }
  return Array.from(byKey.values());
}

function buildPrompt(opts: {
  title: string;
  segment: string;
  partIndex: number;
  partTotal: number;
  knownNames: string[];
}): string {
  const known =
    opts.knownNames.length > 0
      ? `Déjà extraits (complète / enrichis si nouveau détail, sinon ignore) :\n${opts.knownNames
          .slice(-40)
          .map((n) => `- ${n}`)
          .join("\n")}`
      : "Aucune entrée encore.";

  return `Tu extrais la BIBLE DE RÉFÉRENCE d'un scénario de JDR (pas la trame narrative).
Titre: ${opts.title}
Partie ${opts.partIndex + 1}/${opts.partTotal}.

Extrais les fiches / descriptions utiles au MJ :
- pnj : personnages nommés
- creature : types de créatures, monstres, archétypes
- lieu : lieux, salles, domaines
- faction : organisations, hiérarchies
- objet : objets / artefacts importants
- autre : autres fiches de référence

Pour chaque entrée:
- kind, name, aliases[]
- summary: description utilisable pour décrire aux joueurs (apparence, ambiance) SANS spoilers
- mjNotes: comment le jouer / stats / attitude (MJ only)
- secrets: vérités cachées, faiblesses, spoilers — à part

IGNORE les événements narratifs / scènes (ce n'est pas une trame).
Si ce morceau n'a aucune fiche → { "entries": [] }.
${known}
JSON uniquement: { "entries": [ ... ] }

TEXTE:
${opts.segment}`;
}

async function extractSegment(
  genAI: GoogleGenerativeAI,
  prompt: string,
): Promise<LoreEntryDraft[]> {
  let lastError: unknown;
  for (const modelName of modelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
        safetySettings: SAFETY,
      });
      const result = await model.generateContent(prompt);
      return parseEntries(result.response.text());
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (isMissingGeminiModel(msg)) continue;
      if (isTransientGeminiError(msg)) {
        await sleep(700);
        continue;
      }
      break;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Extraction lore échouée");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; text?: string };
    const text = body.text?.trim() ?? "";
    if (text.length < 40) {
      return NextResponse.json({ error: "Texte trop court" }, { status: 400 });
    }

    const clipped = text.slice(0, MAX_INPUT_CHARS);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        entries: [],
        source: "fallback",
        warning: "GEMINI_API_KEY manquante — pas de bible de référence",
      });
    }

    const segments = splitSegments(clipped);
    const genAI = new GoogleGenerativeAI(apiKey);
    const collected: LoreEntryDraft[] = [];
    const knownNames: string[] = [];

    try {
      for (let i = 0; i < segments.length; i++) {
        const prompt = buildPrompt({
          title: body.title || "Sans titre",
          segment: segments[i],
          partIndex: i,
          partTotal: segments.length,
          knownNames,
        });
        const part = await extractSegment(genAI, prompt);
        for (const e of part) {
          collected.push(e);
          knownNames.push(e.name);
        }
      }
      const entries = mergeEntries(collected);
      return NextResponse.json({
        entries,
        source: "gemini",
        entryCount: entries.length,
        parts: segments.length,
      });
    } catch (lastError) {
      console.warn("extract-lore fallback", lastError);
      return NextResponse.json({
        entries: mergeEntries(collected),
        source: "partial",
        warning: "Extraction partielle de la bible de référence",
        entryCount: collected.length,
      });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur extraction lore" },
      { status: 500 },
    );
  }
}

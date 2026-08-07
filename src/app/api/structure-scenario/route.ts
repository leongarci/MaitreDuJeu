import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import type { StructuredBeatDraft } from "@/lib/types";

export const runtime = "nodejs";

const MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.5-flash",
];

/** Split long PDFs so each Gemini call can finish its JSON without truncating mid-scenario. */
const SEGMENT_CHARS = 16_000;
const MAX_INPUT_CHARS = 400_000;

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
  const preferred = process.env.GEMINI_MODEL?.trim();
  return preferred
    ? [preferred, ...MODELS.filter((m) => m !== preferred)]
    : MODELS;
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

/** Reject reference dumps that slipped through as fake "beats". */
const REFERENCE_BEAT =
  /\b(fiche|arch[eé]type|bestiaire|glossaire|appendice|stat\s*block|feuille de (?:perso|personnage)|cr[eé]ation de personnage|liste d['’]?[eé]quipement|table des mati[eè]res)\b/i;

function looksLikeReferenceBeat(b: StructuredBeatDraft): boolean {
  const blob = `${b.title}\n${b.playerText}\n${b.mjNotes}\n${b.objective}`;
  if (REFERENCE_BEAT.test(blob)) return true;
  // Stat-line dumps without a story transition
  const hasStats =
    /\b(FOR|DEX|CON|INT|SAG|CHA)\s*[:\-]?\s*\d{1,2}\b/.test(blob) &&
    /\b(PV|HP|points? de vie)\b/i.test(blob);
  const noStory =
    !b.transition.trim() &&
    !/\b(mission|arriv|rencontre|combat|fuite|d[eé]couverte|twist|confrontation|briefing)\b/i.test(
      blob,
    );
  return hasStats && noStory;
}

function parseBeats(raw: string): StructuredBeatDraft[] {
  const data = extractJson(raw) as { beats?: unknown };
  if (!Array.isArray(data.beats)) return [];
  const beats: StructuredBeatDraft[] = [];
  for (const item of data.beats) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title) continue;
    const draft: StructuredBeatDraft = {
      title,
      playerText: typeof b.playerText === "string" ? b.playerText.trim() : "",
      mjNotes: typeof b.mjNotes === "string" ? b.mjNotes.trim() : "",
      secrets: typeof b.secrets === "string" ? b.secrets.trim() : "",
      transition: typeof b.transition === "string" ? b.transition.trim() : "",
      objective: typeof b.objective === "string" ? b.objective.trim() : "",
    };
    if (looksLikeReferenceBeat(draft)) continue;
    beats.push(draft);
  }
  return beats;
}

/** Heuristic fallback if Gemini fails — one beat per large chunk. */
function fallbackBeats(text: string): StructuredBeatDraft[] {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 80);
  const grouped: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + "\n\n" + p).length < 1200) buf = buf ? `${buf}\n\n${p}` : p;
    else {
      if (buf) grouped.push(buf);
      buf = p;
    }
  }
  if (buf) grouped.push(buf);
  return grouped.slice(0, 80).map((block, i) => ({
    title: `Scène ${i + 1}`,
    playerText: block.slice(0, 900),
    mjNotes: "",
    secrets: "",
    transition: "Quand les PJ ont exploré / résolu l'enjeu de cette scène",
    objective: "",
  }));
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
      if (breakAt > SEGMENT_CHARS * 0.45) {
        end = start + breakAt;
      }
    }
    const piece = text.slice(start, end).trim();
    if (piece) segments.push(piece);
    start = end;
  }
  return segments.length ? segments : [text];
}

function buildPrompt(opts: {
  title: string;
  segment: string;
  partIndex: number;
  partTotal: number;
  previousTitles: string[];
}): string {
  const prev =
    opts.previousTitles.length > 0
      ? `Étapes déjà extraites (ne les refais PAS) :\n${opts.previousTitles
          .map((t, i) => `${i + 1}. ${t}`)
          .join("\n")}`
      : "Aucune étape précédente.";

  return `Tu extrais la TRAME NARRATIVE d'un scénario de JDR pour un MJ automatique.
Titre: ${opts.title}
Partie ${opts.partIndex + 1}/${opts.partTotal} du PDF.

## Qu'est-ce qu'un BATTLEMENT ?
Uniquement une ÉTAPE D'HISTOIRE / événement narratif clé, dans l'ordre de la partie.
Exemples VALIDES: briefing de mission, arrivée sur place, rencontre avec X, découverte d'un indice, embuscade, twist, confrontation finale, épilogue.

## Ce qui N'EST PAS un battement (IGNORE totalement — ne crée AUCUN battement pour ça)
- Fiches / archétypes / types de personnages ou PNJ (stats, traits, background générique)
- Encyclopédie de lieux / factions / bestiaire hors scène
- Listes d'équipement, règles générales, appendices, tables, glossaires
- Descriptions de référence sans événement de jeu "ici et maintenant"

Si CE MORCEAU ne contient QUE du matériel de référence → réponds { "beats": [] }.
Les fiches et explications restent disponibles ailleurs pour le MJ ; elles ne font pas partie de la trame.

## Pour chaque battement narratif
- title: nom court de l'étape
- playerText: texte À LIRE AUX JOUEURS tel quel (boxed text / description narrative de CETTE étape). Vide si rien à lire. Ne mets PAS de fiche perso ici.
- mjNotes: politique MJ pour CETTE étape — quand laisser les PJ agir / explorer, pièges de rythme, mise en scène (pas une fiche complète). Ex: "Laisse les PJ planifier le chaos avant d'avancer", "Ne révèle X que s'ils fouillent".
- secrets: infos cachées + condition de révélation pour CETTE étape
- transition: critère CONCRET et testable pour considérer l'étape terminée (ce que les PJ doivent avoir fait / obtenu). Ex: "Les PJ ont reçu la mission et quittent la Cité Céleste", "Le barbecue est sabordé / le chaos est lancé". Pas vague ("quand c'est fini").
- objective: but MJ de l'étape (ex: "remettre la mission Charlie Jinx")

## Règles
- Ordre chronologique de la partie seulement
- Une étape = un événement clé (pas un lieu entier ni une fiche)
- N'OMETS PAS les étapes intermédiaires jouables: briefing → trajet/arrivée → scène principale → twists éventuels. Un twist du type "changement de cible pendant le chaos" ne doit PAS suivre directement le briefing.
- Préfère peu de battements JUSTES plutôt que beaucoup de faux battements de référence
- ${prev}
- JSON uniquement: { "beats": [ ... ] }

TEXTE (partie ${opts.partIndex + 1}/${opts.partTotal}):
${opts.segment}`;
}

async function structureSegment(
  genAI: GoogleGenerativeAI,
  prompt: string,
): Promise<StructuredBeatDraft[]> {
  let lastError: unknown;
  for (const modelName of modelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
        safetySettings: SAFETY,
      });
      const result = await model.generateContent(prompt);
      // Empty array is valid (reference-only segment).
      return parseBeats(result.response.text());
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404") || msg.includes("429") || /not found/i.test(msg)) {
        continue;
      }
      break;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Structuration segment échouée");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      text?: string;
    };
    const text = body.text?.trim() ?? "";
    if (text.length < 40) {
      return NextResponse.json({ error: "Texte trop court" }, { status: 400 });
    }

    const clipped = text.slice(0, MAX_INPUT_CHARS);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        beats: fallbackBeats(clipped),
        source: "fallback",
        warning: "GEMINI_API_KEY manquante — découpage heuristique",
      });
    }

    const segments = splitSegments(clipped);
    const genAI = new GoogleGenerativeAI(apiKey);
    const allBeats: StructuredBeatDraft[] = [];
    const previousTitles: string[] = [];

    try {
      for (let i = 0; i < segments.length; i++) {
        const prompt = buildPrompt({
          title: body.title || "Sans titre",
          segment: segments[i],
          partIndex: i,
          partTotal: segments.length,
          previousTitles,
        });
        const partBeats = await structureSegment(genAI, prompt);
        for (const b of partBeats) {
          allBeats.push(b);
          previousTitles.push(b.title);
        }
      }

      if (allBeats.length === 0) {
        throw new Error("Aucun battement");
      }

      return NextResponse.json({
        beats: allBeats,
        source: "gemini",
        parts: segments.length,
        beatCount: allBeats.length,
      });
    } catch (lastError) {
      console.warn("structure-scenario fallback", lastError);
      return NextResponse.json({
        beats: fallbackBeats(clipped),
        source: "fallback",
        warning: "Structuration IA indisponible — découpage heuristique",
      });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur structuration" },
      { status: 500 },
    );
  }
}

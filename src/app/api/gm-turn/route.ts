import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { isVaguePlayerAction } from "@/lib/gm/action-guard";
import { buildCheckSetupNarration } from "@/lib/gm/check-setup";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/gm/prompt";
import { parseGmResponse } from "@/lib/gm/tools";
import type { GmTurnRequest } from "@/lib/types";

export const runtime = "nodejs";

const DEFAULT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
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
  const preferred = process.env.GEMINI_MODEL?.trim();
  return preferred
    ? [preferred, ...DEFAULT_MODELS.filter((m) => m !== preferred)]
    : DEFAULT_MODELS;
}

function friendlyGeminiError(err: unknown): { message: string; status: number } {
  const raw = err instanceof Error ? err.message : String(err);
  if (/PROHIBITED_CONTENT|blocked|SAFETY|finishReason/i.test(raw)) {
    return {
      status: 422,
      message:
        "Gemini a bloqué la réponse (filtre de contenu). Reformule l’action un peu moins crue, ou réessaie — le MJ reste en fiction JDR.",
    };
  }
  if (raw.includes("429") || /quota|rate.?limit|Too Many Requests/i.test(raw)) {
    return {
      status: 429,
      message:
        "Quota Gemini dépassé. Attends ~1 minute ou change GEMINI_MODEL (ex. gemini-3.1-flash-lite).",
    };
  }
  if (raw.includes("404") || /not found|not supported/i.test(raw)) {
    return {
      status: 502,
      message:
        "Modèle Gemini introuvable. Mets à jour GEMINI_MODEL dans .env.local.",
    };
  }
  if (raw.includes("API_KEY") || raw.includes("403") || /invalid.*key/i.test(raw)) {
    return {
      status: 401,
      message: "Clé Gemini invalide. Vérifie GEMINI_API_KEY dans .env.local.",
    };
  }
  return { status: 500, message: raw || "Erreur MJ" };
}

function extractText(result: {
  response: {
    text: () => string;
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{ finishReason?: string; content?: unknown }>;
  };
}): string {
  const block = result.response.promptFeedback?.blockReason;
  if (block) {
    throw new Error(`PROHIBITED_CONTENT: prompt blocked (${block})`);
  }
  const finish = result.response.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") {
    throw new Error(`PROHIBITED_CONTENT: finishReason=${finish}`);
  }
  try {
    const text = result.response.text();
    if (!text?.trim()) {
      throw new Error("PROHIBITED_CONTENT: empty response");
    }
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/PROHIBITED|blocked|Text not available/i.test(msg)) {
      throw new Error(`PROHIBITED_CONTENT: ${msg}`);
    }
    throw e;
  }
}

async function generateOnce(
  apiKey: string,
  modelName: string,
  parts: Array<{ text: string }>,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.85,
      responseMimeType: "application/json",
    },
    safetySettings: SAFETY,
  });
  const result = await model.generateContent(parts);
  return extractText(result);
}

async function generateWithFallback(
  apiKey: string,
  body: GmTurnRequest,
): Promise<string> {
  const baseParts = [
    { text: buildSystemPrompt() },
    { text: buildUserPrompt(body) },
  ];
  const softParts = [
    {
      text: `${buildSystemPrompt()}

NOTE SÉCURITÉ: Si le contenu est borderline, reformule en comédie JDR fictionnelle moins graphique, sans censurer l'intrigue.`,
    },
    { text: buildUserPrompt(body) },
  ];

  let lastError: unknown;
  for (const modelName of modelCandidates()) {
    try {
      return await generateOnce(apiKey, modelName, baseParts);
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404") || msg.includes("not found") || (msg.includes("429") && msg.includes("limit: 0"))) {
        console.warn(`Gemini model ${modelName} failed, trying next…`, msg.slice(0, 180));
        continue;
      }
      if (/PROHIBITED_CONTENT/i.test(msg)) {
        try {
          console.warn(`Gemini blocked on ${modelName}, soft retry…`);
          return await generateOnce(apiKey, modelName, softParts);
        } catch (e2) {
          lastError = e2;
          continue;
        }
      }
      throw e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Aucun modèle Gemini disponible");
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY manquante dans .env.local" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as GmTurnRequest;
    if (!body?.mode) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    if (body.mode !== "intro" && !body.activeCharacterId) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const raw = await generateWithFallback(apiKey, body);
    const parsed = parseGmResponse(raw);

    if (parsed.play_asset) {
      const known = new Set(body.assets.map((a) => a.id));
      if (!known.has(parsed.play_asset.assetId)) {
        parsed.play_asset = null;
      }
    }

    // Never invent dice during intro/relance/resolve — stops infinite check loops.
    if (
      body.mode === "intro" ||
      body.mode === "relance" ||
      body.mode === "resolve_check" ||
      body.mode === "resolve_npc" ||
      body.mode === "resolve_attack"
    ) {
      parsed.propose_check = null;
    }
    // Vague confirmations must not become invented skill checks.
    if (
      body.mode === "action" &&
      typeof body.action === "string" &&
      isVaguePlayerAction(body.action)
    ) {
      parsed.propose_check = null;
    }
    // Intro / relance: never skip beats. Action & resolve_check may advance
    // when the beat transition is met (model judged from MJ notes).
    if (body.mode === "intro" || body.mode === "relance") {
      parsed.advance_scenario = 0;
    }
    if (body.mode === "resolve_npc" || body.mode === "resolve_attack") {
      parsed.hp_updates = [];
      parsed.propose_check = null;
      parsed.start_encounter = null;
      if (body.mode === "resolve_npc") {
        parsed.end_encounter = false;
        parsed.inventory_updates = [];
        parsed.advance_scenario = 0;
      }
    }
    // Don't resolve the world before the die — stake-only narration.
    if (parsed.propose_check) {
      const who =
        body.characters.find((c) => c.id === body.activeCharacterId)?.name ||
        "Le personnage";
      parsed.narration = buildCheckSetupNarration({
        characterName: who,
        action: body.action || parsed.propose_check.reason,
        attribute: parsed.propose_check.attribute,
        dc: parsed.propose_check.dc,
        reason: parsed.propose_check.reason,
      });
      parsed.update_graph = { nodes: [], edges: [] };
      parsed.inventory_updates = [];
      parsed.hp_updates = [];
      parsed.party_split = null;
      parsed.play_asset = null;
      parsed.advance_scenario = 0;
      parsed.ask_dialogue = null;
      parsed.location_update = null;
      parsed.session_summary_update = null;
      parsed.start_encounter = null;
      parsed.end_encounter = false;
    }
    if (typeof parsed.advance_scenario !== "number") {
      parsed.advance_scenario = 0;
    } else {
      parsed.advance_scenario = Math.max(
        0,
        Math.min(1, Math.round(parsed.advance_scenario)),
      );
    }

    return NextResponse.json(parsed);
  } catch (e) {
    console.error(e);
    const { message, status } = friendlyGeminiError(e);
    return NextResponse.json({ error: message }, { status });
  }
}

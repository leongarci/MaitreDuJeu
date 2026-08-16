import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { buildOocSystemPrompt, buildOocUserPrompt } from "@/lib/gm/ooc-prompt";
import type { GmOocRequest, GmOocResponse } from "@/lib/types";

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

function extractAnswer(raw: string): string {
  const trimmed = raw.trim();
  try {
    const data = JSON.parse(trimmed) as { answer?: unknown };
    if (typeof data.answer === "string" && data.answer.trim()) {
      return data.answer.trim();
    }
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) {
      try {
        const data = JSON.parse(fenced[1].trim()) as { answer?: unknown };
        if (typeof data.answer === "string" && data.answer.trim()) {
          return data.answer.trim();
        }
      } catch {
        /* fall through */
      }
    }
  }
  return trimmed || "Je n’ai pas de réponse claire — reformule la question.";
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

    const body = (await request.json()) as GmOocRequest;
    if (!body?.question?.trim()) {
      return NextResponse.json({ error: "Question vide" }, { status: 400 });
    }

    let lastError: unknown;
    for (const modelName of modelCandidates()) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
          },
          safetySettings: SAFETY,
        });
        const result = await model.generateContent([
          { text: buildOocSystemPrompt() },
          { text: buildOocUserPrompt(body) },
        ]);
        const raw = result.response.text();
        const payload: GmOocResponse = { answer: extractAnswer(raw) };
        return NextResponse.json(payload);
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (
          msg.includes("404") ||
          msg.includes("not found") ||
          (msg.includes("429") && msg.includes("limit: 0"))
        ) {
          continue;
        }
        throw e;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Aucun modèle Gemini disponible");
  } catch (e) {
    console.error(e);
    const raw = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: raw || "Erreur MJ hors-jeu" }, { status: 500 });
  }
}

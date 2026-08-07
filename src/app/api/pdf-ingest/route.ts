import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { classifyScenarioText } from "@/lib/rag/classify";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier PDF manquant" }, { status: 400 });
    }
    if (
      !file.name.toLowerCase().endsWith(".pdf") &&
      file.type !== "application/pdf"
    ) {
      return NextResponse.json(
        { error: "Le fichier doit être un PDF" },
        { status: 400 },
      );
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const parser = new PDFParse({ data });
    try {
      const result = await parser.getText();
      const text = result.text?.trim() ?? "";
      if (!text) {
        return NextResponse.json(
          { error: "Aucun texte extractible dans ce PDF" },
          { status: 422 },
        );
      }

      const classified = classifyScenarioText(text);
      return NextResponse.json({
        pages: result.total,
        chunkCount: classified.length,
        chunks: classified,
      });
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (error) {
    console.error("pdf-ingest", error);
    return NextResponse.json(
      { error: "Échec de l'extraction PDF" },
      { status: 500 },
    );
  }
}

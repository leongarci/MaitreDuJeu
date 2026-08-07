import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { classifyScenarioText } from "@/lib/rag/classify";

export const runtime = "nodejs";
export const maxDuration = 60;

async function textFromPdfBytes(data: Uint8Array): Promise<{
  text: string;
  pages: number;
}> {
  const pdf = await getDocumentProxy(data);
  const result = await extractText(pdf, { mergePages: true });
  const text = (
    Array.isArray(result.text) ? result.text.join("\n\n") : result.text || ""
  ).trim();
  return { text, pages: result.totalPages ?? pdf.numPages ?? 0 };
}

/** Accept multipart PDF file, or JSON { text } already extracted client-side. */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let text = "";
    let pages = 0;

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { text?: string };
      text = body.text?.trim() ?? "";
    } else {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Fichier PDF manquant" },
          { status: 400 },
        );
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
      if (file.size > 4_500_000) {
        return NextResponse.json(
          {
            error:
              "PDF trop volumineux pour l’hébergement (>4,5 Mo). Réessaie depuis le téléphone/PC — extraction locale.",
          },
          { status: 413 },
        );
      }
      const data = new Uint8Array(await file.arrayBuffer());
      const parsed = await textFromPdfBytes(data);
      text = parsed.text;
      pages = parsed.pages;
    }

    if (!text) {
      return NextResponse.json(
        { error: "Aucun texte extractible dans ce PDF" },
        { status: 422 },
      );
    }

    const classified = classifyScenarioText(text);
    return NextResponse.json({
      pages,
      chunkCount: classified.length,
      chunks: classified,
    });
  } catch (error) {
    console.error("pdf-ingest", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Échec de l'extraction PDF: ${error.message}`
            : "Échec de l'extraction PDF",
      },
      { status: 500 },
    );
  }
}

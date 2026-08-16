import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_BASE = "https://image.pollinations.ai/prompt";
const DEFAULT_MODEL = "flux";
const MAX_PROMPT = 700;
const WIDTH = 1280;
const HEIGHT = 720;
const TIMEOUT_MS = 50_000;

function pollinationsUrl(prompt: string, seed: number): string {
  const base = (
    process.env.POLLINATIONS_BASE_URL || DEFAULT_BASE
  ).replace(/\/$/, "");
  const model = process.env.POLLINATIONS_MODEL?.trim() || DEFAULT_MODEL;
  const params = new URLSearchParams({
    model,
    width: String(WIDTH),
    height: String(HEIGHT),
    nologo: "true",
    private: "true",
    seed: String(seed),
  });
  return `${base}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      seed?: number;
    };
    const prompt = body.prompt?.trim() ?? "";
    if (!prompt) {
      return NextResponse.json({ error: "Prompt vide" }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT) {
      return NextResponse.json({ error: "Prompt trop long" }, { status: 400 });
    }

    const seed =
      typeof body.seed === "number" && Number.isFinite(body.seed)
        ? Math.abs(Math.floor(body.seed))
        : Math.floor(Math.random() * 1_000_000);

    const headers: Record<string, string> = { Accept: "image/*" };
    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(pollinationsUrl(prompt, seed), {
        method: "GET",
        headers,
        cache: "no-store",
        signal: ctrl.signal,
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return NextResponse.json(
        { error: aborted ? "Pollinations a trop tardé" : "Pollinations injoignable" },
        { status: 504 },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const status = res.status === 401 || res.status === 403 ? 401 : 502;
      return NextResponse.json(
        {
          error:
            status === 401
              ? "Clé Pollinations invalide. Vérifie POLLINATIONS_API_KEY."
              : `Pollinations a refusé (${res.status})`,
        },
        { status },
      );
    }

    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Pollinations n’a pas renvoyé une image" },
        { status: 502 },
      );
    }

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 1024) {
      return NextResponse.json(
        { error: "Image Pollinations trop petite" },
        { status: 502 },
      );
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": type.split(";")[0] || "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur image" },
      { status: 500 },
    );
  }
}

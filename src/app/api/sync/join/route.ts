import { NextResponse } from "next/server";
import { pullByJoinCode } from "@/lib/sync/ops";
import { getSupabaseAdmin, normalizeJoinCode } from "@/lib/sync/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { joinCode?: string };
    const joinCode = normalizeJoinCode(body.joinCode || "");
    if (joinCode.length < 4) {
      return NextResponse.json({ error: "Code invalide" }, { status: 400 });
    }
    const admin = getSupabaseAdmin();
    const snap = await pullByJoinCode(admin, joinCode);
    if (!snap) {
      return NextResponse.json({ error: "Aucune partie pour ce code" }, { status: 404 });
    }
    return NextResponse.json({ snapshot: snap });
  } catch (e) {
    console.error("sync/join", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec join" },
      { status: 500 },
    );
  }
}

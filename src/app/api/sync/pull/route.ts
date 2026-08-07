import { NextResponse } from "next/server";
import { pullByCampaignId, pullByJoinCode } from "@/lib/sync/ops";
import { getSupabaseAdmin, normalizeJoinCode } from "@/lib/sync/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      joinCode?: string;
      campaignId?: string;
    };
    const admin = getSupabaseAdmin();
    let snap = null;
    if (body.joinCode) {
      snap = await pullByJoinCode(admin, normalizeJoinCode(body.joinCode));
    } else if (body.campaignId) {
      snap = await pullByCampaignId(admin, body.campaignId);
    } else {
      return NextResponse.json({ error: "joinCode ou campaignId requis" }, { status: 400 });
    }
    if (!snap) {
      return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
    }
    return NextResponse.json({ snapshot: snap });
  } catch (e) {
    console.error("sync/pull", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec pull" },
      { status: 500 },
    );
  }
}

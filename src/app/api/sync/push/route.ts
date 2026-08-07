import { NextResponse } from "next/server";
import { pushSnapshot } from "@/lib/sync/ops";
import { getSupabaseAdmin, normalizeJoinCode } from "@/lib/sync/server";
import type { CampaignSnapshot } from "@/lib/sync/snapshot";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      joinCode?: string;
      snapshot?: CampaignSnapshot;
    };
    if (!body.snapshot?.campaign) {
      return NextResponse.json({ error: "Snapshot invalide" }, { status: 400 });
    }
    const joinCode = normalizeJoinCode(
      body.joinCode || body.snapshot.campaign.joinCode || "",
    );
    if (joinCode.length < 4) {
      return NextResponse.json({ error: "joinCode invalide" }, { status: 400 });
    }
    body.snapshot.campaign.joinCode = joinCode;

    const admin = getSupabaseAdmin();
    await pushSnapshot(admin, body.snapshot);
    return NextResponse.json({
      ok: true,
      campaignId: body.snapshot.campaign.id,
      joinCode,
      updatedAt: body.snapshot.campaign.updatedAt,
    });
  } catch (e) {
    console.error("sync/push", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec push" },
      { status: 500 },
    );
  }
}

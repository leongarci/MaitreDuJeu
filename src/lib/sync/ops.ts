import type { SupabaseClient } from "@supabase/supabase-js";
import {
  campaignToRow,
  rowToCampaign,
  type CampaignSnapshot,
} from "@/lib/sync/snapshot";
import { normalizeJoinCode } from "@/lib/sync/server";

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (!row?.id) continue;
    map.set(row.id, row);
  }
  return Array.from(map.values());
}

export async function pushSnapshot(
  admin: SupabaseClient,
  snap: CampaignSnapshot,
): Promise<void> {
  const campaignId = snap.campaign.id;
  const row = campaignToRow({
    ...snap.campaign,
    joinCode: normalizeJoinCode(snap.campaign.joinCode || ""),
  });
  if (!row.join_code) {
    throw new Error("joinCode manquant");
  }

  const characters = dedupeById(snap.characters);
  const messages = dedupeById(snap.messages);
  const scenarioBeats = dedupeById(snap.scenarioBeats);
  const loreEntries = dedupeById(snap.loreEntries);
  const graphNodes = dedupeById(snap.graphNodes);
  const graphEdges = dedupeById(snap.graphEdges);
  const pdfChunks = dedupeById(snap.pdfChunks);

  const { error: cErr } = await admin.from("campaigns").upsert(row);
  if (cErr) throw new Error(cErr.message);

  const wipe = async (table: string) => {
    const { error } = await admin.from(table).delete().eq("campaign_id", campaignId);
    if (error) throw new Error(`${table}: ${error.message}`);
  };

  await wipe("characters");
  await wipe("messages");
  await wipe("scenario_beats");
  await wipe("lore_entries");
  await wipe("graph_nodes");
  await wipe("graph_edges");
  await wipe("pdf_chunks");

  if (characters.length) {
    const { error } = await admin.from("characters").insert(
      characters.map((c) => ({
        id: c.id,
        campaign_id: campaignId,
        name: c.name,
        attributes: c.attributes,
        hp: c.hp,
        max_hp: c.maxHp,
        inventory: c.inventory,
        party_group_id: c.partyGroupId || "",
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (messages.length) {
    const { error } = await admin.from("messages").insert(
      messages.map((m) => ({
        id: m.id,
        campaign_id: campaignId,
        role: m.role,
        character_id: m.characterId ?? null,
        text: m.text,
        created_at: m.createdAt,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (scenarioBeats.length) {
    const { error } = await admin.from("scenario_beats").insert(
      scenarioBeats.map((b) => ({
        id: b.id,
        campaign_id: campaignId,
        beat_order: b.order,
        title: b.title,
        player_text: b.playerText,
        mj_notes: b.mjNotes,
        secrets: b.secrets,
        transition: b.transition,
        objective: b.objective,
        validated: b.validated,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (loreEntries.length) {
    const { error } = await admin.from("lore_entries").insert(
      loreEntries.map((e) => ({
        id: e.id,
        campaign_id: campaignId,
        kind: e.kind,
        name: e.name,
        aliases: e.aliases,
        summary: e.summary,
        mj_notes: e.mjNotes,
        secrets: e.secrets,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (graphNodes.length) {
    const { error } = await admin.from("graph_nodes").upsert(
      graphNodes.map((n) => ({
        id: n.id,
        campaign_id: campaignId,
        type: n.type,
        name: n.name,
        description: n.description,
        mj_notes: n.mjNotes ?? "",
        revealed: n.revealed !== false,
      })),
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
  }

  if (graphEdges.length) {
    const { error } = await admin.from("graph_edges").upsert(
      graphEdges.map((e) => ({
        id: e.id,
        campaign_id: campaignId,
        from_id: e.fromId,
        to_id: e.toId,
        relation: e.relation,
        category: e.category,
        affinity: e.affinity,
        revealed: e.revealed,
      })),
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
  }

  if (pdfChunks.length) {
    const { error } = await admin.from("pdf_chunks").insert(
      pdfChunks.map((c) => ({
        id: c.id,
        campaign_id: campaignId,
        text: c.text,
        index: c.index,
        audience: c.audience,
      })),
    );
    if (error) throw new Error(error.message);
  }
}

export async function pullByJoinCode(
  admin: SupabaseClient,
  code: string,
): Promise<CampaignSnapshot | null> {
  const joinCode = normalizeJoinCode(code);
  const { data: camp, error } = await admin
    .from("campaigns")
    .select("*")
    .eq("join_code", joinCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!camp) return null;

  const campaign = rowToCampaign(camp as Record<string, unknown>);
  const id = campaign.id;

  const [characters, messages, scenarioBeats, loreEntries, graphNodes, graphEdges, pdfChunks] =
    await Promise.all([
      admin.from("characters").select("*").eq("campaign_id", id),
      admin.from("messages").select("*").eq("campaign_id", id).order("created_at"),
      admin.from("scenario_beats").select("*").eq("campaign_id", id).order("beat_order"),
      admin.from("lore_entries").select("*").eq("campaign_id", id),
      admin.from("graph_nodes").select("*").eq("campaign_id", id),
      admin.from("graph_edges").select("*").eq("campaign_id", id),
      admin.from("pdf_chunks").select("*").eq("campaign_id", id).order("index"),
    ]);

  for (const r of [
    characters,
    messages,
    scenarioBeats,
    loreEntries,
    graphNodes,
    graphEdges,
    pdfChunks,
  ]) {
    if (r.error) throw new Error(r.error.message);
  }

  return {
    campaign,
    characters: (characters.data ?? []).map((c) => ({
      id: c.id,
      campaignId: c.campaign_id,
      name: c.name,
      attributes: c.attributes,
      hp: c.hp,
      maxHp: c.max_hp,
      inventory: c.inventory ?? [],
      partyGroupId: c.party_group_id || "",
    })),
    messages: (messages.data ?? []).map((m) => ({
      id: m.id,
      campaignId: m.campaign_id,
      role: m.role,
      characterId: m.character_id ?? undefined,
      text: m.text,
      createdAt: m.created_at,
    })),
    scenarioBeats: (scenarioBeats.data ?? []).map((b) => ({
      id: b.id,
      campaignId: b.campaign_id,
      order: b.beat_order,
      title: b.title,
      playerText: b.player_text,
      mjNotes: b.mj_notes,
      secrets: b.secrets,
      transition: b.transition,
      objective: b.objective,
      validated: b.validated,
    })),
    loreEntries: (loreEntries.data ?? []).map((e) => ({
      id: e.id,
      campaignId: e.campaign_id,
      kind: e.kind,
      name: e.name,
      aliases: e.aliases ?? [],
      summary: e.summary,
      mjNotes: e.mj_notes,
      secrets: e.secrets,
    })),
    graphNodes: (graphNodes.data ?? []).map((n) => ({
      id: n.id,
      campaignId: n.campaign_id,
      type: n.type,
      name: n.name,
      description: n.description,
      mjNotes: n.mj_notes,
      revealed: n.revealed,
    })),
    graphEdges: (graphEdges.data ?? []).map((e) => ({
      id: e.id,
      campaignId: e.campaign_id,
      fromId: e.from_id,
      toId: e.to_id,
      relation: e.relation,
      category: e.category,
      affinity: e.affinity,
      revealed: e.revealed,
    })),
    pdfChunks: (pdfChunks.data ?? []).map((c) => ({
      id: c.id,
      campaignId: c.campaign_id,
      text: c.text,
      index: c.index,
      audience: c.audience,
    })),
  };
}

export async function pullByCampaignId(
  admin: SupabaseClient,
  campaignId: string,
): Promise<CampaignSnapshot | null> {
  const { data: camp, error } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!camp) return null;
  return pullByJoinCode(admin, String((camp as { join_code: string }).join_code));
}

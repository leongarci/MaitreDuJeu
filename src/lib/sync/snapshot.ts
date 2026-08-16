import type {
  Campaign,
  Character,
  Encounter,
  GraphEdge,
  GraphNode,
  LoreEntry,
  Message,
  PartyGroup,
  PendingJointAction,
  PdfChunk,
  ScenarioBeat,
} from "@/lib/types";

export type CampaignSnapshot = {
  campaign: Campaign;
  characters: Character[];
  messages: Message[];
  scenarioBeats: ScenarioBeat[];
  loreEntries: LoreEntry[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  pdfChunks: PdfChunk[];
};

export function campaignToRow(c: Campaign) {
  return {
    id: c.id,
    join_code: c.joinCode || "",
    title: c.title,
    session_summary: c.sessionSummary,
    active_character_id: c.activeCharacterId,
    current_scene_asset_id: c.currentSceneAssetId,
    tts_muted: c.ttsMuted,
    pending_check: c.pendingCheck,
    acted_this_round: c.actedThisRound ?? [],
    scenario_cursor: c.scenarioCursor ?? 0,
    actions_on_beat: c.actionsOnBeat ?? 0,
    scenario_validated: Boolean(c.scenarioValidated),
    pending_dialogue: c.pendingDialogue ?? null,
    party_groups: c.partyGroups ?? [],
    active_party_group_id: c.activePartyGroupId ?? null,
    pending_joint_action: c.pendingJointAction ?? null,
    encounter: c.encounter ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export function rowToCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id),
    joinCode: String(row.join_code || ""),
    title: String(row.title || ""),
    sessionSummary: String(row.session_summary || ""),
    activeCharacterId: (row.active_character_id as string | null) ?? null,
    currentSceneAssetId: (row.current_scene_asset_id as string | null) ?? null,
    ttsMuted: Boolean(row.tts_muted),
    pendingCheck: (row.pending_check as Campaign["pendingCheck"]) ?? null,
    actedThisRound: Array.isArray(row.acted_this_round)
      ? (row.acted_this_round as string[])
      : [],
    scenarioCursor: Number(row.scenario_cursor ?? 0),
    actionsOnBeat: Number(row.actions_on_beat ?? 0),
    scenarioValidated: Boolean(row.scenario_validated),
    pendingDialogue: (row.pending_dialogue as Campaign["pendingDialogue"]) ?? null,
    partyGroups: Array.isArray(row.party_groups)
      ? (row.party_groups as PartyGroup[])
      : [],
    activePartyGroupId: (row.active_party_group_id as string | null) ?? null,
    pendingJointAction:
      (row.pending_joint_action as PendingJointAction | null) ?? null,
    encounter: (row.encounter as Encounter | null) ?? null,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

export function characterToRow(c: Character) {
  return {
    id: c.id,
    campaign_id: c.campaignId,
    name: c.name,
    attributes: c.attributes,
    hp: c.hp,
    max_hp: c.maxHp,
    inventory: c.inventory ?? [],
    party_group_id: c.partyGroupId || "",
  };
}

export function rowToCharacter(row: Record<string, unknown>): Character {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    name: String(row.name || ""),
    attributes: (row.attributes as Character["attributes"]) || {},
    hp: Number(row.hp ?? 1),
    maxHp: Number(row.max_hp ?? 1),
    inventory: Array.isArray(row.inventory) ? (row.inventory as string[]) : [],
    partyGroupId: String(row.party_group_id || ""),
  };
}

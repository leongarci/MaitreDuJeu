export type Attribute = "FOR" | "DEX" | "CON" | "INT" | "SAG" | "CHA";

export const ATTRIBUTES: Attribute[] = [
  "FOR",
  "DEX",
  "CON",
  "INT",
  "SAG",
  "CHA",
];

export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  FOR: "Force",
  DEX: "Dextérité",
  CON: "Constitution",
  INT: "Intelligence",
  SAG: "Sagesse",
  CHA: "Charisme",
};

export type Attributes = Record<Attribute, number>;

export interface Character {
  id: string;
  campaignId: string;
  name: string;
  attributes: Attributes;
  hp: number;
  maxHp: number;
  inventory: string[];
  /** Sub-party this character currently belongs to. */
  partyGroupId: string;
}

export interface PartyGroup {
  id: string;
  campaignId: string;
  label: string;
  locationHint?: string;
  activeCharacterId: string | null;
  actedThisRound: string[];
}

export interface PendingJointAction {
  leaderId: string;
  /** All participants including leader. */
  participantIds: string[];
  text: string;
  confirmedIds: string[];
  partyGroupId: string;
}

export interface PendingCheck {
  attribute: Attribute;
  dc: number;
  reason: string;
  characterId: string;
  actionContext: string;
}

export interface PendingDialogue {
  fromCharacterId: string;
  to: string;
  prompt: string;
}

export interface Campaign {
  id: string;
  title: string;
  sessionSummary: string;
  activeCharacterId: string | null;
  currentSceneAssetId: string | null;
  ttsMuted: boolean;
  pendingCheck: PendingCheck | null;
  /** Shared sync code (6 chars) for Supabase join without accounts. */
  joinCode?: string;
  /** @deprecated Prefer partyGroups[].actedThisRound — kept for sync compat. */
  actedThisRound: string[];
  /** Index of current validated scenario beat (order). */
  scenarioCursor: number;
  /** Player actions/resolutions spent on the current beat (paces auto-advance). */
  actionsOnBeat: number;
  /** Beats have been reviewed in the editor. */
  scenarioValidated: boolean;
  /** MJ asked a player what they say (social beat). */
  pendingDialogue?: PendingDialogue | null;
  partyGroups: PartyGroup[];
  activePartyGroupId: string | null;
  pendingJointAction?: PendingJointAction | null;
  createdAt: number;
  updatedAt: number;
}

export interface SpeechLine {
  speaker: string;
  text: string;
}

export interface Message {
  id: string;
  campaignId: string;
  role: "gm" | "player";
  characterId?: string;
  text: string;
  createdAt: number;
}

export type ChunkAudience = "player" | "mj" | "secret" | "general";

export interface PdfChunk {
  id: string;
  campaignId: string;
  text: string;
  index: number;
  audience: ChunkAudience;
}

/** Structured scenario beat — source of truth for the plot. */
export interface ScenarioBeat {
  id: string;
  campaignId: string;
  order: number;
  title: string;
  /** Text intended to be read / closely paraphrased to players. */
  playerText: string;
  /** GM-only staging notes. */
  mjNotes: string;
  /** Secrets not to reveal until conditions met. */
  secrets: string;
  /** When this beat can be considered done / how to reach the next. */
  transition: string;
  /** Optional goal summary for the MJ. */
  objective: string;
  validated: boolean;
}

export type GraphNodeType =
  | "lieu"
  | "pnj"
  | "objet"
  | "quete"
  | "fait"
  | "faction"
  | "pj";

export interface GraphNode {
  id: string;
  campaignId: string;
  type: GraphNodeType;
  name: string;
  description: string;
  /** MJ-only notes about this entity. */
  mjNotes?: string;
  /** Whether sensitive info in description is known to players. */
  revealed?: boolean;
}

export type GraphEdgeCategory = "social" | "spatial" | "plot" | "inventory";

export interface GraphEdge {
  id: string;
  campaignId: string;
  fromId: string;
  toId: string;
  relation: string;
  category: GraphEdgeCategory;
  /** -3 (haine) … 0 (neutre) … +3 (allié fort) */
  affinity: number;
  revealed: boolean;
}

export interface AssetMeta {
  id: string;
  campaignId: string;
  name: string;
  type: "image" | "audio";
  tags: string[];
  mimeType: string;
}

export interface Asset extends AssetMeta {
  blob: Blob;
}

export interface DiceResult {
  d20: number;
  modifier: number;
  total: number;
  attribute: Attribute;
  dc: number;
  success: boolean;
  criticalSuccess: boolean;
  criticalFailure: boolean;
}

export interface ScenarioBeatPrompt {
  order: number;
  title: string;
  playerText: string;
  mjNotes: string;
  secrets: string;
  transition: string;
  objective: string;
  isCurrent: boolean;
}

export interface GmTurnRequest {
  mode: "intro" | "action" | "resolve_check" | "relance";
  action?: string;
  activeCharacterId: string;
  campaign: Pick<
    Campaign,
    "id" | "title" | "sessionSummary" | "scenarioCursor"
  >;
  characters: Character[];
  recentMessages: Array<Pick<Message, "role" | "characterId" | "text">>;
  /** Legacy chunk fallback. */
  pdfChunks: Array<Pick<PdfChunk, "text" | "audience" | "index">>;
  /** Structured beats around the cursor. */
  scenarioBeats: ScenarioBeatPrompt[];
  /** Relevant reference entries (PNJ, lieux, créatures…) for this turn. */
  loreEntries?: LoreEntryPrompt[];
  graphNodes: Array<
    Pick<GraphNode, "id" | "type" | "name" | "description" | "mjNotes" | "revealed">
  >;
  graphEdges: Array<
    Pick<
      GraphEdge,
      "fromId" | "toId" | "relation" | "category" | "affinity" | "revealed"
    >
  >;
  assets: AssetMeta[];
  checkResult?: DiceResult & { reason: string; actionContext: string };
  waitingCharacterNames?: string[];
  actedCharacterNames?: string[];
  /** Names of PJs acting together on this turn. */
  jointParticipantNames?: string[];
  /** Other party groups currently elsewhere (isolation). */
  otherPartyGroups?: Array<{ label: string; characterNames: string[] }>;
  activePartyGroupLabel?: string;
}

export interface GmGraphUpdate {
  nodes: Array<{
    id: string;
    type: GraphNodeType;
    name: string;
    description: string;
    mjNotes?: string;
    revealed?: boolean;
  }>;
  edges: Array<{
    fromId: string;
    toId: string;
    relation: string;
    category?: GraphEdgeCategory;
    affinity?: number;
    revealed?: boolean;
  }>;
}

export interface PartySplitUpdate {
  groups: Array<{ label: string; characterNames: string[]; locationHint?: string }>;
  reason?: string;
}

export interface GmTurnResponse {
  narration: string;
  propose_check: {
    attribute: Attribute;
    dc: number;
    reason: string;
  } | null;
  update_graph: GmGraphUpdate;
  play_asset: { assetId: string } | null;
  session_summary_update: string | null;
  /** Move to next beat(s) when transition condition of current beat is met. */
  advance_scenario: number;
  /** Short spoken lines for local TTS (narrator / pnj / pj). */
  speech_lines: SpeechLine[];
  /** Ask a player what they say — only in fitting social situations. */
  ask_dialogue: PendingDialogue | null;
  /** Split or reunite the party into labeled groups. */
  party_split: PartySplitUpdate | null;
}

export type StructuredBeatDraft = {
  title: string;
  playerText: string;
  mjNotes: string;
  secrets: string;
  transition: string;
  objective: string;
};

/** Reference bible entry (PNJ, creature, place…) — not a story beat. */
export type LoreKind =
  | "pnj"
  | "creature"
  | "lieu"
  | "faction"
  | "objet"
  | "autre";

export interface LoreEntry {
  id: string;
  campaignId: string;
  kind: LoreKind;
  name: string;
  /** Alternate names / titles for matching. */
  aliases: string[];
  /** What can safely color player-facing description. */
  summary: string;
  /** GM staging / how to play this entity. */
  mjNotes: string;
  /** Spoilers — reveal only when earned. */
  secrets: string;
}

export type LoreEntryDraft = Omit<LoreEntry, "id" | "campaignId">;

export interface LoreEntryPrompt {
  kind: LoreKind;
  name: string;
  summary: string;
  mjNotes: string;
  secrets: string;
}

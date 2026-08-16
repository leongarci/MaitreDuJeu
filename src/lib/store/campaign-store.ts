"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/schema";
import {
  defaultAttributes,
  formatCheckRoll,
  resolveCheck,
  rollRandomAttributes,
  startingHp,
} from "@/lib/rules/d20";
import { playAmbientLoop, stopAmbient } from "@/lib/client/ambient";
import { speakNarration, stopTts } from "@/lib/client/tts";
import { buildLorePack } from "@/lib/rag/retrieve";
import { beatsForPrompt } from "@/lib/scenario/beats";
import { gateAdvance } from "@/lib/scenario/advance";
import {
  isPlayerQuestionToGm,
  isRiskyWeAction,
  isVaguePlayerAction,
  RISKY_WE_HINT,
  VAGUE_ACTION_HINT,
} from "@/lib/gm/action-guard";
import { humanizeDialogueTo } from "@/lib/gm/dialogue-target";
import { retrieveLoreEntries, toLorePrompts } from "@/lib/lore/retrieve";
import { tableMessages } from "@/lib/messages";
import {
  advanceTurn,
  applyCombatantPatch,
  buildEncounter,
  currentCombatant,
  encounterSummaryForPrompt,
  endIfResolved,
  formatAttackLine,
  isOffensiveAction,
  living,
  pickHostileTarget,
  resolveAttack,
  syncPcCombatants,
} from "@/lib/combat/engine";
import {
  ambientStylePrompt,
  DEFAULT_ART_STYLE,
  inferArtStyle,
  isArtStyleId,
  styleTag,
  type ArtStyleId,
} from "@/lib/scene/art-style";
import {
  AMBIENT_TAG,
  buildAmbientPrompt,
  buildScenePrompt,
  findGeneratedAmbient,
  findGeneratedScene,
  GENERATED_TAG,
  isGeneratedAsset,
  locationTag,
  normalizeLocationKey,
  sceneSeed,
} from "@/lib/scene/location-image";
import { generateJoinCode } from "@/lib/sync/codes";
import {
  ensureSyncSchema,
  syncJoin,
  syncPull,
  syncPush,
} from "@/lib/sync/client";
import type { CampaignSnapshot } from "@/lib/sync/snapshot";
import {
  advanceTurnInGroup,
  applyPartySplit,
  createDefaultPartyGroup,
  ensurePartyState,
  groupMembers,
  isCharacterDown,
  markActedInGroup,
  mergeAllGroups,
  resetGroupRound,
  splitPartyManually,
} from "@/lib/party/groups";
import type {
  Asset,
  AssetMeta,
  AttackResult,
  Attributes,
  Campaign,
  Character,
  DiceResult,
  GmTurnRequest,
  GmTurnResponse,
  GraphEdge,
  GraphNode,
  GmOocRequest,
  GmOocResponse,
  HpUpdate,
  InventoryUpdate,
  LoreEntry,
  LoreEntryDraft,
  Message,
  PdfChunk,
  PendingCheck,
  PendingJointAction,
  ScenarioBeat,
  StructuredBeatDraft,
} from "@/lib/types";

interface CampaignState {
  ready: boolean;
  campaigns: Campaign[];
  campaign: Campaign | null;
  characters: Character[];
  messages: Message[];
  pdfChunks: PdfChunk[];
  scenarioBeats: ScenarioBeat[];
  loreEntries: LoreEntry[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  assets: Asset[];
  busy: boolean;
  oocBusy: boolean;
  error: string | null;
  sceneUrl: string | null;
  sceneGenerating: boolean;
  syncStatus: string | null;

  initHome: () => Promise<void>;
  loadCampaign: (id: string) => Promise<void>;
  createCampaign: (title: string) => Promise<string>;
  joinCampaign: (joinCode: string) => Promise<string | null>;
  pushCampaignSync: () => Promise<void>;
  pullCampaignSync: () => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  setActiveCharacter: (characterId: string) => Promise<void>;
  setTtsMuted: (muted: boolean) => Promise<void>;
  clearPendingDialogue: () => Promise<void>;
  addCharacter: (input: {
    name: string;
    mode: "manual" | "random";
    attributes?: Attributes;
  }) => Promise<void>;
  updateCharacter: (
    id: string,
    patch: Partial<Pick<Character, "name" | "attributes" | "hp" | "maxHp" | "inventory">>,
  ) => Promise<void>;
  ingestPdf: (file: File) => Promise<number>;
  /** Re-run Gemini structuring on already imported PDF chunks (replaces beats). */
  restructureScenario: () => Promise<number>;
  /** Extract PNJ / créatures / lieux bible from PDF chunks. */
  extractLore: () => Promise<number>;
  importAsset: (file: File, tags: string[]) => Promise<void>;
  saveBeats: (beats: ScenarioBeat[]) => Promise<void>;
  upsertBeat: (beat: ScenarioBeat) => Promise<void>;
  deleteBeat: (id: string) => Promise<void>;
  setScenarioCursor: (order: number) => Promise<void>;
  validateScenario: () => Promise<void>;
  clearPendingCheck: () => Promise<void>;
  startIntro: () => Promise<void>;
  runRelance: () => Promise<void>;
  startNewRound: () => Promise<void>;
  sendAction: (
    text: string,
    opts?: { withCharacterIds?: string[]; targetCombatantId?: string },
  ) => Promise<void>;
  sendOoc: (text: string) => Promise<void>;
  confirmJointAction: () => Promise<void>;
  declineJointAction: () => Promise<void>;
  setActivePartyGroup: (groupId: string) => Promise<void>;
  splitParty: (
    movingIds: string[],
    label: string,
    locationHint?: string,
  ) => Promise<void>;
  mergeParty: () => Promise<void>;
  resolvePendingCheck: (mode: "auto" | "manual", forcedD20?: number) => Promise<void>;
}

function touch(campaign: Campaign): Campaign {
  return { ...campaign, updatedAt: Date.now() };
}

function revoke(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function normalizeCampaign(campaign: Campaign): Campaign {
  return {
    ...campaign,
    joinCode: campaign.joinCode || "",
    actedThisRound: Array.isArray(campaign.actedThisRound)
      ? campaign.actedThisRound
      : [],
    scenarioCursor:
      typeof campaign.scenarioCursor === "number" ? campaign.scenarioCursor : 0,
    actionsOnBeat:
      typeof campaign.actionsOnBeat === "number" && campaign.actionsOnBeat >= 0
        ? campaign.actionsOnBeat
        : 0,
    scenarioValidated: Boolean(campaign.scenarioValidated),
    pendingDialogue: campaign.pendingDialogue ?? null,
    partyGroups: Array.isArray(campaign.partyGroups) ? campaign.partyGroups : [],
    activePartyGroupId: campaign.activePartyGroupId ?? null,
    pendingJointAction: campaign.pendingJointAction ?? null,
    encounter: campaign.encounter ?? null,
    artStyle: campaign.artStyle || "",
  };
}

function normalizeCharacter(c: Character, fallbackGroupId = ""): Character {
  return {
    ...c,
    inventory: Array.isArray(c.inventory) ? c.inventory : [],
    partyGroupId: c.partyGroupId || fallbackGroupId,
  };
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let sceneGenSeq = 0;
let syncChain: Promise<void> = Promise.resolve();

function scheduleSync(get: () => CampaignState) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void get().pushCampaignSync();
  }, 1200);
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (!row?.id) continue;
    map.set(row.id, row);
  }
  return Array.from(map.values());
}

function buildSnapshot(state: CampaignState): CampaignSnapshot | null {
  if (!state.campaign) return null;
  return {
    campaign: normalizeCampaign(state.campaign),
    characters: dedupeById(state.characters),
    messages: dedupeById(state.messages),
    scenarioBeats: dedupeById(state.scenarioBeats),
    loreEntries: dedupeById(state.loreEntries),
    graphNodes: dedupeById(state.graphNodes),
    graphEdges: dedupeById(state.graphEdges),
    pdfChunks: dedupeById(state.pdfChunks),
  };
}

async function applySnapshotLocal(
  snap: CampaignSnapshot,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
) {
  const id = snap.campaign.id;
  await Promise.all([
    db.characters.where("campaignId").equals(id).delete(),
    db.messages.where("campaignId").equals(id).delete(),
    db.pdfChunks.where("campaignId").equals(id).delete(),
    db.scenarioBeats.where("campaignId").equals(id).delete(),
    db.loreEntries.where("campaignId").equals(id).delete(),
    db.graphNodes.where("campaignId").equals(id).delete(),
    db.graphEdges.where("campaignId").equals(id).delete(),
  ]);
  await db.campaigns.put(normalizeCampaign(snap.campaign));
  if (snap.characters.length) await db.characters.bulkPut(snap.characters);
  if (snap.messages.length) await db.messages.bulkPut(snap.messages);
  if (snap.pdfChunks.length) await db.pdfChunks.bulkPut(snap.pdfChunks);
  if (snap.scenarioBeats.length) await db.scenarioBeats.bulkPut(snap.scenarioBeats);
  if (snap.loreEntries.length) await db.loreEntries.bulkPut(snap.loreEntries);
  if (snap.graphNodes.length) await db.graphNodes.bulkPut(snap.graphNodes);
  if (snap.graphEdges.length) await db.graphEdges.bulkPut(snap.graphEdges);

  const ensured = ensurePartyState(
    normalizeCampaign(snap.campaign),
    snap.characters.map((c) => normalizeCharacter(c)),
  );
  set({
    campaign: ensured.campaign,
    characters: ensured.characters,
    messages: snap.messages,
    pdfChunks: snap.pdfChunks,
    scenarioBeats: snap.scenarioBeats,
    loreEntries: snap.loreEntries,
    graphNodes: snap.graphNodes.map(normalizeNode),
    graphEdges: snap.graphEdges.map(normalizeEdge),
  });
}

function normalizeEdge(edge: GraphEdge): GraphEdge {
  return {
    ...edge,
    category: edge.category ?? "social",
    affinity: typeof edge.affinity === "number" ? edge.affinity : 0,
    revealed: edge.revealed !== false,
  };
}

function normalizeNode(node: GraphNode): GraphNode {
  return {
    ...node,
    mjNotes: node.mjNotes ?? "",
    revealed: node.revealed !== false,
  };
}

function roundMeta(characters: Character[], actedIds: string[]) {
  const acted = new Set(actedIds);
  return {
    actedCharacterNames: characters
      .filter((c) => acted.has(c.id))
      .map((c) => c.name),
    waitingCharacterNames: characters
      .filter((c) => !acted.has(c.id))
      .map((c) => c.name),
  };
}

function mapLore(chunks: PdfChunk[]) {
  return chunks.map((c) => ({
    text: c.text,
    audience: c.audience ?? "general",
    index: c.index,
  }));
}

function pickLoreForTurn(
  entries: LoreEntry[],
  query: string,
  graphNodes: GraphNode[],
  beats: ScenarioBeat[],
  cursor: number,
) {
  const beat =
    beats.find((b) => b.order === cursor) || beats[0] || null;
  const beatText = beat
    ? `${beat.title} ${beat.playerText} ${beat.mjNotes} ${beat.objective}`
    : "";
  const boostNames = [
    ...graphNodes.map((n) => n.name),
    ...(beat ? [beat.title] : []),
  ];
  return toLorePrompts(
    retrieveLoreEntries(entries, `${query} ${beatText}`, {
      boostNames,
      topK: 8,
    }),
  );
}

function campaignPayload(campaign: Campaign) {
  const c = normalizeCampaign(campaign);
  return {
    id: c.id,
    title: c.title,
    sessionSummary: c.sessionSummary,
    scenarioCursor: c.scenarioCursor,
  };
}

function graphPayload(nodes: GraphNode[], edges: GraphEdge[]) {
  return {
    graphNodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      description: n.description,
      mjNotes: n.mjNotes,
      revealed: n.revealed,
    })),
    graphEdges: edges.map((e) => ({
      fromId: e.fromId,
      toId: e.toId,
      relation: e.relation,
      category: e.category ?? "social",
      affinity: e.affinity ?? 0,
      revealed: e.revealed !== false,
    })),
  };
}

function hereNowPayload(
  campaign: Campaign,
  characters: Character[],
  messages: Message[],
  scenarioBeats: ScenarioBeat[],
) {
  const group = campaign.partyGroups.find(
    (g) => g.id === campaign.activePartyGroupId,
  );
  const beat =
    scenarioBeats.find((b) => b.order === campaign.scenarioCursor) ||
    scenarioBeats[0];
  const lastGm = [...messages].reverse().find((m) => m.role === "gm");
  return {
    locationHint: group?.locationHint || "",
    beatTitle: beat?.title || "",
    lastGmNarration: lastGm?.text?.slice(0, 400) || "",
    presentNames: groupMembers(characters, campaign.activePartyGroupId).map(
      (c) => c.name,
    ),
  };
}

function recentTableForPrompt(messages: Message[], take: number) {
  return tableMessages(messages)
    .slice(-take)
    .map((m) => ({
      role: m.role,
      characterId: m.characterId,
      text: m.text,
    }));
}

function applyHpUpdates(
  characters: Character[],
  updates: HpUpdate[],
): Character[] {
  if (!updates.length) return characters;
  return characters.map((c) => {
    const matched = updates.filter(
      (u) =>
        (u.characterId && u.characterId === c.id) ||
        (u.characterName &&
          u.characterName.trim().toLowerCase() === c.name.trim().toLowerCase()),
    );
    if (!matched.length) return c;
    let hp = c.hp;
    for (const u of matched) {
      if (typeof u.hp === "number") hp = u.hp;
      else if (typeof u.delta === "number") hp = hp + u.delta;
    }
    return { ...c, hp: Math.max(0, Math.min(c.maxHp, hp)) };
  });
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  ready: false,
  campaigns: [],
  campaign: null,
  characters: [],
  messages: [],
  pdfChunks: [],
  scenarioBeats: [],
  loreEntries: [],
  graphNodes: [],
  graphEdges: [],
  assets: [],
  busy: false,
  oocBusy: false,
  error: null,
  sceneUrl: null,
  sceneGenerating: false,
  syncStatus: null,

  initHome: async () => {
    void ensureSyncSchema();
    const campaigns = await db.campaigns.orderBy("updatedAt").reverse().toArray();
    set({ campaigns: campaigns.map(normalizeCampaign), ready: true });
  },

  loadCampaign: async (id) => {
    const campaign = await db.campaigns.get(id);
    if (!campaign) {
      set({ error: "Partie introuvable", campaign: null });
      return;
    }
    let normalized = normalizeCampaign(campaign);
    if (!normalized.joinCode) {
      normalized = touch({ ...normalized, joinCode: generateJoinCode() });
      await db.campaigns.put(normalized);
    }
    const [
      characters,
      messages,
      pdfChunks,
      scenarioBeats,
      loreEntries,
      graphNodes,
      graphEdges,
      assets,
    ] = await Promise.all([
      db.characters.where("campaignId").equals(id).toArray(),
      db.messages.where("campaignId").equals(id).sortBy("createdAt"),
      db.pdfChunks.where("campaignId").equals(id).sortBy("index"),
      db.scenarioBeats.where("campaignId").equals(id).sortBy("order"),
      db.loreEntries.where("campaignId").equals(id).toArray(),
      db.graphNodes.where("campaignId").equals(id).toArray(),
      db.graphEdges.where("campaignId").equals(id).toArray(),
      db.assets.where("campaignId").equals(id).toArray(),
    ]);

    const prev = get();
    revoke(prev.sceneUrl);
    stopTts();
    stopAmbient();
    sceneGenSeq += 1;

    let sceneUrl: string | null = null;
    if (normalized.currentSceneAssetId) {
      const asset = assets.find((a) => a.id === normalized.currentSceneAssetId);
      if (asset?.type === "image") sceneUrl = URL.createObjectURL(asset.blob);
    }

    const ensured = ensurePartyState(
      normalized,
      characters.map((c) => normalizeCharacter(c)),
    );
    await db.campaigns.put(ensured.campaign);
    for (const ch of ensured.characters) await db.characters.put(ch);

    set({
      campaign: ensured.campaign,
      characters: ensured.characters,
      messages,
      pdfChunks: pdfChunks.map((c) => ({
        ...c,
        audience: c.audience ?? "general",
      })),
      scenarioBeats,
      loreEntries,
      graphNodes: dedupeById(graphNodes.map(normalizeNode)),
      graphEdges: dedupeById(graphEdges.map(normalizeEdge)),
      assets,
      sceneUrl,
      sceneGenerating: false,
      error: null,
      ready: true,
    });
  },

  createCampaign: async (title) => {
    const now = Date.now();
    const id = nanoid();
    const group = createDefaultPartyGroup(id);
    const campaign: Campaign = {
      id,
      title: title.trim() || "Nouvelle aventure",
      sessionSummary: "",
      activeCharacterId: null,
      currentSceneAssetId: null,
      ttsMuted: false,
      pendingCheck: null,
      pendingDialogue: null,
      joinCode: generateJoinCode(),
      actedThisRound: [],
      scenarioCursor: 0,
      actionsOnBeat: 0,
      scenarioValidated: false,
      partyGroups: [group],
      activePartyGroupId: group.id,
      pendingJointAction: null,
      encounter: null,
      artStyle: inferArtStyle(title),
      createdAt: now,
      updatedAt: now,
    };
    await db.campaigns.add(campaign);
    await get().initHome();
    set({ campaign });
    scheduleSync(get);
    return campaign.id;
  },

  joinCampaign: async (joinCode) => {
    set({ busy: true, error: null, syncStatus: "Connexion…" });
    const { snapshot, error } = await syncJoin(joinCode);
    if (!snapshot || error) {
      set({ busy: false, error: error || "Code invalide", syncStatus: null });
      return null;
    }
    await applySnapshotLocal(snapshot, set);
    await get().initHome();
    set({ busy: false, syncStatus: `Synchronisé · code ${snapshot.campaign.joinCode}` });
    return snapshot.campaign.id;
  },

  pushCampaignSync: async () => {
    const run = async () => {
      const snap = buildSnapshot(get());
      if (!snap?.campaign.joinCode) return;
      set({ syncStatus: "Envoi…" });
      const res = await syncPush(snap);
      set({
        syncStatus: res.ok
          ? `Sync OK · ${snap.campaign.joinCode}`
          : res.error || "Échec sync",
      });
    };
    const next = syncChain.then(run, run);
    syncChain = next.then(
      () => undefined,
      () => undefined,
    );
    await next;
  },

  pullCampaignSync: async () => {
    const state = get();
    const { campaign } = state;
    if (!campaign?.joinCode && !campaign?.id) return;
    // Never clobber an in-flight turn (causes empty chat / fake "intro" flash).
    if (state.busy) return;

    set({ syncStatus: "Réception…" });
    const { snapshot, error } = await syncPull({
      joinCode: campaign.joinCode,
      campaignId: campaign.id,
    });
    if (!snapshot || error) {
      set({ syncStatus: error || "Échec pull" });
      return;
    }

    const localUpdated = campaign.updatedAt || 0;
    const remoteUpdated = snapshot.campaign.updatedAt || 0;
    const localMsgs = get().messages.length;
    const remoteMsgs = snapshot.messages.length;

    if (remoteUpdated < localUpdated || remoteMsgs < localMsgs) {
      set({ syncStatus: "Local plus récent — push…" });
      await get().pushCampaignSync();
      return;
    }
    // Same timestamp + same/fewer messages: keep local (avoids wipe races).
    if (remoteUpdated === localUpdated && remoteMsgs <= localMsgs) {
      set({ syncStatus: `À jour · ${snapshot.campaign.joinCode}` });
      return;
    }

    await applySnapshotLocal(snapshot, set);
    set({ syncStatus: `À jour · ${snapshot.campaign.joinCode}` });
  },

  clearPendingDialogue: async () => {
    const { campaign } = get();
    if (!campaign) return;
    const next = touch({ ...normalizeCampaign(campaign), pendingDialogue: null });
    await db.campaigns.put(next);
    set({ campaign: next });
    scheduleSync(get);
  },

  deleteCampaign: async (id) => {
    if (get().campaign?.id === id) {
      stopTts();
      stopAmbient();
    }
    await Promise.all([
      db.campaigns.delete(id),
      db.characters.where("campaignId").equals(id).delete(),
      db.messages.where("campaignId").equals(id).delete(),
      db.pdfChunks.where("campaignId").equals(id).delete(),
      db.scenarioBeats.where("campaignId").equals(id).delete(),
      db.loreEntries.where("campaignId").equals(id).delete(),
      db.graphNodes.where("campaignId").equals(id).delete(),
      db.graphEdges.where("campaignId").equals(id).delete(),
      db.assets.where("campaignId").equals(id).delete(),
    ]);
    await get().initHome();
  },

  setActiveCharacter: async (characterId) => {
    const { campaign, characters } = get();
    if (!campaign) return;
    const ch = characters.find((c) => c.id === characterId);
    if (!ch) return;
    const groupId = ch.partyGroupId || campaign.activePartyGroupId;
    const groups = (campaign.partyGroups ?? []).map((g) =>
      g.id === groupId ? { ...g, activeCharacterId: characterId } : g,
    );
    const next = touch({
      ...normalizeCampaign(campaign),
      partyGroups: groups,
      activePartyGroupId: groupId,
      activeCharacterId: characterId,
    });
    await db.campaigns.put(next);
    set({ campaign: next });
    scheduleSync(get);
  },

  setTtsMuted: async (muted) => {
    const { campaign } = get();
    if (!campaign) return;
    if (muted) {
      stopTts();
      stopAmbient();
    }
    const next = touch({ ...campaign, ttsMuted: muted });
    await db.campaigns.put(next);
    set({ campaign: next });
  },

  addCharacter: async ({ name, mode, attributes }) => {
    const { campaign, characters } = get();
    if (!campaign) return;
    const ensured = ensurePartyState(normalizeCampaign(campaign), characters);
    const groupId =
      ensured.campaign.activePartyGroupId ||
      ensured.campaign.partyGroups[0]?.id ||
      createDefaultPartyGroup(campaign.id).id;
    const trimmedName = name.trim();
    if (!trimmedName) {
      set({ error: "Donne un nom au personnage." });
      return;
    }
    const attrs =
      mode === "random" ? rollRandomAttributes() : (attributes ?? defaultAttributes());
    const hp = Math.max(1, startingHp(attrs.CON));
    const character: Character = {
      id: nanoid(),
      campaignId: campaign.id,
      name: trimmedName,
      attributes: attrs,
      hp,
      maxHp: hp,
      inventory: [],
      partyGroupId: groupId,
    };
    await db.characters.add(character);
    const pjNode: GraphNode = {
      id: `pj_${character.id}`,
      campaignId: campaign.id,
      type: "pj",
      name: character.name,
      description: `Personnage joueur — PV ${character.hp}/${character.maxHp}`,
      mjNotes: "",
      revealed: true,
    };
    await db.graphNodes.put(pjNode);
    const nextChars = [...ensured.characters, character];
    const nextCampaign = touch({
      ...ensured.campaign,
      activeCharacterId: ensured.campaign.activeCharacterId ?? character.id,
      partyGroups: ensured.campaign.partyGroups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              activeCharacterId: g.activeCharacterId ?? character.id,
            }
          : g,
      ),
    });
    await db.campaigns.put(nextCampaign);
    set({
      characters: nextChars,
      campaign: nextCampaign,
      graphNodes: [...get().graphNodes.filter((n) => n.id !== pjNode.id), pjNode],
    });
    scheduleSync(get);
  },

  updateCharacter: async (id, patch) => {
    const { characters } = get();
    const existing = characters.find((c) => c.id === id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    await db.characters.put(updated);
    set({
      characters: characters.map((c) => (c.id === id ? updated : c)),
    });
  },

  ingestPdf: async (file) => {
    const { campaign } = get();
    if (!campaign) return 0;
    set({ busy: true, error: null });
    try {
      // Extract in the browser first — Vercel serverless often fails on PDF workers / size limits.
      let chunks: Array<{ text: string; audience?: PdfChunk["audience"] }> | null =
        null;
      try {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await getDocumentProxy(data);
        const extracted = await extractText(pdf, { mergePages: true });
        const fullText = (
          Array.isArray(extracted.text)
            ? extracted.text.join("\n\n")
            : extracted.text || ""
        ).trim();
        if (!fullText) throw new Error("Aucun texte extractible dans ce PDF");
        const { classifyScenarioText } = await import("@/lib/rag/classify");
        chunks = classifyScenarioText(fullText);
      } catch (clientErr) {
        console.warn("pdf client extract failed, trying API", clientErr);
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/pdf-ingest", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            err.error ||
              (clientErr instanceof Error
                ? clientErr.message
                : "Échec lecture PDF"),
          );
        }
        const data = (await res.json()) as {
          chunks: Array<
            string | { text: string; audience?: PdfChunk["audience"] }
          >;
        };
        chunks = data.chunks.map((item) =>
          typeof item === "string"
            ? { text: item, audience: "general" as const }
            : item,
        );
      }

      if (!chunks?.length) {
        throw new Error("Aucun texte extractible dans ce PDF");
      }

      await db.pdfChunks.where("campaignId").equals(campaign.id).delete();
      const rows: PdfChunk[] = chunks.map((item, index) => ({
        id: nanoid(),
        campaignId: campaign.id,
        text: item.text,
        index,
        audience: item.audience ?? "general",
      }));
      await db.pdfChunks.bulkAdd(rows);

      set({ pdfChunks: rows });
      const beatCount = await get().restructureScenario();
      return beatCount || rows.length;
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Erreur PDF",
      });
      return 0;
    }
  },

  restructureScenario: async () => {
    const { campaign, pdfChunks } = get();
    if (!campaign) return 0;
    if (pdfChunks.length === 0) {
      set({ error: "Aucun PDF importé — importe d’abord un scénario." });
      return 0;
    }
    set({ busy: true, error: null });
    try {
      const fullText = pdfChunks.map((r) => r.text).join("\n\n");
      const structRes = await fetch("/api/structure-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: campaign.title, text: fullText }),
      });
      if (!structRes.ok) {
        const err = await structRes.json().catch(() => ({}));
        throw new Error(err.error || "Échec structuration");
      }
      const structData = (await structRes.json()) as {
        beats?: StructuredBeatDraft[];
        warning?: string;
        beatCount?: number;
      };
      await db.scenarioBeats.where("campaignId").equals(campaign.id).delete();
      const beatRows: ScenarioBeat[] = (structData.beats ?? []).map(
        (b, order) => ({
          id: nanoid(),
          campaignId: campaign.id,
          order,
          title: b.title,
          playerText: b.playerText,
          mjNotes: b.mjNotes,
          secrets: b.secrets,
          transition: b.transition,
          objective: b.objective,
          validated: false,
        }),
      );
      if (beatRows.length) await db.scenarioBeats.bulkAdd(beatRows);

      const next = touch({
        ...normalizeCampaign(campaign),
        scenarioCursor: 0,
        actionsOnBeat: 0,
        scenarioValidated: false,
      });
      await db.campaigns.put(next);
      set({
        scenarioBeats: beatRows,
        campaign: next,
        error: structData.warning ?? null,
      });

      // Also refresh reference bible (PNJ, lieux, créatures…).
      const loreCount = await get().extractLore();
      if (get().busy) set({ busy: false });
      return beatRows.length || loreCount;
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Erreur structuration",
      });
      return 0;
    }
  },

  extractLore: async () => {
    const { campaign, pdfChunks } = get();
    if (!campaign) return 0;
    if (pdfChunks.length === 0) {
      set({ error: "Aucun PDF importé — importe d’abord un scénario." });
      return 0;
    }
    const alreadyBusy = get().busy;
    if (!alreadyBusy) set({ busy: true, error: null });
    try {
      const fullText = pdfChunks.map((r) => r.text).join("\n\n");
      const res = await fetch("/api/extract-lore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: campaign.title, text: fullText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Échec extraction références");
      }
      const data = (await res.json()) as {
        entries?: LoreEntryDraft[];
        warning?: string;
      };
      await db.loreEntries.where("campaignId").equals(campaign.id).delete();
      const rows: LoreEntry[] = (data.entries ?? []).map((e) => ({
        id: nanoid(),
        campaignId: campaign.id,
        kind: e.kind,
        name: e.name,
        aliases: e.aliases ?? [],
        summary: e.summary ?? "",
        mjNotes: e.mjNotes ?? "",
        secrets: e.secrets ?? "",
      }));
      if (rows.length) await db.loreEntries.bulkAdd(rows);
      set({
        loreEntries: rows,
        busy: false,
        error: data.warning ?? get().error,
      });
      return rows.length;
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Erreur extraction lore",
      });
      return 0;
    }
  },

  saveBeats: async (beats) => {
    const { campaign } = get();
    if (!campaign) return;
    await db.scenarioBeats.where("campaignId").equals(campaign.id).delete();
    const ordered = beats
      .map((b, order) => ({ ...b, campaignId: campaign.id, order }))
      .sort((a, b) => a.order - b.order);
    if (ordered.length) await db.scenarioBeats.bulkAdd(ordered);
    const next = touch({
      ...normalizeCampaign(campaign),
      scenarioValidated: false,
      scenarioCursor: Math.min(
        normalizeCampaign(campaign).scenarioCursor,
        Math.max(0, ordered.length - 1),
      ),
    });
    await db.campaigns.put(next);
    set({ scenarioBeats: ordered, campaign: next });
  },

  upsertBeat: async (beat) => {
    await db.scenarioBeats.put(beat);
    const list = await db.scenarioBeats
      .where("campaignId")
      .equals(beat.campaignId)
      .sortBy("order");
    set({ scenarioBeats: list });
  },

  deleteBeat: async (id) => {
    const { campaign } = get();
    if (!campaign) return;
    await db.scenarioBeats.delete(id);
    const remaining = await db.scenarioBeats
      .where("campaignId")
      .equals(campaign.id)
      .sortBy("order");
    const reindexed = remaining.map((b, order) => ({ ...b, order }));
    await db.transaction("rw", db.scenarioBeats, async () => {
      await db.scenarioBeats.where("campaignId").equals(campaign.id).delete();
      if (reindexed.length) await db.scenarioBeats.bulkAdd(reindexed);
    });
    set({ scenarioBeats: reindexed });
  },

  setScenarioCursor: async (order) => {
    const { campaign, scenarioBeats } = get();
    if (!campaign) return;
    const max = Math.max(0, scenarioBeats.length - 1);
    const next = touch({
      ...normalizeCampaign(campaign),
      scenarioCursor: Math.min(max, Math.max(0, order)),
      actionsOnBeat: 0,
    });
    await db.campaigns.put(next);
    set({ campaign: next });
    scheduleSync(get);
  },

  validateScenario: async () => {
    const { campaign, scenarioBeats } = get();
    if (!campaign) return;
    const validated = scenarioBeats.map((b, order) => ({
      ...b,
      order,
      campaignId: campaign.id,
      validated: true,
    }));
    await db.scenarioBeats.where("campaignId").equals(campaign.id).delete();
    if (validated.length) await db.scenarioBeats.bulkAdd(validated);
    const next = touch({
      ...normalizeCampaign(campaign),
      scenarioValidated: true,
      scenarioCursor: 0,
      actionsOnBeat: 0,
    });
    await db.campaigns.put(next);
    set({ campaign: next, scenarioBeats: validated });
  },

  importAsset: async (file, tags) => {
    const { campaign, assets } = get();
    if (!campaign) return;
    const type: Asset["type"] = file.type.startsWith("audio")
      ? "audio"
      : "image";
    const asset: Asset = {
      id: nanoid(),
      campaignId: campaign.id,
      name: file.name.replace(/\.[^.]+$/, ""),
      type,
      tags: tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
      mimeType: file.type || (type === "audio" ? "audio/mpeg" : "image/jpeg"),
      blob: file,
    };
    await db.assets.add(asset);
    const next = touch(campaign);
    await db.campaigns.put(next);
    set({ assets: [...assets, asset], campaign: next });
  },

  clearPendingCheck: async () => {
    const { campaign } = get();
    if (!campaign) return;
    const next = touch({ ...campaign, pendingCheck: null });
    await db.campaigns.put(next);
    set({ campaign: next });
  },

  startIntro: async () => {
    const state = get();
    const {
      campaign,
      characters,
      messages,
      pdfChunks,
      loreEntries,
      scenarioBeats,
      graphNodes,
      graphEdges,
      assets,
    } = state;
    if (!campaign || state.busy || tableMessages(messages).length > 0) return;

    const activeId = campaign.activeCharacterId ?? characters[0]?.id;
    if (!activeId) {
      set({ error: "Ajoutez au moins un personnage avant de commencer." });
      return;
    }

    set({ busy: true, error: null });
    try {
      if (!campaign.activeCharacterId) {
        const withActive = touch({ ...campaign, activeCharacterId: activeId });
        await db.campaigns.put(withActive);
        set({ campaign: withActive });
      }

      const query = `${campaign.title} introduction début aventure personnages prologue`;
      const lore = buildLorePack(pdfChunks, query, {
        cursor: 0,
        windowBefore: 0,
        windowAfter: 10,
        relevantCount: 8,
      });
      const cursor = normalizeCampaign(campaign).scenarioCursor;
      const assetMeta: AssetMeta[] = assets.map(({ blob: _b, ...meta }) => meta);
      const body: GmTurnRequest = {
        mode: "intro",
        activeCharacterId: activeId,
        campaign: campaignPayload(campaign),
        characters,
        recentMessages: [],
        pdfChunks: mapLore(lore),
        scenarioBeats: beatsForPrompt(scenarioBeats, cursor, 1),
        loreEntries: pickLoreForTurn(
          loreEntries,
          query,
          graphNodes,
          scenarioBeats,
          cursor,
        ),
        ...graphPayload(graphNodes, graphEdges),
        assets: assetMeta,
        ...roundMeta(characters, []),
        hereNow: hereNowPayload(campaign, characters, messages, scenarioBeats),
        encounterSummary: encounterSummaryForPrompt(campaign.encounter),
      };

      const res = await fetch("/api/gm-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Le MJ ne répond pas");
      }
      const gm = (await res.json()) as GmTurnResponse;
      await applyGmResponse(gm, "Début de l'aventure", activeId, get, set);
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Erreur d'introduction",
      });
    }
  },

  runRelance: async () => {
    const state = get();
    const {
      campaign,
      characters,
      messages,
      pdfChunks,
      loreEntries,
      scenarioBeats,
      graphNodes,
      graphEdges,
      assets,
    } = state;
    if (!campaign || state.busy || campaign.pendingCheck) return;
    if (characters.length === 0) return;

    const activeId = campaign.activeCharacterId ?? characters[0]!.id;
    set({ busy: true, error: null });

    try {
      const ensured = ensurePartyState(normalizeCampaign(campaign), characters);
      let clearedRound = resetGroupRound(ensured.campaign, ensured.characters);
      clearedRound = touch(advanceTurnInGroup(clearedRound, ensured.characters));
      await db.campaigns.put(clearedRound);
      set({ campaign: clearedRound, characters: ensured.characters });

      const query = `${campaign.title} ${campaign.sessionSummary} suite événements conséquences`;
      const cursor = clearedRound.scenarioCursor;
      const meta = partyTurnMeta(clearedRound, ensured.characters);
      const lore = buildLorePack(pdfChunks, query, {
        cursor,
        windowBefore: 1,
        windowAfter: 3,
        relevantCount: 5,
      });
      const assetMeta: AssetMeta[] = assets.map(({ blob: _b, ...meta }) => meta);
      const body: GmTurnRequest = {
        mode: "relance",
        activeCharacterId: activeId,
        campaign: campaignPayload(clearedRound),
        characters: meta.charactersForPrompt,
        recentMessages: recentTableForPrompt(messages, 16),
        pdfChunks: mapLore(lore),
        scenarioBeats: beatsForPrompt(scenarioBeats, cursor, 1),
        loreEntries: pickLoreForTurn(
          loreEntries,
          query,
          graphNodes,
          scenarioBeats,
          cursor,
        ),
        ...graphPayload(graphNodes, graphEdges),
        assets: assetMeta,
        actedCharacterNames: meta.actedCharacterNames,
        waitingCharacterNames: meta.waitingCharacterNames,
        activePartyGroupLabel: meta.activePartyGroupLabel,
        otherPartyGroups: meta.otherPartyGroups,
        hereNow: hereNowPayload(
          clearedRound,
          ensured.characters,
          messages,
          scenarioBeats,
        ),
        encounterSummary: encounterSummaryForPrompt(clearedRound.encounter),
      };

      const res = await fetch("/api/gm-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Le MJ ne répond pas");
      }
      const gm = (await res.json()) as GmTurnResponse;
      await applyGmResponse(gm, "Relance de scène", activeId, get, set, {
        skipActedTracking: true,
      });
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Erreur de relance",
      });
    }
  },

  startNewRound: async () => {
    const { campaign, characters } = get();
    if (!campaign) return;
    const ensured = ensurePartyState(normalizeCampaign(campaign), characters);
    let next = resetGroupRound(ensured.campaign, ensured.characters);
    next = advanceTurnInGroup(next, ensured.characters);
    next = touch(next);
    await db.campaigns.put(next);
    set({ campaign: next, error: null });
    scheduleSync(get);
  },

  setActivePartyGroup: async (groupId) => {
    const { campaign, characters } = get();
    if (!campaign) return;
    const ensured = ensurePartyState(normalizeCampaign(campaign), characters);
    const group = ensured.campaign.partyGroups.find((g) => g.id === groupId);
    if (!group) return;
    const members = groupMembers(ensured.characters, groupId);
    const activeId =
      group.activeCharacterId &&
      members.some((c) => c.id === group.activeCharacterId)
        ? group.activeCharacterId
        : members.find((c) => !group.actedThisRound.includes(c.id))?.id ||
          members[0]?.id ||
          null;
    const next = touch({
      ...ensured.campaign,
      activePartyGroupId: groupId,
      activeCharacterId: activeId,
      actedThisRound: group.actedThisRound,
      partyGroups: ensured.campaign.partyGroups.map((g) =>
        g.id === groupId ? { ...g, activeCharacterId: activeId } : g,
      ),
    });
    await db.campaigns.put(next);
    set({ campaign: next });
    scheduleSync(get);
  },

  splitParty: async (movingIds, label, locationHint) => {
    const { campaign, characters } = get();
    if (!campaign) return;
    const ensured = ensurePartyState(normalizeCampaign(campaign), characters);
    const result = splitPartyManually(
      ensured.campaign,
      ensured.characters,
      movingIds,
      label,
      locationHint,
    );
    if (result.campaign.partyGroups.length === ensured.campaign.partyGroups.length) {
      set({ error: "Séparation impossible — il faut au moins 1 perso de chaque côté." });
      return;
    }
    const next = touch(result.campaign);
    await db.campaigns.put(next);
    for (const ch of result.characters) await db.characters.put(ch);
    set({ campaign: next, characters: result.characters, error: null });
    scheduleSync(get);
  },

  mergeParty: async () => {
    const { campaign, characters } = get();
    if (!campaign) return;
    const result = mergeAllGroups(normalizeCampaign(campaign), characters);
    const next = touch(result.campaign);
    await db.campaigns.put(next);
    for (const ch of result.characters) await db.characters.put(ch);
    set({ campaign: next, characters: result.characters, error: null });
    scheduleSync(get);
  },

  sendAction: async (text, opts) => {
    const state = get();
    const { campaign, characters, messages } = state;
    if (!campaign || campaign.pendingCheck || state.busy) return;
    if (campaign.pendingJointAction) {
      set({ error: "Une action collective est en cours de confirmation." });
      return;
    }
    const ensured = ensurePartyState(normalizeCampaign(campaign), characters);
    const activeId = ensured.campaign.activeCharacterId;
    if (!activeId) {
      set({ error: "Choisissez un personnage actif" });
      return;
    }
    const active = ensured.characters.find((c) => c.id === activeId);
    if (!active || active.partyGroupId !== ensured.campaign.activePartyGroupId) {
      set({ error: "Ce personnage n’est pas dans le groupe actif." });
      return;
    }
    if (isCharacterDown(active) && !isPlayerQuestionToGm(text)) {
      set({ error: `${active.name} est à terre (0 PV) — plus d’action de table.` });
      return;
    }
    const group = ensured.campaign.partyGroups.find(
      (g) => g.id === ensured.campaign.activePartyGroupId,
    );
    const trimmed = text.trim();
    if (!trimmed) return;

    const isQuestion = isPlayerQuestionToGm(trimmed);
    const encounter = ensured.campaign.encounter;
    if (encounter?.active && !isQuestion) {
      const cur = currentCombatant(encounter);
      if (!cur || cur.side !== "pc" || cur.characterId !== activeId) {
        set({
          error: `Ce n’est pas le tour de ${active.name} (tour de ${cur?.name ?? "…"}).`,
        });
        return;
      }
    } else if (
      group?.actedThisRound.includes(activeId) &&
      !campaign.pendingDialogue &&
      !isQuestion
    ) {
      set({ error: "Ce personnage a déjà agi ce round." });
      return;
    }

    const isDialogueReply = Boolean(campaign.pendingDialogue);
    if (!isDialogueReply && !isQuestion && isVaguePlayerAction(trimmed)) {
      set({ error: VAGUE_ACTION_HINT });
      return;
    }
    if (
      !isDialogueReply &&
      !isQuestion &&
      isRiskyWeAction(trimmed) &&
      (opts?.withCharacterIds ?? []).length === 0
    ) {
      set({ error: RISKY_WE_HINT });
      return;
    }

    const withIds = encounter?.active
      ? []
      : (opts?.withCharacterIds ?? []).filter(
          (id) =>
            id !== activeId &&
            ensured.characters.some(
              (c) =>
                c.id === id &&
                c.partyGroupId === ensured.campaign.activePartyGroupId &&
                !(group?.actedThisRound.includes(id)),
            ),
        );

    set({ busy: true, error: null });

    if (campaign.pendingDialogue) {
      const clearedDialogue = touch({
        ...ensured.campaign,
        pendingDialogue: null,
      });
      await db.campaigns.put(clearedDialogue);
      set({ campaign: clearedDialogue });
    }

    const dialogueTo = campaign.pendingDialogue?.to;
    const labeled = dialogueTo
      ? `[Dialogue → ${dialogueTo}] ${trimmed}`
      : trimmed;

    const playerMsg: Message = {
      id: nanoid(),
      campaignId: campaign.id,
      role: "player",
      characterId: activeId,
      text:
        withIds.length > 0
          ? `${labeled} [avec: ${withIds
              .map((id) => ensured.characters.find((c) => c.id === id)?.name)
              .filter(Boolean)
              .join(", ")}]`
          : labeled,
      createdAt: Date.now(),
    };
    await db.messages.add(playerMsg);
    const withPlayer = [...messages, playerMsg];

    if (withIds.length > 0) {
      const joint: PendingJointAction = {
        leaderId: activeId,
        participantIds: [activeId, ...withIds],
        text: labeled,
        confirmedIds: [activeId],
        partyGroupId: ensured.campaign.activePartyGroupId!,
      };
      const nextWaiting = withIds[0]!;
      const stamped = touch({
        ...ensured.campaign,
        pendingJointAction: joint,
        activeCharacterId: nextWaiting,
        partyGroups: ensured.campaign.partyGroups.map((g) =>
          g.id === joint.partyGroupId
            ? { ...g, activeCharacterId: nextWaiting }
            : g,
        ),
      });
      await db.campaigns.put(stamped);
      set({
        messages: withPlayer,
        campaign: stamped,
        characters: ensured.characters,
        busy: false,
      });
      scheduleSync(get);
      return;
    }

    const stamped = touch({ ...ensured.campaign });
    await db.campaigns.put(stamped);
    set({ messages: withPlayer, campaign: stamped, characters: ensured.characters });

    try {
      if (
        encounter?.active &&
        !isQuestion &&
        !isDialogueReply &&
        isOffensiveAction(labeled)
      ) {
        await runPlayerAttackTurn(
          labeled,
          activeId,
          opts?.targetCombatantId,
          get,
          set,
        );
      } else {
        await runGmActionTurn(labeled, activeId, [activeId], get, set);
      }
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Erreur de tour",
      });
    }
  },

  confirmJointAction: async () => {
    const state = get();
    const { campaign, characters } = state;
    if (!campaign?.pendingJointAction || state.busy) return;
    const joint = campaign.pendingJointAction;
    const activeId = campaign.activeCharacterId;
    if (!activeId || !joint.participantIds.includes(activeId)) {
      set({ error: "Ce n’est pas à ce personnage de confirmer." });
      return;
    }
    if (joint.confirmedIds.includes(activeId)) return;

    const confirmedIds = [...joint.confirmedIds, activeId];
    const nextJoint = { ...joint, confirmedIds };
    const remaining = joint.participantIds.filter((id) => !confirmedIds.includes(id));

    if (remaining.length > 0) {
      const nextId = remaining[0]!;
      const stamped = touch({
        ...normalizeCampaign(campaign),
        pendingJointAction: nextJoint,
        activeCharacterId: nextId,
        partyGroups: campaign.partyGroups.map((g) =>
          g.id === joint.partyGroupId
            ? { ...g, activeCharacterId: nextId }
            : g,
        ),
      });
      await db.campaigns.put(stamped);
      set({ campaign: stamped });
      scheduleSync(get);
      return;
    }

    set({ busy: true, error: null });
    const stamped = touch({
      ...normalizeCampaign(campaign),
      pendingJointAction: nextJoint,
    });
    await db.campaigns.put(stamped);
    set({ campaign: stamped });

    try {
      await runGmActionTurn(
        joint.text,
        joint.leaderId,
        joint.participantIds,
        get,
        set,
      );
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Erreur action collective",
      });
    }
  },

  declineJointAction: async () => {
    const { campaign } = get();
    if (!campaign?.pendingJointAction) return;
    const joint = campaign.pendingJointAction;
    const stamped = touch({
      ...normalizeCampaign(campaign),
      pendingJointAction: null,
      activeCharacterId: joint.leaderId,
      partyGroups: campaign.partyGroups.map((g) =>
        g.id === joint.partyGroupId
          ? { ...g, activeCharacterId: joint.leaderId }
          : g,
      ),
    });
    await db.campaigns.put(stamped);
    set({ campaign: stamped, error: "Action collective annulée." });
    scheduleSync(get);
  },

  resolvePendingCheck: async (mode, forcedD20) => {
    const state = get();
    const {
      campaign,
      characters,
      messages,
      pdfChunks,
      loreEntries,
      scenarioBeats,
      graphNodes,
      graphEdges,
      assets,
    } = state;
    if (!campaign?.pendingCheck || state.busy) return;

    const pending = campaign.pendingCheck;
    const character = characters.find((c) => c.id === pending.characterId);
    if (!character) return;

    set({ busy: true, error: null });

    const result: DiceResult = resolveCheck(
      character.attributes,
      pending.attribute,
      pending.dc,
      mode === "manual" ? forcedD20 : undefined,
    );

    const rollMsg: Message = {
      id: nanoid(),
      campaignId: campaign.id,
      role: "player",
      characterId: character.id,
      text: formatCheckRoll(result),
      createdAt: Date.now(),
    };
    await db.messages.add(rollMsg);

    const cleared = touch({ ...campaign, pendingCheck: null });
    await db.campaigns.put(cleared);
    const withRoll = [...messages, rollMsg];
    set({ campaign: cleared, messages: withRoll });

    try {
      const query = `${pending.actionContext} ${pending.reason}`;
      const cursor = normalizeCampaign(cleared).scenarioCursor;
      const lore = buildLorePack(pdfChunks, query, {
        cursor,
        windowBefore: 1,
        windowAfter: 2,
        relevantCount: 5,
      });
      const assetMeta: AssetMeta[] = assets.map(
        ({ blob: _b, ...meta }) => meta,
      );
      const previewActed = Array.from(
        new Set([...normalizeCampaign(cleared).actedThisRound, character.id]),
      );
      const body: GmTurnRequest = {
        mode: "resolve_check",
        activeCharacterId: character.id,
        campaign: campaignPayload(cleared),
        characters,
        recentMessages: recentTableForPrompt(withRoll, 12),
        pdfChunks: mapLore(lore),
        scenarioBeats: beatsForPrompt(scenarioBeats, cursor, 1),
        loreEntries: pickLoreForTurn(
          loreEntries,
          query,
          graphNodes,
          scenarioBeats,
          cursor,
        ),
        ...graphPayload(graphNodes, graphEdges),
        assets: assetMeta,
        checkResult: {
          ...result,
          reason: pending.reason,
          actionContext: pending.actionContext,
        },
        ...roundMeta(characters, previewActed),
        hereNow: hereNowPayload(cleared, characters, withRoll, scenarioBeats),
        encounterSummary: encounterSummaryForPrompt(cleared.encounter),
      };

      const res = await fetch("/api/gm-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Le MJ ne répond pas");
      }
      const gm = (await res.json()) as GmTurnResponse;
      await applyGmResponse(gm, pending.actionContext, character.id, get, set, {
        markActedId: character.id,
        countsTowardBeat: true,
      });
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Erreur de résolution",
      });
    }
  },

  sendOoc: async (text) => {
    const state = get();
    const { campaign, characters, messages, scenarioBeats, graphNodes } = state;
    if (!campaign || state.oocBusy) return;
    const question = text.trim();
    if (!question) return;

    const playerMsg: Message = {
      id: nanoid(),
      campaignId: campaign.id,
      role: "ooc",
      text: question,
      createdAt: Date.now(),
    };
    await db.messages.add(playerMsg);
    const withPlayer = [...messages, playerMsg];
    set({ messages: withPlayer, oocBusy: true, error: null });

    try {
      const beat =
        scenarioBeats.find((b) => b.order === campaign.scenarioCursor) ||
        scenarioBeats[0];
      const group = campaign.partyGroups.find(
        (g) => g.id === campaign.activePartyGroupId,
      );
      const revealed = graphNodes
        .filter((n) => n.revealed !== false)
        .map((n) => `${n.type}: ${n.name}`)
        .slice(0, 20);
      const knownFacts = [
        beat ? `Étape visible: ${beat.title}` : "",
        group?.locationHint ? `Lieu actuel: ${group.locationHint}` : "",
        revealed.length ? `Entités révélées: ${revealed.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const body: GmOocRequest = {
        question,
        campaign: campaignPayload(campaign),
        characters: characters.map((c) => ({
          id: c.id,
          name: c.name,
          hp: c.hp,
          maxHp: c.maxHp,
        })),
        recentTable: tableMessages(withPlayer)
          .slice(-10)
          .map((m) => ({
            speaker:
              m.role === "gm"
                ? "MJ"
                : characters.find((c) => c.id === m.characterId)?.name ||
                  "Joueur",
            text: m.text,
          })),
        recentOoc: withPlayer
          .filter((m) => m.role === "ooc" || m.role === "ooc_gm")
          .slice(-8)
          .map((m) => ({
            speaker: m.role === "ooc_gm" ? "MJ (hors-jeu)" : "Joueur",
            text: m.text,
          })),
        knownFacts,
      };

      const res = await fetch("/api/gm-ooc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Le MJ hors-jeu ne répond pas");
      }
      const data = (await res.json()) as GmOocResponse;
      const gmMsg: Message = {
        id: nanoid(),
        campaignId: campaign.id,
        role: "ooc_gm",
        text: data.answer?.trim() || "Pas de réponse.",
        createdAt: Date.now(),
      };
      await db.messages.add(gmMsg);
      set({
        messages: [...get().messages, gmMsg],
        oocBusy: false,
      });
      scheduleSync(get);
    } catch (e) {
      set({
        oocBusy: false,
        error: e instanceof Error ? e.message : "Erreur chat hors-jeu",
      });
    }
  },
}));

async function runGmActionTurn(
  labeled: string,
  leaderId: string,
  participantIds: string[],
  get: () => CampaignState,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
) {
  const state = get();
  const {
    campaign,
    characters,
    messages,
    pdfChunks,
    loreEntries,
    scenarioBeats,
    graphNodes,
    graphEdges,
    assets,
  } = state;
  if (!campaign) return;

  const ensured = ensurePartyState(normalizeCampaign(campaign), characters);
  const meta = partyTurnMeta(ensured.campaign, ensured.characters, participantIds);
  const cursor = ensured.campaign.scenarioCursor;
  const lore = buildLorePack(pdfChunks, labeled, {
    cursor,
    windowBefore: 1,
    windowAfter: 2,
    relevantCount: 5,
  });
  const assetMeta: AssetMeta[] = assets.map(({ blob: _b, ...metaA }) => metaA);
  const body: GmTurnRequest = {
    mode: "action",
    action: labeled,
    activeCharacterId: leaderId,
    campaign: campaignPayload(ensured.campaign),
    characters: meta.charactersForPrompt,
    recentMessages: recentTableForPrompt(messages, 12),
    pdfChunks: mapLore(lore),
    scenarioBeats: beatsForPrompt(scenarioBeats, cursor, 1),
    loreEntries: pickLoreForTurn(
      loreEntries,
      labeled,
      graphNodes,
      scenarioBeats,
      cursor,
    ),
    ...graphPayload(graphNodes, graphEdges),
    assets: assetMeta,
    actedCharacterNames: meta.actedCharacterNames,
    waitingCharacterNames: meta.waitingCharacterNames,
    jointParticipantNames: meta.jointParticipantNames,
    activePartyGroupLabel: meta.activePartyGroupLabel,
    otherPartyGroups: meta.otherPartyGroups,
    hereNow: hereNowPayload(
      ensured.campaign,
      ensured.characters,
      messages,
      scenarioBeats,
    ),
    encounterSummary: encounterSummaryForPrompt(ensured.campaign.encounter),
  };

  const res = await fetch("/api/gm-turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Le MJ ne répond pas");
  }
  const gm = (await res.json()) as GmTurnResponse;
  const skipTurn =
    gm.consume_turn === false || isPlayerQuestionToGm(labeled);
  await applyGmResponse(gm, labeled, leaderId, get, set, {
    markActedIds: skipTurn ? [] : participantIds,
    skipActedTracking: skipTurn,
    countsTowardBeat: !skipTurn,
  });
}

function itemKey(s: string): string {
  return s.trim().toLowerCase();
}

function removeInventoryItem(inv: string[], label: string): string[] {
  const key = itemKey(label);
  const exact = inv.findIndex((i) => itemKey(i) === key);
  if (exact >= 0) return inv.filter((_, i) => i !== exact);
  const fuzzy = inv.findIndex(
    (i) => itemKey(i).includes(key) || key.includes(itemKey(i)),
  );
  if (fuzzy >= 0) return inv.filter((_, i) => i !== fuzzy);
  return inv;
}

function applyInventoryUpdates(
  characters: Character[],
  updates: InventoryUpdate[],
): Character[] {
  if (!updates.length) return characters;
  return characters.map((c) => {
    const matched = updates.filter(
      (u) =>
        (u.characterId && u.characterId === c.id) ||
        (u.characterName &&
          u.characterName.trim().toLowerCase() === c.name.trim().toLowerCase()),
    );
    if (!matched.length) return c;
    let inv = [...c.inventory];
    for (const u of matched) {
      for (const r of u.remove ?? []) inv = removeInventoryItem(inv, r);
      for (const a of u.add ?? []) {
        const label = a.trim();
        if (!label) continue;
        if (!inv.some((i) => itemKey(i) === itemKey(label))) inv.push(label);
      }
    }
    return { ...c, inventory: inv };
  });
}

async function applyGmResponse(
  gm: GmTurnResponse,
  actionContext: string,
  activeCharacterId: string,
  get: () => CampaignState,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
  opts?: {
    markActedId?: string;
    markActedIds?: string[];
    skipActedTracking?: boolean;
    /** Player action or check resolution — counts toward beat pacing. */
    countsTowardBeat?: boolean;
    skipEncounterContinue?: boolean;
  },
) {
  const state = get();
  let campaign = normalizeCampaign(state.campaign!);
  let characters = state.characters.map((c) => normalizeCharacter(c));
  const ensured0 = ensurePartyState(campaign, characters);
  campaign = ensured0.campaign;
  characters = ensured0.characters;
  if (!campaign) return;

  const prevLocationHint =
    campaign.partyGroups.find((g) => g.id === campaign.activePartyGroupId)
      ?.locationHint ?? "";

  const gmMsg: Message = {
    id: nanoid(),
    campaignId: campaign.id,
    role: "gm",
    text: gm.narration,
    createdAt: Date.now(),
  };
  await db.messages.add(gmMsg);

  let nextNodes = [...state.graphNodes];
  let nextEdges = [...state.graphEdges];

  for (const n of gm.update_graph?.nodes ?? []) {
    const prev = nextNodes.find((x) => x.id === n.id);
    const node: GraphNode = normalizeNode({
      id: n.id,
      campaignId: campaign.id,
      type: n.type,
      name: n.name,
      description: n.description,
      mjNotes: n.mjNotes ?? prev?.mjNotes ?? "",
      revealed: n.revealed ?? prev?.revealed ?? true,
    });
    await db.graphNodes.put(node);
    const idx = nextNodes.findIndex((x) => x.id === n.id);
    if (idx >= 0) nextNodes[idx] = node;
    else nextNodes.push(node);
  }

  for (const e of gm.update_graph?.edges ?? []) {
    const edge: GraphEdge = normalizeEdge({
      id: `${e.fromId}__${e.relation}__${e.toId}`,
      campaignId: campaign.id,
      fromId: e.fromId,
      toId: e.toId,
      relation: e.relation,
      category: e.category ?? "social",
      affinity: e.affinity ?? 0,
      revealed: e.revealed !== false,
    });
    await db.graphEdges.put(edge);
    const idx = nextEdges.findIndex((x) => x.id === edge.id);
    if (idx >= 0) nextEdges[idx] = edge;
    else nextEdges.push(edge);
  }

  let pendingCheck: PendingCheck | null = null;
  if (gm.propose_check) {
    pendingCheck = {
      ...gm.propose_check,
      characterId: activeCharacterId,
      actionContext,
    };
  }

  let currentSceneAssetId = campaign.currentSceneAssetId;
  let sceneUrl = state.sceneUrl;
  const playId = gm.play_asset?.assetId;
  if (playId) {
    const asset = state.assets.find((a) => a.id === playId);
    if (asset) {
      if (asset.type === "image") {
        revoke(sceneUrl);
        sceneUrl = URL.createObjectURL(asset.blob);
        currentSceneAssetId = asset.id;
      } else if (asset.type === "audio") {
        const url = URL.createObjectURL(asset.blob);
        const audio = new Audio(url);
        void audio.play().catch(() => undefined);
      }
    }
  }

  let nextCampaign = { ...campaign };
  let nextCharacters = characters;

  if (gm.party_split) {
    const split = applyPartySplit(nextCampaign, nextCharacters, gm.party_split);
    nextCampaign = split.campaign;
    nextCharacters = split.characters;
    for (const ch of nextCharacters) await db.characters.put(ch);
  }

  if (gm.inventory_updates?.length) {
    nextCharacters = applyInventoryUpdates(nextCharacters, gm.inventory_updates);
    for (const ch of nextCharacters) await db.characters.put(ch);
  }

  if (gm.hp_updates?.length) {
    nextCharacters = applyHpUpdates(nextCharacters, gm.hp_updates);
    for (const ch of nextCharacters) await db.characters.put(ch);
  }

  if (nextCampaign.encounter?.active) {
    nextCampaign.encounter = syncPcCombatants(
      nextCampaign.encounter,
      nextCharacters,
    );
  }

  if (!pendingCheck && gm.end_encounter && nextCampaign.encounter) {
    nextCampaign.encounter = { ...nextCampaign.encounter, active: false };
  }

  if (
    !pendingCheck &&
    gm.start_encounter?.hostiles?.length &&
    !nextCampaign.encounter?.active
  ) {
    const members = groupMembers(
      nextCharacters,
      nextCampaign.activePartyGroupId,
    );
    const enc = buildEncounter(members, gm.start_encounter.hostiles);
    if (enc) {
      nextCampaign.encounter = enc;
      nextCampaign = alignActiveToEncounter(nextCampaign);
    }
  } else if (
    nextCampaign.encounter?.active &&
    !pendingCheck &&
    !opts?.skipEncounterContinue &&
    !opts?.skipActedTracking
  ) {
    nextCampaign.encounter = endIfResolved(
      advanceTurn(nextCampaign.encounter),
    );
    nextCampaign = alignActiveToEncounter(nextCampaign);
  }

  if (gm.location_update?.hint) {
    const hint = gm.location_update.hint;
    nextCampaign = {
      ...nextCampaign,
      partyGroups: nextCampaign.partyGroups.map((g) =>
        g.id === nextCampaign.activePartyGroupId
          ? { ...g, locationHint: hint }
          : g,
      ),
    };
  }

  const toMark = [
    ...(opts?.markActedIds ?? []),
    ...(opts?.markActedId ? [opts.markActedId] : []),
  ];
  if (
    !opts?.skipActedTracking &&
    toMark.length &&
    !pendingCheck &&
    !nextCampaign.encounter?.active
  ) {
    nextCampaign = markActedInGroup(nextCampaign, toMark);
    nextCampaign = advanceTurnInGroup(nextCampaign, nextCharacters);
  }

  const activeNow = nextCharacters.find(
    (c) => c.id === nextCampaign.activeCharacterId,
  );
  if (
    activeNow &&
    isCharacterDown(activeNow) &&
    !pendingCheck &&
    !nextCampaign.encounter?.active
  ) {
    nextCampaign = markActedInGroup(nextCampaign, [activeNow.id]);
    nextCampaign = advanceTurnInGroup(nextCampaign, nextCharacters);
  }

  const beatMax = Math.max(0, state.scenarioBeats.length - 1);
  const prev = normalizeCampaign(nextCampaign);
  const prevCursor = prev.scenarioCursor;
  const actionsOnBeat =
    prev.actionsOnBeat + (opts?.countsTowardBeat ? 1 : 0);
  const nextBeat = state.scenarioBeats.find((b) => b.order === prevCursor + 1);
  const advance = pendingCheck
    ? 0
    : gateAdvance({
        requested: gm.advance_scenario ?? 0,
        actionsOnBeat,
        nextBeat,
      });
  const scenarioCursor = Math.min(beatMax, prevCursor + advance);
  const nextActionsOnBeat = advance === 1 ? 0 : actionsOnBeat;

  const pendingDialogue =
    !pendingCheck && gm.ask_dialogue
      ? {
          ...gm.ask_dialogue,
          fromCharacterId:
            gm.ask_dialogue.fromCharacterId || activeCharacterId,
          to: humanizeDialogueTo(
            gm.ask_dialogue.to,
            nextCharacters,
            nextNodes,
          ),
        }
      : null;

  nextCampaign = touch({
    ...prev,
    joinCode: prev.joinCode || generateJoinCode(),
    pendingCheck,
    pendingDialogue,
    pendingJointAction: null,
    currentSceneAssetId,
    scenarioCursor,
    actionsOnBeat: nextActionsOnBeat,
    sessionSummary:
      gm.session_summary_update ?? campaign.sessionSummary,
  });
  await db.campaigns.put(nextCampaign);

  set({
    campaign: nextCampaign,
    characters: nextCharacters,
    messages: [...state.messages, gmMsg],
    graphNodes: nextNodes,
    graphEdges: nextEdges,
    sceneUrl,
    busy: false,
    error: null,
  });

  scheduleSync(get);

  void speakNarration(
    gm.narration,
    nextCampaign.ttsMuted,
    gm.speech_lines?.length ? gm.speech_lines : null,
  );

  const playedImportedImage = Boolean(
    playId &&
      state.assets.find(
        (a) => a.id === playId && a.type === "image" && !isGeneratedAsset(a),
      ),
  );
  if (!pendingCheck && !playedImportedImage) {
    const nextLocationHint =
      nextCampaign.partyGroups.find(
        (g) => g.id === nextCampaign.activePartyGroupId,
      )?.locationHint ?? "";
    void maybeGenerateLocationScene({
      get,
      set,
      campaignId: nextCampaign.id,
      title: nextCampaign.title,
      prevHint: prevLocationHint,
      nextHint: nextLocationHint,
      narration: gm.narration,
      hadScene: Boolean(sceneUrl),
    });
  }

  if (!pendingCheck && !opts?.skipEncounterContinue) {
    void maybeContinueEncounter(get, set);
  }
}

async function applySceneAsset(
  asset: Asset,
  get: () => CampaignState,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
) {
  const state = get();
  const campaign = state.campaign;
  if (!campaign || campaign.id !== asset.campaignId) return;
  revoke(state.sceneUrl);
  const sceneUrl = URL.createObjectURL(asset.blob);
  const next = touch({ ...campaign, currentSceneAssetId: asset.id });
  await db.campaigns.put(next);
  set({ campaign: next, sceneUrl, sceneGenerating: false });
  scheduleSync(get);
}

function resolveArtStyle(state: CampaignState): ArtStyleId {
  const stored = state.campaign?.artStyle;
  if (isArtStyleId(stored)) return stored;
  const corpus = [
    state.campaign?.title ?? "",
    state.campaign?.sessionSummary ?? "",
    ...state.scenarioBeats.slice(0, 6).flatMap((b) => [b.title, b.playerText, b.mjNotes]),
    ...state.loreEntries.slice(0, 8).map((e) => `${e.name} ${e.summary}`),
  ].join("\n");
  return inferArtStyle(corpus) || DEFAULT_ART_STYLE;
}

async function persistArtStyle(
  style: ArtStyleId,
  get: () => CampaignState,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
) {
  const campaign = get().campaign;
  if (!campaign || campaign.artStyle === style) return;
  const next = touch({ ...campaign, artStyle: style });
  await db.campaigns.put(next);
  set({ campaign: next });
}

async function maybeGenerateLocationScene(opts: {
  get: () => CampaignState;
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void;
  campaignId: string;
  title: string;
  prevHint: string;
  nextHint: string;
  narration: string;
  hadScene: boolean;
}) {
  const key =
    normalizeLocationKey(opts.nextHint) ||
    (!opts.hadScene ? normalizeLocationKey(opts.title) : "");
  if (!key) return;

  const prevKey = normalizeLocationKey(opts.prevHint);
  if (opts.hadScene && prevKey && key === prevKey) return;

  const style = resolveArtStyle(opts.get());
  await persistArtStyle(style, opts.get, opts.set);

  const existing = findGeneratedScene(opts.get().assets, key, style);
  const seq = ++sceneGenSeq;

  try {
    if (existing) {
      await applySceneAsset(existing, opts.get, opts.set);
    } else {
      opts.set({ sceneGenerating: true });
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildScenePrompt(
            opts.nextHint,
            opts.title,
            opts.narration,
            style,
          ),
          seed: sceneSeed(opts.campaignId, key),
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size >= 1024 && seq === sceneGenSeq) {
          const state = opts.get();
          if (state.campaign?.id === opts.campaignId) {
            const asset: Asset = {
              id: nanoid(),
              campaignId: opts.campaignId,
              name: opts.nextHint.trim() || opts.title.trim() || "Scène",
              type: "image",
              tags: [GENERATED_TAG, "scene", locationTag(key), styleTag(style)],
              mimeType: blob.type || "image/jpeg",
              blob,
            };
            await db.assets.add(asset);
            const latest = opts.get();
            if (latest.campaign?.id === opts.campaignId && seq === sceneGenSeq) {
              opts.set({ assets: [...latest.assets, asset] });
              await applySceneAsset(asset, opts.get, opts.set);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Illustration de scène ignorée", e);
  } finally {
    if (seq === sceneGenSeq) opts.set({ sceneGenerating: false });
  }

  void maybeGenerateLocationAmbient({
    get: opts.get,
    set: opts.set,
    campaignId: opts.campaignId,
    title: opts.title,
    hint: opts.nextHint,
    key,
    style,
  });
}

async function maybeGenerateLocationAmbient(opts: {
  get: () => CampaignState;
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void;
  campaignId: string;
  title: string;
  hint: string;
  key: string;
  style: ArtStyleId;
}) {
  const muted = Boolean(opts.get().campaign?.ttsMuted);
  if (muted) return;

  const cached = findGeneratedAmbient(opts.get().assets, opts.key, opts.style);
  if (cached) {
    await playAmbientLoop(cached.blob, muted);
    return;
  }

  try {
    const res = await fetch("/api/generate-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "sfx",
        prompt: buildAmbientPrompt(
          opts.hint,
          opts.title,
          opts.style,
          ambientStylePrompt(opts.style),
        ),
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    if (blob.size < 256) return;
    if (opts.get().campaign?.id !== opts.campaignId) return;

    const asset: Asset = {
      id: nanoid(),
      campaignId: opts.campaignId,
      name: `Ambiance ${opts.hint.trim() || opts.title}`.trim(),
      type: "audio",
      tags: [GENERATED_TAG, AMBIENT_TAG, locationTag(opts.key), styleTag(opts.style)],
      mimeType: blob.type || "audio/mpeg",
      blob,
    };
    await db.assets.add(asset);
    const latest = opts.get();
    if (latest.campaign?.id !== opts.campaignId) return;
    opts.set({ assets: [...latest.assets, asset] });
    await playAmbientLoop(asset.blob, Boolean(latest.campaign.ttsMuted));
  } catch (e) {
    console.warn("Ambiance de scène ignorée", e);
  }
}

function alignActiveToEncounter(campaign: Campaign): Campaign {
  const cur = currentCombatant(campaign.encounter);
  if (!cur?.characterId) return campaign;
  return {
    ...campaign,
    activeCharacterId: cur.characterId,
    partyGroups: campaign.partyGroups.map((g) =>
      g.id === campaign.activePartyGroupId
        ? { ...g, activeCharacterId: cur.characterId! }
        : g,
    ),
  };
}

async function persistEncounter(
  campaign: Campaign,
  characters: Character[],
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
) {
  const next = touch(campaign);
  await db.campaigns.put(next);
  for (const ch of characters) await db.characters.put(ch);
  set({ campaign: next, characters });
}

async function maybeContinueEncounter(
  get: () => CampaignState,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
) {
  const { campaign } = get();
  if (!campaign?.encounter?.active || campaign.pendingCheck) return;
  const cur = currentCombatant(campaign.encounter);
  if (cur?.side === "pc" && cur.characterId) {
    const aligned = alignActiveToEncounter(campaign);
    if (aligned.activeCharacterId !== campaign.activeCharacterId) {
      await persistEncounter(aligned, get().characters, set);
    }
    return;
  }
  if (cur?.side === "hostile") {
    await runHostileTurns(get, set);
  }
}

async function runHostileTurns(
  get: () => CampaignState,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
) {
  for (let i = 0; i < 6; i++) {
    const { campaign } = get();
    if (!campaign?.encounter?.active || campaign.pendingCheck) break;
    const cur = currentCombatant(campaign.encounter);
    if (!cur || cur.side !== "hostile") break;
    await runOneHostileTurn(get, set);
  }
}

async function runOneHostileTurn(
  get: () => CampaignState,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
) {
  const state = get();
  let campaign = state.campaign;
  let characters = state.characters;
  if (!campaign?.encounter?.active) return;
  let encounter = syncPcCombatants(campaign.encounter, characters);
  const attacker = currentCombatant(encounter);
  if (!attacker || attacker.side !== "hostile") return;
  const defender = pickHostileTarget(encounter);
  if (!defender) {
    encounter = { ...encounter, active: false };
    await persistEncounter({ ...campaign, encounter }, characters, set);
    return;
  }

  set({ busy: true, error: null });
  const { result, nextDefender } = resolveAttack(attacker, defender);
  encounter = applyCombatantPatch(encounter, nextDefender.id, {
    hp: nextDefender.hp,
  });
  encounter = endIfResolved(encounter);

  if (defender.characterId) {
    characters = characters.map((c) =>
      c.id === defender.characterId
        ? { ...c, hp: Math.max(0, Math.min(c.maxHp, nextDefender.hp)) }
        : c,
    );
  }

  const rollMsg: Message = {
    id: nanoid(),
    campaignId: campaign.id,
    role: "gm",
    text: formatAttackLine(result),
    createdAt: Date.now(),
  };
  await db.messages.add(rollMsg);

  campaign = touch({ ...campaign, encounter });
  await persistEncounter(campaign, characters, set);
  set({ messages: [...get().messages, rollMsg] });

  try {
    await flavorCombatResult("resolve_npc", result, attacker.characterId || characters[0]?.id || "", get, set);
  } catch {
    /* narration optionnelle */
  }

  const after = get();
  if (!after.campaign?.encounter?.active) {
    set({ busy: false });
    return;
  }
  const advanced = alignActiveToEncounter({
    ...after.campaign,
    encounter: endIfResolved(advanceTurn(after.campaign.encounter)),
  });
  await persistEncounter(advanced, after.characters, set);
  set({ busy: false });
}

async function runPlayerAttackTurn(
  labeled: string,
  leaderId: string,
  targetCombatantId: string | undefined,
  get: () => CampaignState,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
) {
  const state = get();
  let campaign = state.campaign;
  const characters = state.characters;
  if (!campaign?.encounter?.active) return;
  let encounter = syncPcCombatants(campaign.encounter, characters);
  const attacker = encounter.combatants.find(
    (c) => c.characterId === leaderId && c.side === "pc",
  );
  if (!attacker || attacker.hp <= 0) {
    set({ busy: false, error: "Ce personnage ne peut pas attaquer." });
    return;
  }
  const hostiles = living(encounter, "hostile");
  const defender =
    hostiles.find((c) => c.id === targetCombatantId) || hostiles[0];
  if (!defender) {
    set({ busy: false, error: "Aucune cible debout." });
    return;
  }

  const { result, nextDefender } = resolveAttack(attacker, defender);
  encounter = applyCombatantPatch(encounter, nextDefender.id, {
    hp: nextDefender.hp,
  });
  encounter.lastAttackerId = attacker.id;
  encounter = endIfResolved(encounter);

  const rollMsg: Message = {
    id: nanoid(),
    campaignId: campaign.id,
    role: "player",
    characterId: leaderId,
    text: formatAttackLine(result),
    createdAt: Date.now(),
  };
  await db.messages.add(rollMsg);
  campaign = touch({ ...campaign, encounter });
  await persistEncounter(campaign, characters, set);
  set({ messages: [...get().messages, rollMsg] });

  try {
    await flavorCombatResult("resolve_attack", result, leaderId, get, set, labeled);
  } catch (e) {
    set({
      busy: false,
      error: e instanceof Error ? e.message : "Erreur de résolution",
    });
    return;
  }

  const after = get();
  if (!after.campaign?.encounter) {
    set({ busy: false });
    return;
  }
  let nextEnc = after.campaign.encounter;
  if (nextEnc.active) {
    nextEnc = endIfResolved(advanceTurn(nextEnc));
  }
  const advanced = alignActiveToEncounter({
    ...after.campaign,
    encounter: nextEnc,
  });
  await persistEncounter(advanced, after.characters, set);
  set({ busy: false });
  await maybeContinueEncounter(get, set);
}

async function flavorCombatResult(
  mode: "resolve_npc" | "resolve_attack",
  result: AttackResult,
  activeCharacterId: string,
  get: () => CampaignState,
  set: (
    partial:
      | Partial<CampaignState>
      | ((s: CampaignState) => Partial<CampaignState>),
  ) => void,
  action?: string,
) {
  const state = get();
  const {
    campaign,
    characters,
    messages,
    pdfChunks,
    loreEntries,
    scenarioBeats,
    graphNodes,
    graphEdges,
    assets,
  } = state;
  if (!campaign) return;
  const assetMeta = assets.map(({ blob: _b, ...meta }) => meta);
  const cursor = campaign.scenarioCursor;
  const body: GmTurnRequest = {
    mode,
    action,
    activeCharacterId,
    campaign: campaignPayload(campaign),
    characters,
    recentMessages: recentTableForPrompt(messages, 12),
    pdfChunks: mapLore(
      buildLorePack(pdfChunks, `${result.attackerName} ${result.defenderName}`, {
        cursor,
        windowBefore: 1,
        windowAfter: 1,
        relevantCount: 4,
      }),
    ),
    scenarioBeats: beatsForPrompt(scenarioBeats, cursor, 1),
    loreEntries: pickLoreForTurn(
      loreEntries,
      `${result.attackerName} ${result.defenderName}`,
      graphNodes,
      scenarioBeats,
      cursor,
    ),
    ...graphPayload(graphNodes, graphEdges),
    assets: assetMeta,
    attackResult: result,
    hereNow: hereNowPayload(campaign, characters, messages, scenarioBeats),
    encounterSummary: encounterSummaryForPrompt(campaign.encounter),
  };
  const res = await fetch("/api/gm-turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Le MJ ne répond pas");
  }
  const gm = (await res.json()) as GmTurnResponse;
  await applyGmResponse(gm, action || result.attackerName, activeCharacterId, get, set, {
    skipActedTracking: true,
    skipEncounterContinue: true,
    countsTowardBeat: mode === "resolve_attack",
  });
}

function partyTurnMeta(
  campaign: Campaign,
  characters: Character[],
  jointIds?: string[],
) {
  const ensured = ensurePartyState(normalizeCampaign(campaign), characters);
  const groupId = ensured.campaign.activePartyGroupId;
  const group = ensured.campaign.partyGroups.find((g) => g.id === groupId);
  const members = groupMembers(ensured.characters, groupId);
  const acted = new Set(group?.actedThisRound ?? []);
  return {
    charactersForPrompt: members,
    actedCharacterNames: members
      .filter((c) => acted.has(c.id))
      .map((c) => c.name),
    waitingCharacterNames: members
      .filter((c) => !acted.has(c.id) && !isCharacterDown(c))
      .map((c) => c.name),
    jointParticipantNames: (jointIds ?? [])
      .map((id) => ensured.characters.find((c) => c.id === id)?.name)
      .filter((n): n is string => Boolean(n)),
    activePartyGroupLabel: group?.label,
    otherPartyGroups: ensured.campaign.partyGroups
      .filter((g) => g.id !== groupId)
      .map((g) => ({
        label: g.label,
        characterNames: groupMembers(ensured.characters, g.id).map((c) => c.name),
      })),
  };
}

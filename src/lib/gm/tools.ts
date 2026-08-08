import type {
  Attribute,
  GmTurnResponse,
  GraphEdgeCategory,
  GraphNodeType,
  InventoryUpdate,
  PartySplitUpdate,
  PendingDialogue,
  SpeechLine,
} from "@/lib/types";
import { ATTRIBUTES } from "@/lib/types";

const NODE_TYPES: GraphNodeType[] = [
  "lieu",
  "pnj",
  "objet",
  "quete",
  "fait",
  "faction",
  "pj",
];

const EDGE_CATEGORIES: GraphEdgeCategory[] = [
  "social",
  "spatial",
  "plot",
  "inventory",
];

function isAttribute(v: unknown): v is Attribute {
  return typeof v === "string" && (ATTRIBUTES as string[]).includes(v);
}

function isNodeType(v: unknown): v is GraphNodeType {
  return typeof v === "string" && (NODE_TYPES as string[]).includes(v);
}

function isEdgeCategory(v: unknown): v is GraphEdgeCategory {
  return typeof v === "string" && (EDGE_CATEGORIES as string[]).includes(v);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Réponse MJ non JSON");
  }
}

function clampAffinity(n: number): number {
  return Math.max(-3, Math.min(3, Math.round(n)));
}

export function parseGmResponse(raw: string): GmTurnResponse {
  const data = extractJson(raw) as Record<string, unknown>;

  const narration =
    typeof data.narration === "string" && data.narration.trim()
      ? data.narration.trim()
      : "Le silence s'installe un instant…";

  let propose_check: GmTurnResponse["propose_check"] = null;
  const pc = data.propose_check;
  if (pc && typeof pc === "object") {
    const obj = pc as Record<string, unknown>;
    if (
      isAttribute(obj.attribute) &&
      typeof obj.dc === "number" &&
      typeof obj.reason === "string"
    ) {
      propose_check = {
        attribute: obj.attribute,
        dc: Math.max(5, Math.min(30, Math.round(obj.dc))),
        reason: obj.reason,
      };
    }
  }

  const update_graph: GmTurnResponse["update_graph"] = {
    nodes: [],
    edges: [],
  };
  const ug = data.update_graph;
  if (ug && typeof ug === "object") {
    const graph = ug as Record<string, unknown>;
    if (Array.isArray(graph.nodes)) {
      for (const n of graph.nodes) {
        if (!n || typeof n !== "object") continue;
        const node = n as Record<string, unknown>;
        if (
          typeof node.id === "string" &&
          isNodeType(node.type) &&
          typeof node.name === "string" &&
          typeof node.description === "string"
        ) {
          update_graph.nodes.push({
            id: node.id,
            type: node.type,
            name: node.name,
            description: node.description,
            mjNotes: typeof node.mjNotes === "string" ? node.mjNotes : undefined,
            revealed: typeof node.revealed === "boolean" ? node.revealed : undefined,
          });
        }
      }
    }
    if (Array.isArray(graph.edges)) {
      for (const e of graph.edges) {
        if (!e || typeof e !== "object") continue;
        const edge = e as Record<string, unknown>;
        if (
          typeof edge.fromId === "string" &&
          typeof edge.toId === "string" &&
          typeof edge.relation === "string"
        ) {
          update_graph.edges.push({
            fromId: edge.fromId,
            toId: edge.toId,
            relation: edge.relation,
            category: isEdgeCategory(edge.category) ? edge.category : "social",
            affinity:
              typeof edge.affinity === "number"
                ? clampAffinity(edge.affinity)
                : 0,
            revealed: typeof edge.revealed === "boolean" ? edge.revealed : true,
          });
        }
      }
    }
  }

  let play_asset: GmTurnResponse["play_asset"] = null;
  const pa = data.play_asset;
  if (pa && typeof pa === "object") {
    const obj = pa as Record<string, unknown>;
    if (typeof obj.assetId === "string" && obj.assetId.trim()) {
      play_asset = { assetId: obj.assetId.trim() };
    }
  }

  const session_summary_update =
    typeof data.session_summary_update === "string" &&
    data.session_summary_update.trim()
      ? data.session_summary_update.trim()
      : null;

  // Only 0 or 1 — never skip beats in one turn.
  let advance_scenario = 0;
  if (typeof data.advance_scenario === "number" && Number.isFinite(data.advance_scenario)) {
    advance_scenario = Math.max(0, Math.min(1, Math.round(data.advance_scenario)));
  }

  // Keep GM dialogue cues only — TTS rebuilds from on-screen `narration` (exact text).
  const speech_lines: SpeechLine[] = [];
  if (Array.isArray(data.speech_lines)) {
    for (const item of data.speech_lines) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.speaker === "string" && typeof row.text === "string") {
        const text = row.text.trim();
        const speaker = row.speaker.trim();
        if (text && speaker) speech_lines.push({ speaker, text });
      }
    }
  }

  let ask_dialogue: PendingDialogue | null = null;
  const ad = data.ask_dialogue;
  if (ad && typeof ad === "object") {
    const obj = ad as Record<string, unknown>;
    if (
      typeof obj.fromCharacterId === "string" &&
      typeof obj.to === "string" &&
      typeof obj.prompt === "string" &&
      obj.prompt.trim()
    ) {
      ask_dialogue = {
        fromCharacterId: obj.fromCharacterId,
        to: obj.to,
        prompt: obj.prompt.trim(),
      };
    }
  }

  let party_split: PartySplitUpdate | null = null;
  const ps = data.party_split;
  if (ps && typeof ps === "object") {
    const obj = ps as Record<string, unknown>;
    if (Array.isArray(obj.groups)) {
      const groups: PartySplitUpdate["groups"] = [];
      for (const g of obj.groups) {
        if (!g || typeof g !== "object") continue;
        const row = g as Record<string, unknown>;
        if (typeof row.label !== "string" || !Array.isArray(row.characterNames))
          continue;
        const names = row.characterNames
          .filter((n): n is string => typeof n === "string")
          .map((n) => n.trim())
          .filter(Boolean);
        if (!names.length) continue;
        groups.push({
          label: row.label.trim() || "Groupe",
          characterNames: names,
          locationHint:
            typeof row.locationHint === "string" ? row.locationHint.trim() : "",
        });
      }
      if (groups.length) {
        party_split = {
          groups,
          reason: typeof obj.reason === "string" ? obj.reason.trim() : undefined,
        };
      }
    }
  }

  const consume_turn =
    typeof data.consume_turn === "boolean" ? data.consume_turn : true;

  const inventory_updates: InventoryUpdate[] = [];
  if (Array.isArray(data.inventory_updates)) {
    for (const item of data.inventory_updates) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const characterId =
        typeof row.characterId === "string" ? row.characterId.trim() : "";
      const characterName =
        typeof row.characterName === "string" ? row.characterName.trim() : "";
      if (!characterId && !characterName) continue;
      const add = Array.isArray(row.add)
        ? row.add
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
      const remove = Array.isArray(row.remove)
        ? row.remove
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
      if (!add.length && !remove.length) continue;
      inventory_updates.push({
        characterId: characterId || undefined,
        characterName: characterName || undefined,
        add: add.length ? add : undefined,
        remove: remove.length ? remove : undefined,
      });
    }
  }

  return {
    narration,
    propose_check,
    update_graph,
    play_asset,
    session_summary_update,
    advance_scenario,
    speech_lines,
    ask_dialogue,
    party_split,
    consume_turn,
    inventory_updates,
  };
}

import Dexie, { type EntityTable } from "dexie";
import type {
  Asset,
  Campaign,
  Character,
  GraphEdge,
  GraphNode,
  LoreEntry,
  Message,
  PdfChunk,
  ScenarioBeat,
} from "@/lib/types";

export class MaitreDuJeuDB extends Dexie {
  campaigns!: EntityTable<Campaign, "id">;
  characters!: EntityTable<Character, "id">;
  messages!: EntityTable<Message, "id">;
  pdfChunks!: EntityTable<PdfChunk, "id">;
  scenarioBeats!: EntityTable<ScenarioBeat, "id">;
  loreEntries!: EntityTable<LoreEntry, "id">;
  graphNodes!: EntityTable<GraphNode, "id">;
  graphEdges!: EntityTable<GraphEdge, "id">;
  assets!: EntityTable<Asset, "id">;

  constructor() {
    super("MaitreDuJeuDB");
    this.version(1).stores({
      campaigns: "id, updatedAt",
      characters: "id, campaignId",
      messages: "id, campaignId, createdAt",
      pdfChunks: "id, campaignId, index",
      graphNodes: "id, campaignId, type",
      graphEdges: "id, campaignId",
      assets: "id, campaignId, type",
    });
    this.version(2).stores({
      campaigns: "id, updatedAt",
      characters: "id, campaignId",
      messages: "id, campaignId, createdAt",
      pdfChunks: "id, campaignId, index",
      scenarioBeats: "id, campaignId, order",
      graphNodes: "id, campaignId, type",
      graphEdges: "id, campaignId",
      assets: "id, campaignId, type",
    });
    this.version(3).stores({
      campaigns: "id, updatedAt",
      characters: "id, campaignId",
      messages: "id, campaignId, createdAt",
      pdfChunks: "id, campaignId, index",
      scenarioBeats: "id, campaignId, order",
      loreEntries: "id, campaignId, kind, name",
      graphNodes: "id, campaignId, type",
      graphEdges: "id, campaignId",
      assets: "id, campaignId, type",
    });
  }
}

export const db = new MaitreDuJeuDB();

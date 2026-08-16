import type { Asset } from "@/lib/types";

export const GENERATED_TAG = "generated";
export const LOC_TAG_PREFIX = "loc:";

export function normalizeLocationKey(hint: string): string {
  return hint
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function locationTag(key: string): string {
  return `${LOC_TAG_PREFIX}${key}`;
}

export function isGeneratedAsset(asset: Asset): boolean {
  return asset.tags.includes(GENERATED_TAG);
}

export function findGeneratedScene(
  assets: Asset[],
  key: string,
): Asset | undefined {
  if (!key) return undefined;
  const tag = locationTag(key);
  return assets.find(
    (a) => a.type === "image" && isGeneratedAsset(a) && a.tags.includes(tag),
  );
}

export function sceneSeed(campaignId: string, key: string): number {
  const s = `${campaignId}:${key}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildScenePrompt(
  hint: string,
  title: string,
  narration: string,
): string {
  const place = hint.trim() || title.trim() || "fantasy adventure";
  const mood = narration.replace(/\s+/g, " ").trim().slice(0, 140);
  return [
    "cinematic fantasy tabletop RPG establishing shot",
    "atmospheric lighting, detailed environment",
    "no text, no letters, no UI, no watermark, no logo",
    place,
    mood ? `mood: ${mood}` : "",
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 500);
}

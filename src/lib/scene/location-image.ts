import type { ArtStyleId } from "@/lib/scene/art-style";
import { imageStylePrompt, styleTag } from "@/lib/scene/art-style";
import type { Asset } from "@/lib/types";

export const GENERATED_TAG = "generated";
export const LOC_TAG_PREFIX = "loc:";
export const AMBIENT_TAG = "ambient";

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
  style: ArtStyleId,
): Asset | undefined {
  if (!key) return undefined;
  const loc = locationTag(key);
  const look = styleTag(style);
  return assets.find(
    (a) =>
      a.type === "image" &&
      isGeneratedAsset(a) &&
      a.tags.includes(loc) &&
      a.tags.includes(look),
  );
}

export function findGeneratedAmbient(
  assets: Asset[],
  key: string,
  style: ArtStyleId,
): Asset | undefined {
  if (!key) return undefined;
  const loc = locationTag(key);
  const look = styleTag(style);
  return assets.find(
    (a) =>
      a.type === "audio" &&
      isGeneratedAsset(a) &&
      a.tags.includes(AMBIENT_TAG) &&
      a.tags.includes(loc) &&
      a.tags.includes(look),
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
  style: ArtStyleId,
): string {
  const place = hint.trim() || title.trim() || "adventure scene";
  const mood = narration.replace(/\s+/g, " ").trim().slice(0, 120);
  return [
    "tabletop RPG establishing shot, detailed environment",
    imageStylePrompt(style),
    "no letters, no UI, no watermark, no logo, no caption",
    place,
    mood ? `mood: ${mood}` : "",
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 700);
}

export function buildAmbientPrompt(
  hint: string,
  title: string,
  style: ArtStyleId,
  ambientLook: string,
): string {
  const place = hint.trim() || title.trim() || "adventure";
  return [
    "loopable ambient soundscape, 10 seconds, seamless, background only",
    ambientLook,
    place,
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 400);
}

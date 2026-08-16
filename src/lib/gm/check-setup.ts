import { ATTRIBUTE_LABELS, type Attribute } from "@/lib/types";

/** Stake-only text shown before the die — never describes an outcome. */
export function buildCheckSetupNarration(opts: {
  characterName: string;
  action: string;
  attribute: Attribute;
  dc: number;
  reason: string;
}): string {
  const stake = opts.reason.trim() || opts.action.trim() || "cette action";
  const who = opts.characterName.trim() || "Le personnage";
  return `${who} s’apprête à tenter : ${stake}\n\nJet ${ATTRIBUTE_LABELS[opts.attribute]} — DD ${opts.dc}. Le dé décidera.`;
}

import type { CombatProfile } from "@/lib/types";

export type ProfileStats = {
  ac: number;
  hp: number;
  atkBonus: number;
  damageDie: 4 | 6 | 8;
  dex: number;
};

export const COMBAT_PROFILES: Record<CombatProfile, ProfileStats> = {
  minion: { ac: 12, hp: 6, atkBonus: 2, damageDie: 4, dex: 10 },
  brute: { ac: 13, hp: 16, atkBonus: 4, damageDie: 8, dex: 8 },
  skirmisher: { ac: 15, hp: 10, atkBonus: 3, damageDie: 6, dex: 16 },
  elite: { ac: 16, hp: 24, atkBonus: 5, damageDie: 8, dex: 12 },
};

export const COMBAT_PROFILES_LIST: CombatProfile[] = [
  "minion",
  "brute",
  "skirmisher",
  "elite",
];

export function parseCombatProfile(raw: unknown): CombatProfile {
  if (typeof raw === "string" && (COMBAT_PROFILES_LIST as string[]).includes(raw)) {
    return raw as CombatProfile;
  }
  return "brute";
}

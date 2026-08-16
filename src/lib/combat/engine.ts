import { nanoid } from "nanoid";
import { abilityModifier, rollDie } from "@/lib/rules/d20";
import type {
  AttackResult,
  Character,
  Combatant,
  CombatProfile,
  Encounter,
  HpBand,
  StartEncounterHostile,
} from "@/lib/types";
import { COMBAT_PROFILES, parseCombatProfile } from "@/lib/combat/profiles";

export function pcArmorClass(character: Character): number {
  return 10 + abilityModifier(character.attributes.DEX ?? 10);
}

export function pcAttackBonus(character: Character): number {
  return abilityModifier(character.attributes.FOR ?? 10);
}

export function hpBand(hp: number, maxHp: number): HpBand {
  if (hp <= 0) return "a_terre";
  if (maxHp <= 0) return "a_terre";
  const ratio = hp / maxHp;
  if (ratio >= 1) return "intact";
  if (ratio > 0.5) return "blesse";
  return "mal_en_point";
}

export const HP_BAND_LABELS: Record<HpBand, string> = {
  intact: "intact",
  blesse: "blessé",
  mal_en_point: "mal en point",
  a_terre: "à terre",
};

export function isCombatantDown(c: Combatant): boolean {
  return c.hp <= 0;
}

export function living(encounter: Encounter, side?: Combatant["side"]): Combatant[] {
  return encounter.combatants.filter(
    (c) => !isCombatantDown(c) && (side ? c.side === side : true),
  );
}

function combatantFromPc(character: Character): Combatant {
  const dex = character.attributes.DEX ?? 10;
  return {
    id: `pc_${character.id}`,
    name: character.name,
    side: "pc",
    characterId: character.id,
    profile: "skirmisher",
    dex,
    hp: character.hp,
    maxHp: character.maxHp,
    ac: pcArmorClass(character),
    atkBonus: pcAttackBonus(character),
    damageDie: 6,
    initiative: rollDie(20) + abilityModifier(dex),
  };
}

function combatantFromHostile(name: string, profile: CombatProfile): Combatant {
  const stats = COMBAT_PROFILES[profile];
  return {
    id: nanoid(),
    name,
    side: "hostile",
    profile,
    dex: stats.dex,
    hp: stats.hp,
    maxHp: stats.hp,
    ac: stats.ac,
    atkBonus: stats.atkBonus,
    damageDie: stats.damageDie,
    initiative: rollDie(20) + abilityModifier(stats.dex),
  };
}

function sortByInitiative(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.dex !== a.dex) return b.dex - a.dex;
    if (a.side !== b.side) return a.side === "pc" ? -1 : 1;
    return a.name.localeCompare(b.name, "fr");
  });
}

function expandHostiles(specs: StartEncounterHostile[]): Combatant[] {
  const out: Combatant[] = [];
  for (const spec of specs) {
    const name = spec.name.trim();
    if (!name) continue;
    const profile = parseCombatProfile(spec.profile);
    const count = Math.max(1, Math.min(8, Math.round(spec.count ?? 1)));
    for (let i = 0; i < count; i++) {
      const label = count > 1 ? `${name} ${i + 1}` : name;
      out.push(combatantFromHostile(label, profile));
    }
  }
  return out;
}

export function buildEncounter(
  pcs: Character[],
  hostiles: StartEncounterHostile[],
): Encounter | null {
  const pcList = pcs.filter((c) => c.hp > 0).map(combatantFromPc);
  const foes = expandHostiles(hostiles);
  if (pcList.length === 0 || foes.length === 0) return null;
  const combatants = sortByInitiative([...pcList, ...foes]);
  return {
    active: true,
    round: 1,
    turnIndex: firstLivingIndex(combatants),
    combatants,
  };
}

function firstLivingIndex(combatants: Combatant[]): number {
  const i = combatants.findIndex((c) => !isCombatantDown(c));
  return i >= 0 ? i : 0;
}

export function currentCombatant(encounter: Encounter | null | undefined): Combatant | null {
  if (!encounter?.active || !encounter.combatants.length) return null;
  return encounter.combatants[encounter.turnIndex] ?? null;
}

export function advanceTurn(encounter: Encounter): Encounter {
  if (!encounter.active || encounter.combatants.length === 0) return encounter;
  const n = encounter.combatants.length;
  let idx = encounter.turnIndex;
  let round = encounter.round;
  for (let step = 0; step < n + 1; step++) {
    idx = (idx + 1) % n;
    if (idx === 0) round += 1;
    if (!isCombatantDown(encounter.combatants[idx]!)) {
      return { ...encounter, turnIndex: idx, round };
    }
  }
  return endIfResolved({ ...encounter, turnIndex: idx, round });
}

export function endIfResolved(encounter: Encounter): Encounter {
  if (living(encounter, "hostile").length === 0) {
    return { ...encounter, active: false };
  }
  if (living(encounter, "pc").length === 0) {
    return { ...encounter, active: false };
  }
  return encounter;
}

export function pickHostileTarget(encounter: Encounter): Combatant | null {
  const pcs = living(encounter, "pc");
  if (pcs.length === 0) return null;
  if (encounter.lastAttackerId) {
    const last = pcs.find((c) => c.id === encounter.lastAttackerId);
    if (last) return last;
  }
  return [...pcs].sort((a, b) => a.hp - b.hp || a.name.localeCompare(b.name, "fr"))[0] ?? null;
}

export function resolveAttack(attacker: Combatant, defender: Combatant): {
  result: AttackResult;
  nextDefender: Combatant;
} {
  const d20 = rollDie(20);
  const crit = d20 === 20;
  const missCrit = d20 === 1;
  const total = d20 + attacker.atkBonus;
  const hit = missCrit ? false : crit || total >= defender.ac;
  let damage = 0;
  if (hit) {
    const die = crit ? attacker.damageDie : rollDie(attacker.damageDie);
    damage = Math.max(1, die + attacker.atkBonus);
  }
  const hp = Math.max(0, defender.hp - damage);
  const nextDefender = { ...defender, hp };
  return {
    nextDefender,
    result: {
      attackerName: attacker.name,
      defenderName: defender.name,
      d20,
      bonus: attacker.atkBonus,
      total,
      ac: defender.ac,
      hit,
      crit,
      damage,
      defenderBand: hpBand(hp, defender.maxHp),
      defenderDown: hp <= 0,
    },
  };
}

export function applyCombatantPatch(
  encounter: Encounter,
  combatantId: string,
  patch: Partial<Combatant>,
): Encounter {
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.id === combatantId ? { ...c, ...patch } : c,
    ),
  };
}

export function syncPcCombatants(encounter: Encounter, characters: Character[]): Encounter {
  const byId = new Map(characters.map((c) => [c.id, c]));
  return {
    ...encounter,
    combatants: encounter.combatants.map((c) => {
      if (c.side !== "pc" || !c.characterId) return c;
      const ch = byId.get(c.characterId);
      if (!ch) return c;
      return {
        ...c,
        name: ch.name,
        hp: ch.hp,
        maxHp: ch.maxHp,
        ac: pcArmorClass(ch),
        atkBonus: pcAttackBonus(ch),
        dex: ch.attributes.DEX ?? c.dex,
      };
    }),
  };
}

export function formatAttackLine(result: AttackResult): string {
  const sign = result.bonus >= 0 ? "+" : "";
  const outcome = result.crit
    ? "critique"
    : result.hit
      ? "touche"
      : "rate";
  const after = result.hit
    ? `, ${HP_BAND_LABELS[result.defenderBand]}`
    : "";
  return `${result.attackerName} — d20 = ${result.d20} ${sign}${result.bonus} = ${result.total} vs CA ${result.ac} → ${outcome}${after}`;
}

export function encounterSummaryForPrompt(encounter: Encounter | null | undefined): string {
  if (!encounter?.active) return "";
  const cur = currentCombatant(encounter);
  const lines = encounter.combatants.map((c, i) => {
    const mark = i === encounter.turnIndex ? " ←" : "";
    const band = HP_BAND_LABELS[hpBand(c.hp, c.maxHp)];
    return `- ${c.name} (${c.side}, init ${c.initiative}, ${band})${mark}`;
  });
  return `Round ${encounter.round}. Tour: ${cur?.name ?? "?"}.\n${lines.join("\n")}`;
}

const OFFENSIVE =
  /\b(attaque|frappe|plante|tue|charge|tranche|perfore|vise|tire|assomme|pourfend|cogne|tabasse|balaye|transperce|lame|épée|hache|coup)\b/i;

export function isOffensiveAction(text: string): boolean {
  const t = text
    .trim()
    .replace(/^\[Dialogue[^\]]*\]\s*/i, "")
    .trim();
  return OFFENSIVE.test(t);
}

export function emptyEncounter(): Encounter | null {
  return null;
}

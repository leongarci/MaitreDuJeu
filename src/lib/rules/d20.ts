import type { Attribute, Attributes, DiceResult } from "@/lib/types";
import { ATTRIBUTES } from "@/lib/types";

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function randomIntInclusive(maxExclusive: number): number {
  const n = Math.floor(maxExclusive);
  if (n <= 1) return 0;
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    return Math.floor(Math.random() * n);
  }
  const span = 256 - (256 % n);
  const buf = new Uint8Array(1);
  for (;;) {
    cryptoObj.getRandomValues(buf);
    const v = buf[0]!;
    if (v < span) return v % n;
  }
}

/** Uniform integer in [1, sides] via rejection sampling (no modulo bias). */
export function rollDie(sides: number): number {
  const n = Math.max(1, Math.floor(sides));
  return randomIntInclusive(n) + 1;
}

export function clampD20(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(20, Math.max(1, Math.round(value)));
}

/** 4d6 drop lowest */
export function rollAbilityScore(): number {
  const rolls = [rollDie(6), rollDie(6), rollDie(6), rollDie(6)];
  rolls.sort((a, b) => a - b);
  return rolls[1]! + rolls[2]! + rolls[3]!;
}

export function rollRandomAttributes(): Attributes {
  return ATTRIBUTES.reduce((acc, attr) => {
    acc[attr] = rollAbilityScore();
    return acc;
  }, {} as Attributes);
}

export function defaultAttributes(): Attributes {
  return { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 };
}

export function startingHp(constitution: number): number {
  return 10 + abilityModifier(constitution);
}

export function resolveCheck(
  attributes: Attributes,
  attribute: Attribute,
  dc: number,
  forcedD20?: number,
): DiceResult {
  const d20 =
    forcedD20 === undefined ? rollDie(20) : clampD20(forcedD20);
  const modifier = abilityModifier(attributes[attribute]);
  const total = d20 + modifier;
  const criticalSuccess = d20 === 20;
  const criticalFailure = d20 === 1;
  const success = criticalSuccess
    ? true
    : criticalFailure
      ? false
      : total >= dc;

  return {
    d20,
    modifier,
    total,
    attribute,
    dc,
    success,
    criticalSuccess,
    criticalFailure,
  };
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function formatCheckRoll(result: DiceResult): string {
  const sign = result.modifier >= 0 ? "+" : "";
  const outcome = result.criticalSuccess
    ? "réussite critique"
    : result.criticalFailure
      ? "échec critique"
      : result.success
        ? "réussite"
        : "échec";
  return `Jet ${result.attribute} DD ${result.dc} — d20 = ${result.d20} ${sign}${result.modifier} → ${result.total} (${outcome})`;
}

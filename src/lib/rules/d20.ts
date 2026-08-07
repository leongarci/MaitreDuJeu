import type { Attribute, Attributes, DiceResult } from "@/lib/types";
import { ATTRIBUTES } from "@/lib/types";

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
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
  const d20 = forcedD20 ?? rollDie(20);
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

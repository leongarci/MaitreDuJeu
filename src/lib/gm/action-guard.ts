/** Ultra-vague inputs that must not trigger invented plans or dice. */
const VAGUE_ACTION =
  /^(oui+|ok|okay|ouais|yep|yes|d['’]?accord|vas[- ]y|allez|on y (va|go|fonce)|j['’]?y vais|pourquoi pas|carrément|bien s[uû]r|ok go|go|let'?s go)[!?.…]*$/i;

export function isVaguePlayerAction(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length < 3) return true;
  if (VAGUE_ACTION.test(t)) return true;
  // Single affirmation word / very short without a verb of action
  if (t.split(/\s+/).length <= 2 && !/\b(je|j['’]|on|nous|essaie|tente|attaque|parle|fouille|ouvre|vole|sabote|cache|court|plonge|atterr)/i.test(t)) {
    return VAGUE_ACTION.test(t) || /^(oui|non|ok)[!?.…]*$/i.test(t);
  }
  return false;
}

export const VAGUE_ACTION_HINT =
  "Dis une action concrète (quoi + comment). Ex. « Je plonge vers la propriété » ou « Je sabote discrètement la valve du barbecue » — pas seulement « oui » / « on y fonce ».";

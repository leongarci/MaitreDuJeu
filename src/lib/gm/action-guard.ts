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

/**
 * Questions / meta OOC to the GM — must not consume the turn.
 * "Je l'attaque ?" reste une action ; "Est-ce que je peux… ?" / "C'est quoi… ?" non.
 */
export function isPlayerQuestionToGm(text: string): boolean {
  const body = text
    .trim()
    .replace(/^\[Dialogue[^\]]*\]\s*/i, "")
    .replace(/\s*\[avec:[^\]]*\]\s*$/i, "")
    .trim();
  if (!body) return false;

  const hasQ = /\?/.test(body);
  const metaStart =
    /^(mj\b|ma[iî]tre(?:\s+du\s+jeu)?\b|question\b|info\b|rappelle[- ]moi|au fait\b)/i.test(
      body,
    );
  const questionStart =
    /^(est[- ]ce que|qui\b|quoi\b|o[uù]\b|comment\b|pourquoi\b|combien\b|quand\b|quel(?:le|s|les)?\b|peux[- ]tu|peut[- ]on|puis[- ]je|peux[- ]je|c['’]est quoi|qu['’]est[- ]ce|y a[- ]t[- ]il|as[- ]tu|avez[- ]vous)/i.test(
      body,
    );
  const permission =
    /\b(puis[- ]je|peux[- ]je|est[- ]ce que je (peux|puis|suis)|on (peut|pourrait)|ai[- ]je le droit|j['’]ai le droit)\b/i.test(
      body,
    );

  if (metaStart || questionStart) return true;
  if (hasQ && permission) return true;
  // Question without leading "je/on" action declaration
  if (hasQ && !/^(je |j['’]|on |nous )/i.test(body)) return true;
  return false;
}
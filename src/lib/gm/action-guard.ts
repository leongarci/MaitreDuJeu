/** Ultra-vague inputs that must not trigger invented plans or dice. */
const VAGUE_ACTION =
  /^(oui+|ok|okay|ouais|yep|yes|d['’]?accord|vas[- ]y|allez|on y (va|go|fonce)|j['’]?y vais|pourquoi pas|carrément|bien s[uû]r|ok go|go|let'?s go)[!?.…]*$/i;

const HYPE_FILLER =
  /\b(allons[- ]y|les amis|c['’]est parti|let'?s go|allez(?:[- ]y)?|on y (va|go|fonce)|ok go|go|ok|okay|oui+|ouais)\b/gi;

const CONCRETE_VERB =
  /\b(je|j['’]|attaque|fouille|ouvre|parle|examine|cherche|saute|frappe|plante|cours|court|plonge|sabote|cache|tire|vise|écoute|observe|prend|prends|donne|jette)\b/i;

export function isVaguePlayerAction(text: string): boolean {
  const t = text
    .trim()
    .replace(/^\[Dialogue[^\]]*\]\s*/i, "")
    .replace(/\s*\[avec:[^\]]*\]\s*$/i, "")
    .trim();
  if (!t) return true;
  if (t.length < 3) return true;
  if (VAGUE_ACTION.test(t)) return true;
  const leftover = t
    .replace(HYPE_FILLER, " ")
    .replace(/[,!.…?'"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (leftover.length < 8 && !CONCRETE_VERB.test(t)) return true;
  if (
    t.split(/\s+/).length <= 2 &&
    !CONCRETE_VERB.test(t)
  ) {
    return VAGUE_ACTION.test(t) || /^(oui|non|ok)[!?.…]*$/i.test(t);
  }
  return false;
}

export const VAGUE_ACTION_HINT =
  "Dis une action concrète (quoi + comment). Ex. « Je plonge vers la propriété » ou « Je sabote discrètement la valve du barbecue » — pas seulement « oui » / « on y fonce ».";

const RISKY_WE =
  /\b(attaque|saute|jette|combat|tue|frappe|charge|explose|purifi|exécut|defonc|défonc|plante|lame|épée|bond|étrangle|égorge|assomme)\b/i;

/** "On saute / on attaque" without joint checkboxes — only the active PC should act. */
export function isRiskyWeAction(text: string): boolean {
  const t = text
    .trim()
    .replace(/^\[Dialogue[^\]]*\]\s*/i, "")
    .trim();
  if (!/^(on |nous )/i.test(t) && !/\bavec\b/i.test(t)) return false;
  return RISKY_WE.test(t);
}

export const RISKY_WE_HINT =
  "Coche « Avec » pour une action à plusieurs — sinon seul le personnage actif agit.";

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
  if (hasQ && !/^(je |j['’]|on |nous )/i.test(body)) return true;
  return false;
}

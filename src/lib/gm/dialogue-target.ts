/** Turn raw ids (`pj:c68…`, `pnj_grand_pretre`) into player-facing labels. */
export function humanizeDialogueTo(
  to: string,
  characters: Array<{ id: string; name: string }>,
  nodes: Array<{ id: string; name: string }>,
): string {
  const raw = to.trim();
  if (!raw) return raw;
  if (/^groupe$/i.test(raw)) return "groupe";

  const prefixed = raw.match(/^(pj|pnj)[_:](.+)$/i);
  if (prefixed) {
    const kind = prefixed[1]!.toLowerCase();
    const key = prefixed[2]!.trim();
    if (kind === "pj") {
      const hit =
        characters.find((c) => c.id === key) ||
        characters.find((c) => c.name.toLowerCase() === key.toLowerCase());
      return hit ? `pj:${hit.name}` : `pj:${key}`;
    }
    const hit =
      nodes.find((n) => n.id === raw || n.id === key || n.id === `pnj_${key}`) ||
      nodes.find((n) => n.name.toLowerCase() === key.toLowerCase()) ||
      nodes.find((n) => n.id.toLowerCase().includes(key.toLowerCase()));
    if (hit) return `pnj:${hit.name}`;
    return `pnj:${key.replace(/_/g, " ")}`;
  }

  const asChar = characters.find((c) => c.id === raw);
  if (asChar) return `pj:${asChar.name}`;
  const asNode = nodes.find((n) => n.id === raw);
  if (asNode) return `pnj:${asNode.name}`;
  return raw;
}

export function looksLikeInternalId(value: string): boolean {
  return /^(pj|pnj)[_:][A-Za-z0-9_-]{8,}$/i.test(value.trim()) ||
    /^[A-Za-z0-9_-]{16,}$/.test(value.trim());
}

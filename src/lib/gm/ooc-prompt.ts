import type { GmOocRequest } from "@/lib/types";

export function buildOocSystemPrompt(): string {
  return `Tu es le Maître du Jeu, HORS TABLE, en train de parler aux joueurs (pas aux personnages).
Tu parles en français, à la 2e personne, comme un MJ humain à côté de la table.

Règles:
- JAMAIS incarner un PNJ. JAMAIS de narration de scène. JAMAIS de jet, de tour, de graphe.
- Réponds aux questions de règles, d'UI, et à ce que les PJ savent DÉJÀ (historique de table, fiches, faits révélés).
- AUCUN spoiler: pas de secrets, notes MJ, twists, contenu non révélé, « ce qu'il y a vraiment sous… » s'ils ne l'ont pas découvert en jeu.
- Si on te demande un secret: « Vous ne le savez pas encore — il faudra le découvrir en jeu. »
- Si la question porte sur un bug / un perso fantôme / l'interface: réponds hors-fiction, clairement.
- Sois concis (2 à 8 phrases).
- En combat: tu peux parler d'initiative, de CA connue, de bandes (intact / blessé / mal en point / à terre). JAMAIS les PV chiffrés des ennemis.

JSON: { "answer": "string" }`;
}

export function buildOocUserPrompt(req: GmOocRequest): string {
  const chars = req.characters
    .map((c) => `- ${c.name} PV ${c.hp}/${c.maxHp}`)
    .join("\n");
  const table = req.recentTable
    .map((m) => `${m.speaker}: ${m.text}`)
    .join("\n");
  const ooc = req.recentOoc
    .map((m) => `${m.speaker}: ${m.text}`)
    .join("\n");

  return `Campagne: ${req.campaign.title}
Résumé connu des joueurs: ${req.campaign.sessionSummary || "(début)"}
Étape (titre seulement, pas les secrets): curseur ${req.campaign.scenarioCursor}

=== FICHES (PV visibles) ===
${chars || "(aucun)"}

=== FAITS DÉJÀ CONNUS / RÉVÉLÉS ===
${req.knownFacts || "(rien de plus)"}

=== DERNIERS ÉCHANGES DE TABLE ===
${table || "(aucun)"}

=== CHAT HORS-JEU RÉCENT ===
${ooc || "(aucun)"}

Question du joueur:
${req.question}`;
}

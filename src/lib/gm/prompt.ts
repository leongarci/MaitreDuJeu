import { formatLoreForPrompt } from "@/lib/lore/retrieve";
import { lorePackToPromptLines } from "@/lib/rag/retrieve";
import { formatBeatsForPrompt } from "@/lib/scenario/beats";
import type { GmTurnRequest } from "@/lib/types";

export function buildSystemPrompt(): string {
  return `Tu es le Maître du Jeu (MJ) d'une partie de JDR sur table.
Tu parles en français.

## UNE RÉPONSE PUIS STOP
Un seul message. Pas de second tour automatique.

## INTERDICTION ABSOLUE — NE PAS JOUER À LA PLACE DES PJ
Tu n'inventes JAMAIS les actions, tactiques ou détails que le joueur n'a pas écrits.
- Interdit: inventer un plan si le joueur ne l'a pas dit.
- Interdit: enchaîner plusieurs gestes inventés après un "oui", "ok", "on y va".
- Si l'action est vague: demande "Comment fais-tu exactement ?" et STOP. propose_check=null. consume_turn=false.
- Tu ne racontes que les conséquences DIRECTES de ce qui est EXPLICITEMENT déclaré.
- Après résolution: résultat de CETTE action seule, puis "Que faites-vous ?" — sans inventer la suite.

## AUTORITÉ DU MONDE
Le joueur déclare une INTENTION, pas un fait.
- « Je réalise que c'est X » / « je découvre que… » = il EXAMINE. Tu dis ce que c'est VRAIMENT selon bible / battement / graphe, ou « tu ne peux pas conclure ».
- Interdit d'accorder un fait inventé, un objet hors cadre du monde, un level-up, une transformation divine, une trahison/mort de PNJ non établie, un « c'était une blague / il se réveille ».
- Les PV listés dans PERSONNAGES sont la source de vérité. Un blessé reste blessé. À 0 PV le PJ est à terre : il n'agit plus, tu ne le fais pas sprinter, sauter, canaliser une attaque.
- Toute blessure ou soin narré DOIT avoir un hp_updates. Tout objet gagné/perdu DOIT avoir un inventory_updates.
- Si une règle de fiction a été énoncée cette session, ne l'annule pas sans cause visible.

## ICI ET MAINTENANT
Le bloc ICI ET MAINTENANT est la vérité. Interdit:
- rejouer une scène déjà close
- inventer un second exemplaire du lieu actuel
- gaslighter les joueurs sur l'endroit où ils sont (s'ils disent « on y est déjà », ils ont raison si le bloc le confirme)
session_summary_update: rappelle lieu + situation à chaque tour utile.

## AUTRES PJ
- Action risquée / combat / interaction : uniquement le PJ actif + les noms de Action collective (s'il y en a).
- Un « on » de déplacement évident (suivre un guide ensemble, entrer par la même porte) peut avancer le GROUPE ACTIF.
- Jamais inventer les gestes, paroles ou déplacements d'un PJ qui n'est pas dans cette liste.
- Une réplique de dialogue = paroles du PJ actif, pas un ordre pour un autre PJ.

## PNJ
Les PNJ ont des objectifs, de l'information, et varient. Pas un disque de mépris.
N'invente pas de « test » grimdark (exécuter un innocent, humiliation gratuite) sauf si le battement / la bible le demandent. Offre une alternative jouable.

## CONTENU
Violence sexuelle, profanation de cadavre, torture : fade-to-black. Constate l'intention, zéro détail graphique, reprends une situation jouable.

## RYTHME
Les joueurs ne connaissent PAS le scénario.
Tant que la CONDITION DE PASSAGE du battement courant n'est PAS remplie: advance_scenario=0, « Que faites-vous ? ».
Quand elle est CLAIREMENT remplie par ce que les PJ ont fait (pas par ce que tu as inventé): advance_scenario=1 possible, conclus seulement le battement courant.
En cas de doute → 0. Un simple trajet ne brûle pas la scène suivante.

## TRAME / BIBLE
Joue le BATTLEMENT COURANT. playerText seulement s'il correspond à la situation actuelle.
secrets: ne révèle QUE si les PJ l'ont mérité.
Fiches: summary + mjNotes pour incarner ; secrets cachés.

## JETS — CONTRAT STRICT
propose_check UNIQUEMENT si action ACTIVE, CONCRÈTE et RISQUÉE.
SI tu poses un jet:
- narration = ENJEU seulement (qui tente quoi). INTERDIT: réussite, échec, blessure, loot, mort, déplacement abouti, réaction finale d'un PNJ.
- propose_check.reason = l'action DU JOUEUR.
- hp_updates=[], inventory_updates=[], update_graph vide, party_split=null, play_asset=null, advance_scenario=0, ask_dialogue=null, location_update=null.
Le résultat s'écrit UNIQUEMENT après le dé (mode resolve_check), pour CE PJ et CETTE action. Pas les autres PJ.

Vague / confirmation → propose_check=null, demande des précisions.

## GRAPHE
category: social | spatial | plot | inventory. affinity -3..+3.

## DIALOGUE (ask_dialogue)
Situations sociales seulement. to = nom lisible (« pnj:Nom » / « pj:Nom » / « groupe »), JAMAIS un id technique.

## RÉPLIQUES
narration = texte EXACT affiché.
speech_lines optionnel: découpe orale courte. speaker = narrator | pnj:Nom | pj:Nom.
Si speech_lines est non vide, il est lu à la place de la narration (doit couvrir tout le parlé).
Sinon speech_lines=[] et la narration entière est lue par le narrateur.

## SOUS-GROUPES
party_split seulement si le groupe se sépare ou se réunit vraiment. Tous les PJ listés.

## TOUR
consume_turn=true pour une vraie action fictionnelle.
consume_turn=false si question au MJ, demande de précision, ou info perceptible sans action.

## LIEU
location_update.hint = nom court du lieu actuel du groupe actif (chaque fois que le lieu change ou pour confirmer où ils sont).

## AFFRONTEMENT
Si la fiction bascule en combat (hostiles qui attaquent, les PJ dégagent, embuscade):
- start_encounter = { hostiles: [{ name, profile, count }] }
- profile: minion | brute | skirmisher | elite (générique, pas de stats inventées)
- count: nombre d'individus du même type (1–8)
N'invente PAS les jets, CA, dégâts ou tours ennemis — le moteur local s'en charge.

Si un AFFRONTEMENT est déjà ACTIF dans le user prompt:
- INTERDIT de résoudre une attaque ennemie dans narration
- INTERDIT de raconter qu'un hostile frappe / rate / tue
- end_encounter=true seulement si fuite, reddition, ou plus d'hostiles en fiction
- Les attaques PJ vs CA sont déjà calculées (resolve_attack) : paraphraser le résultat fourni

JSON:
{
  "narration": "string",
  "propose_check": null | { "attribute": "FOR"|"DEX"|"CON"|"INT"|"SAG"|"CHA", "dc": number, "reason": "string" },
  "update_graph": {
    "nodes": [{ "id": "string", "type": "lieu"|"pnj"|"objet"|"quete"|"fait"|"faction"|"pj", "name": "string", "description": "string", "mjNotes": "string", "revealed": true }],
    "edges": [{ "fromId": "string", "toId": "string", "relation": "string", "category": "social", "affinity": 0, "revealed": true }]
  },
  "play_asset": null | { "assetId": "string" },
  "session_summary_update": null | "string",
  "advance_scenario": 0,
  "speech_lines": [],
  "ask_dialogue": null | { "fromCharacterId": "string", "to": "pnj:Nom"|"pj:Nom"|"groupe", "prompt": "Que dis-tu à … ?" },
  "party_split": null | { "reason": "string", "groups": [{ "label": "string", "characterNames": ["Nom"], "locationHint": "string" }] },
  "consume_turn": true,
  "inventory_updates": [{ "characterId": "string", "characterName": "string", "add": ["objet"], "remove": ["objet"] }],
  "hp_updates": [{ "characterId": "string", "characterName": "string", "hp": 0, "delta": 0 }],
  "location_update": null | { "hint": "string" },
  "start_encounter": null | { "hostiles": [{ "name": "string", "profile": "minion"|"brute"|"skirmisher"|"elite", "count": 1 }] },
  "end_encounter": false
}`;
}

function hereNowBlock(req: GmTurnRequest): string {
  const h = req.hereNow;
  if (!h) return "";
  const present = (h.presentNames ?? []).join(", ") || "(groupe actif)";
  return `
=== ICI ET MAINTENANT (source de vérité — ne pas contredire) ===
Lieu: ${h.locationHint?.trim() || "(non précisé)"}
Battement: ${h.beatTitle?.trim() || "(aucun)"}
Présents: ${present}
Dernière narration MJ: ${h.lastGmNarration?.trim() || "(aucune)"}
Interdit: téléporter le groupe, dupliquer ce lieu, faire comme si une scène close n'avait pas eu lieu.
`;
}

function encounterBlock(req: GmTurnRequest): string {
  if (!req.encounterSummary?.trim()) return "";
  return `
=== AFFRONTEMENT (actif — source de vérité) ===
${req.encounterSummary}
Interdit: résoudre les attaques ennemies ici. Ne révèle pas de PV chiffrés ennemis, seulement les bandes déjà listées.
`;
}

export function buildUserPrompt(req: GmTurnRequest): string {
  const active = req.characters.find((c) => c.id === req.activeCharacterId);
  const charLines = req.characters
    .map((c) => {
      const attrs = Object.entries(c.attributes)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
      const inv = c.inventory.length
        ? c.inventory.join(", ")
        : "VIDE — aucun objet";
      const down = c.hp <= 0 ? " — À TERRE (n'agit plus)" : "";
      return `- ${c.name} (id=${c.id}) PV ${c.hp}/${c.maxHp}${down} | ${attrs}\n  Inventaire: ${inv}`;
    })
    .join("\n");

  const knownIds = new Set(req.characters.map((c) => c.id));
  const history = req.recentMessages
    .filter((m) => m.role === "gm" || m.role === "player")
    .map((m) => {
      const who =
        m.role === "gm"
          ? "MJ"
          : (m.characterId && knownIds.has(m.characterId)
              ? req.characters.find((c) => c.id === m.characterId)?.name
              : null) || "Joueur";
      return `${who}: ${m.text}`;
    })
    .join("\n");

  const beats = formatBeatsForPrompt(req.scenarioBeats ?? []);
  const bible = formatLoreForPrompt(req.loreEntries ?? []);
  const lore = lorePackToPromptLines(req.pdfChunks ?? []);

  const nodes = req.graphNodes
    .map(
      (n) =>
        `- [${n.type}] ${n.id}: ${n.name} — ${n.description}${
          n.mjNotes ? ` | MJ: ${n.mjNotes}` : ""
        }${n.revealed === false ? " (non révélé)" : ""}`,
    )
    .join("\n");
  const edges = req.graphEdges
    .map(
      (e) =>
        `- ${e.fromId} -[${e.relation}/${e.category || "social"}/aff:${e.affinity ?? 0}]-> ${e.toId}${
          e.revealed === false ? " (secret)" : ""
        }`,
    )
    .join("\n");

  const assets = req.assets
    .map((a) => `- ${a.id} (${a.type}) "${a.name}"`)
    .join("\n");

  const waiting = (req.waitingCharacterNames ?? []).join(", ") || "(personne)";
  const acted = (req.actedCharacterNames ?? []).join(", ") || "(personne)";
  const joint = (req.jointParticipantNames ?? []).join(", ");
  const otherGroups = (req.otherPartyGroups ?? [])
    .map((g) => `- ${g.label}: ${g.characterNames.join(", ")}`)
    .join("\n");

  const shared = `Campagne: ${req.campaign.title}
Résumé: ${req.campaign.sessionSummary || "(début)"}
Curseur battement: ${req.campaign.scenarioCursor}
Groupe actif: ${req.activePartyGroupLabel || "Groupe"}
Tour — déjà joué: ${acted}
Tour — encore à jouer: ${waiting}
${joint ? `Action collective: ${joint}` : ""}
${otherGroups ? `Autres sous-groupes (hors scène — ne pas les faire intervenir):\n${otherGroups}` : "Pas d'autre sous-groupe."}
${hereNowBlock(req)}
${encounterBlock(req)}
=== PERSONNAGES (groupe actif uniquement) ===
${charLines}
Actif: ${active?.name ?? "?"}
PV: source de vérité. 0 = à terre.
Règle: inventaires non partageables avec un autre sous-groupe.

=== BATTLEMENTS STRUCTURÉS ===
${beats}

=== BIBLE DE RÉFÉRENCE (pertinente ce tour) ===
${bible}

=== GRAPHE ===
${nodes || "(vide)"}
${edges || ""}

=== ASSETS ===
${assets || "(aucun)"}

=== EXTRAITS PDF (secours) ===
${lore}`;

  if (req.mode === "intro") {
    return `${shared}

MODE: intro — propose_check=null, advance_scenario=0, party_split=null, consume_turn=false, inventory_updates=[], hp_updates=[], location_update si le lieu d'ouverture est connu, UNE narration
Structure OBLIGATOIRE de la narration (dans cet ordre):
1) MISE EN CONTEXTE DE L'UNIVERS — 2 à 4 phrases: ton / époque / genre. Base-toi sur le PDF, les battlements et la bible. Pas de spoilers.
2) QUI SONT LES HÉROS — présente CHAQUE PJ nommé dans === PERSONNAGES ===.
3) SCÈNE D'OUVERTURE — lieu, ambiance, maintenant (battlement courant). Mission de départ si elle figure dans playerText/objectif.
4) Relance: "Que faites-vous ?" puis STOP.

N'invente AUCUNE action des PJ. Ils n'ont encore rien fait. Ne brûle pas la suite.`;
  }

  if (req.mode === "relance") {
    return `${shared}

MODE: relance manuelle — UNE narration, propose_check=null, advance_scenario=0, consume_turn=false, inventory_updates=[], hp_updates=[]
Débloque sans inventer d'actions PJ. Relance: "Que faites-vous ?"
Historique:
${history || "(début)"}`;
  }

  if (req.mode === "resolve_npc" && req.attackResult) {
    const a = req.attackResult;
    return `${shared}

MODE: resolve_npc — propose_check=null, start_encounter=null, hp_updates=[], inventory_updates=[], consume_turn=false
Résultat DÉJÀ calculé (ne pas le changer):
${a.attackerName} attaque ${a.defenderName}. d20=${a.d20} total=${a.total} vs CA ${a.ac}. ${a.hit ? "TOUCHE" : "RATE"}${a.crit ? " (critique)" : ""}. Cible: ${a.defenderBand}${a.defenderDown ? ", à terre" : ""}.
Paraphrase en 2 phrases. INTERDIT d'inventer un autre coup, un autre jet, ou un autre blessé.
Historique:
${history || "(début)"}`;
  }

  if (req.mode === "resolve_attack" && req.attackResult) {
    const a = req.attackResult;
    return `${shared}

MODE: resolve_attack — propose_check=null, hp_updates=[], consume_turn=true
Attaque PJ DÉJÀ calculée: ${a.attackerName} → ${a.defenderName}. d20=${a.d20} total=${a.total} vs CA ${a.ac}. ${a.hit ? "TOUCHE" : "RATE"}${a.crit ? " (critique)" : ""}. Cible: ${a.defenderBand}${a.defenderDown ? ", à terre" : ""}.
Action déclarée: "${req.action || a.attackerName}"
Paraphrase UNIQUEMENT ce résultat. Pas d'attaque ennemie en retour. Pas de PV chiffrés.
Historique:
${history || "(début)"}`;
  }

  if (req.mode === "resolve_check" && req.checkResult) {
    const r = req.checkResult;
    return `${shared}

MODE: resolve_check — propose_check=null, consume_turn=true — UNE narration STOP
Action déclarée (SEULE source, UN seul PJ — ${active?.name ?? "?"}): "${r.actionContext}"
Jet: ${r.attribute} DD${r.dc} d20=${r.d20} total=${r.total} succès=${r.success} (raison: ${r.reason})
Raconte UNIQUEMENT le résultat de CETTE action pour CE personnage.
INTERDIT: résoudre les actions d'autres PJ, même s'ils sont cités dans l'historique.
Si blessure/soin: hp_updates OBLIGATOIRE. Si objet: inventory_updates OBLIGATOIRE.
Si CE résultat déclenche un combat: start_encounter.
INTERDIT d'ajouter des gestes / un plan que le joueur n'a pas écrits.
advance_scenario=1 seulement si la transition est clairement remplie par CE résultat ; sinon 0 + "Que faites-vous ?"
Ne commence pas le battement suivant.
Historique:
${history || "(début)"}`;
  }

  return `${shared}

MODE: action — UNE narration STOP
Message EXACT de ${active?.name} (ne rien y ajouter): "${req.action}"
Si QUESTION au MJ / permission / info OOC → réponds brièvement, consume_turn=false, propose_check=null, advance_scenario=0, inventory_updates=[], hp_updates=[].
Si vague / confirmation seule → "Comment fais-tu exactement ?" propose_check=null, consume_turn=false. advance_scenario=0.
Si concrète et RISQUÉE (hors attaque déjà gérée) → propose_check + narration d'ENJEU seulement.
Si concrète et sans jet → conséquences directes seulement. consume_turn=true.
Si le combat DOIT commencer: start_encounter (noms + profils + count).
Objets → inventory_updates. Blessures/soins → hp_updates. Lieu → location_update.
advance_scenario=1 SEULEMENT si la transition est clairement remplie ; sinon 0 et "Que faites-vous ?"
Historique:
${history || "(début)"}`;
}

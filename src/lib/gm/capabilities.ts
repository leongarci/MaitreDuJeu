export type GmCapability = {
  id: string;
  label: string;
  description: string;
  when: string;
};

/** Catalogue des capacités MJ — reformulable dans l’aide in-app. */
export const GM_CAPABILITIES: GmCapability[] = [
  {
    id: "narrate",
    label: "Narration",
    description: "Décrire la scène et les conséquences des actions.",
    when: "Toujours (champ narration)",
  },
  {
    id: "propose_check",
    label: "Jet de dés",
    description: "Proposer un jet d20 (attribut + DD + raison).",
    when: "Action active, concrète et risquée",
  },
  {
    id: "ask_dialogue",
    label: "Demande de dialogue",
    description:
      "Demander ce que le PJ dit à un PNJ, un autre PJ ou le groupe.",
    when: "Situation sociale adaptée (négociation, mensonge, ordre, conversation)",
  },
  {
    id: "ask_clarify",
    label: "Demande de précision",
    description: "Demander comment le PJ agit exactement (sans passer le tour).",
    when: "Action vague ou confirmation seule — consume_turn=false",
  },
  {
    id: "consume_turn",
    label: "Consommer le tour",
    description:
      "false pour questions au MJ / précisions ; true pour une vraie action.",
    when: "Chaque réponse action",
  },
  {
    id: "inventory_updates",
    label: "Inventaire",
    description: "Ajouter/retirer des objets sur la fiche du PJ.",
    when: "Loot, don, perte, consommation d’objet",
  },
  {
    id: "hp_updates",
    label: "Points de vie",
    description: "Appliquer dégâts / soins. 0 PV = hors combat.",
    when: "Toute blessure ou soin narré",
  },
  {
    id: "location_update",
    label: "Lieu actuel",
    description: "Ancrer le groupe actif dans un lieu nommé.",
    when: "Changement de lieu ou confirmation",
  },
  {
    id: "ooc_chat",
    label: "Chat hors-jeu",
    description: "Répondre aux questions de table sans PNJ ni tour.",
    when: "Panneau Hors-jeu — règles, UI, savoir déjà acquis",
  },
  {
    id: "speech_lines",
    label: "Répliques vocales",
    description:
      "Narrateur VoiceStudio (Mimir) ou Pollinations ; PNJ/PJ via Pollinations si speech_lines.",
    when: "Toujours ; speech_lines optionnel",
  },
  {
    id: "party_split",
    label: "Sous-groupes",
    description:
      "Séparer ou reformer le groupe (MJ ou joueurs). Isolation inventaire/actions.",
    when: "Histoire ou décision des PJ — party_split",
  },
  {
    id: "update_graph",
    label: "Graphe relationnel",
    description: "Mettre à jour lieux, PNJ, relations, affinités.",
    when: "Changement d’état social ou spatial",
  },
  {
    id: "reveal_secret",
    label: "Révélation",
    description: "Révéler un secret ou une info lore méritée.",
    when: "Condition de révélation remplie par les PJ",
  },
  {
    id: "advance_scenario",
    label: "Avancer l’étape",
    description: "Fermer le battement courant (avec garde-fous locaux).",
    when: "Condition de passage clairement remplie",
  },
  {
    id: "play_asset",
    label: "Media importé",
    description: "Afficher une image ou jouer un audio importé.",
    when: "Asset connu dans la campagne",
  },
  {
    id: "session_summary_update",
    label: "Résumé de session",
    description: "Mettre à jour le résumé de situation pour la mémoire.",
    when: "Fin de séquence utile",
  },
  {
    id: "start_encounter",
    label: "Affrontement",
    description:
      "Démarrer un combat (fiches, CA, initiative). Les tours ennemis sont locaux.",
    when: "Hostiles qui passent à l’attaque — start_encounter",
  },
  {
    id: "stay_and_wait",
    label: "Laisser jouer",
    description: "Rester sur l’étape et relancer « Que faites-vous ? ».",
    when: "Défaut — tant que la transition n’est pas remplie",
  },
];

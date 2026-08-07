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
    description: "Demander comment le PJ agit exactement.",
    when: "Action vague ou confirmation seule",
  },
  {
    id: "speech_lines",
    label: "Répliques vocales",
    description: "Voix unique Mimir (VoiceStudio) — texte affiché = texte lu.",
    when: "Toujours ; speech_lines optionnel / ignoré à l'oral",
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
    id: "stay_and_wait",
    label: "Laisser jouer",
    description: "Rester sur l’étape et relancer « Que faites-vous ? ».",
    when: "Défaut — tant que la transition n’est pas remplie",
  },
];

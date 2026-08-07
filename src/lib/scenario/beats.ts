import type { ScenarioBeat, ScenarioBeatPrompt } from "@/lib/types";

export function beatsForPrompt(
  beats: ScenarioBeat[],
  cursor: number,
  windowAfter = 1,
): ScenarioBeatPrompt[] {
  const ordered = [...beats].sort((a, b) => a.order - b.order);
  if (ordered.length === 0) return [];
  const idx = Math.min(Math.max(0, cursor), ordered.length - 1);
  const slice = ordered.slice(idx, Math.min(ordered.length, idx + 1 + windowAfter));
  return slice.map((b, i) => {
    const isCurrent = i === 0;
    // Next beat: title + transition only — avoids the MJ narrating / jumping ahead.
    if (!isCurrent) {
      return {
        order: b.order,
        title: b.title,
        playerText: "",
        mjNotes: "(aperçu seulement — ne pas jouer cette scène tant que non atteinte)",
        secrets: b.secrets
          ? "(secrets scellés — ne pas révéler)"
          : "",
        transition: b.transition,
        objective: b.objective ? `(prochaine étape) ${b.objective}` : "",
        isCurrent: false,
      };
    }
    return {
      order: b.order,
      title: b.title,
      playerText: b.playerText,
      mjNotes: b.mjNotes,
      secrets: b.secrets,
      transition: b.transition,
      objective: b.objective,
      isCurrent: true,
    };
  });
}

export function formatBeatsForPrompt(beats: ScenarioBeatPrompt[]): string {
  if (beats.length === 0) {
    return "(aucun battement structuré — utilise les extraits PDF en secours)";
  }
  return beats
    .map((b) => {
      const tag = b.isCurrent ? "BATTLEMENT COURANT" : "BATTLEMENT SUIVANT (aperçu)";
      return `[${tag} #${b.order + 1} — ${b.title}]
Objectif MJ: ${b.objective || "(non précisé)"}
Texte joueurs (fidèle):
${b.playerText || "(vide)"}
Notes MJ (politique de rythme / mise en scène — SUIS-LES):
${b.mjNotes || "(aucune — laisse jouer tant que la transition n'est pas remplie)"}
Secrets:
${b.secrets || "(aucun)"}
Condition de passage (critère pour advance_scenario=1):
${b.transition || "(non précisée — en doute reste à 0 et laisse les PJ agir)"}`;
    })
    .join("\n\n");
}

import type { ScenarioBeat } from "@/lib/types";

/** Next beat text that assumes the party already did things not yet played. */
const PREMATURE_SCENE =
  /\b(alors que vous|tandis que vous|pendant que vous|après avoir|après que vous|une fois (que )?vous|au milieu (de la fête|des invités|du chaos)|alors que tu|tandis que les? p[jh]|après votre (arrivée|succès)|pendant que les? p[jh])\b/i;

/** Minimum player resolutions (action or check) on a beat before it may close. */
export const MIN_ACTIONS_BEFORE_ADVANCE = 2;

/** Extra actions required before entering a beat that assumes mid-scene chaos. */
export const MIN_ACTIONS_BEFORE_PREMATURE_NEXT = 5;

export function nextBeatLooksPremature(beat: ScenarioBeat | undefined): boolean {
  if (!beat) return false;
  const blob = `${beat.title}\n${beat.playerText}\n${beat.objective}\n${beat.mjNotes}`;
  return PREMATURE_SCENE.test(blob);
}

export function gateAdvance(opts: {
  requested: number;
  actionsOnBeat: number;
  nextBeat: ScenarioBeat | undefined;
}): number {
  const want = Math.max(0, Math.min(1, opts.requested));
  if (want !== 1) return 0;
  if (opts.actionsOnBeat < MIN_ACTIONS_BEFORE_ADVANCE) return 0;
  if (
    nextBeatLooksPremature(opts.nextBeat) &&
    opts.actionsOnBeat < MIN_ACTIONS_BEFORE_PREMATURE_NEXT
  ) {
    return 0;
  }
  return 1;
}

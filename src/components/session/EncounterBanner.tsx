"use client";

import {
  currentCombatant,
  HP_BAND_LABELS,
  hpBand,
  living,
} from "@/lib/combat/engine";
import type { Encounter } from "@/lib/types";

type Props = {
  encounter: Encounter;
  targetId: string | null;
  onSelectTarget: (id: string) => void;
};

export function EncounterBanner({ encounter, targetId, onSelectTarget }: Props) {
  if (!encounter.active) return null;
  const cur = currentCombatant(encounter);
  const hostiles = living(encounter, "hostile");

  return (
    <div className="mb-3 space-y-2 rounded-2xl border border-amber/30 bg-amber/8 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.16em] text-amber">
          Affrontement · round {encounter.round}
        </p>
        <p className="text-[11px] text-parchment-dim">
          Tour : {cur?.name ?? "—"}
          {cur ? ` (init ${cur.initiative})` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {encounter.combatants.map((c) => {
          const band = hpBand(c.hp, c.maxHp);
          const isTurn = c.id === cur?.id;
          const down = c.hp <= 0;
          return (
            <span
              key={c.id}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                down
                  ? "border-line/40 text-parchment-dim/50 line-through"
                  : isTurn
                    ? "border-amber bg-amber/20 text-amber"
                    : c.side === "hostile"
                      ? "border-danger/40 text-parchment"
                      : "border-line text-parchment-dim"
              }`}
            >
              {isTurn ? "← " : ""}
              {c.name} · {HP_BAND_LABELS[band]}
            </span>
          );
        })}
      </div>
      {hostiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-parchment-dim">Cible :</span>
          {hostiles.map((c) => {
            const on = c.id === targetId;
            return (
              <button
                key={c.id}
                type="button"
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  on ? "border-amber text-amber" : "border-line text-parchment-dim"
                }`}
                onClick={() => onSelectTarget(c.id)}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

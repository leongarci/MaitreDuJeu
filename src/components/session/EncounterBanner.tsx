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
  /** Bande compacte collée au clavier (téléphone). */
  compact?: boolean;
};

export function EncounterBanner({
  encounter,
  targetId,
  onSelectTarget,
  compact = false,
}: Props) {
  if (!encounter.active) return null;
  const cur = currentCombatant(encounter);
  const hostiles = living(encounter, "hostile");

  if (compact) {
    return (
      <div className="border-t border-amber/25 bg-amber/8 px-3 py-2">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-amber">
            Combat · R{encounter.round}
          </p>
          <p className="min-w-0 truncate text-[11px] text-parchment-dim">
            Tour de {cur?.name ?? "—"}
            {cur ? ` · init ${cur.initiative}` : ""}
          </p>
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {encounter.combatants.map((c) => {
            const band = hpBand(c.hp, c.maxHp);
            const isTurn = c.id === cur?.id;
            const down = c.hp <= 0;
            const isTarget = c.id === targetId;
            const canTarget = c.side === "hostile" && !down;
            const chip = (
              <>
                {isTurn ? "← " : ""}
                {c.name}
                <span className="text-parchment-dim"> · {HP_BAND_LABELS[band]}</span>
              </>
            );
            const cls = `shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${
              down
                ? "border-line/40 text-parchment-dim/50 line-through"
                : isTurn
                  ? "border-amber bg-amber/20 text-amber"
                  : isTarget
                    ? "border-amber text-amber"
                    : c.side === "hostile"
                      ? "border-danger/40 text-parchment"
                      : "border-line text-parchment-dim"
            }`;
            if (canTarget) {
              return (
                <button
                  key={c.id}
                  type="button"
                  className={cls}
                  onClick={() => onSelectTarget(c.id)}
                >
                  {chip}
                </button>
              );
            }
            return (
              <span key={c.id} className={cls}>
                {chip}
              </span>
            );
          })}
        </div>
        {hostiles.length > 0 && (
          <p className="mt-1 text-[10px] text-parchment-dim">
            Cible : {hostiles.find((h) => h.id === targetId)?.name ?? "touche un hostile"}
          </p>
        )}
      </div>
    );
  }

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

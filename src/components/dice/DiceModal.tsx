"use client";

import { useState } from "react";
import { ATTRIBUTE_LABELS, type PendingCheck } from "@/lib/types";

interface Props {
  check: PendingCheck;
  characterName: string;
  busy: boolean;
  onAuto: () => void;
  onManual: (d20: number) => void;
}

export function DiceModal({
  check,
  characterName,
  busy,
  onAuto,
  onManual,
}: Props) {
  const [manual, setManual] = useState(10);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center">
      <div className="panel fade-in w-full max-w-md p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-amber">
          Jet de dé
        </p>
        <h2 className="font-display mt-2 text-2xl text-parchment">
          {characterName}
        </h2>
        <p className="mt-2 text-sm text-parchment-dim">{check.reason}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-ink/50 p-3 text-center">
            <div className="text-xs text-parchment-dim">Caractéristique</div>
            <div className="font-display text-xl text-amber">
              {ATTRIBUTE_LABELS[check.attribute]}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-ink/50 p-3 text-center">
            <div className="text-xs text-parchment-dim">Difficulté</div>
            <div className="font-display text-xl text-parchment">
              DD {check.dc}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary mt-5 w-full"
          disabled={busy}
          onClick={onAuto}
        >
          Lancer automatiquement
        </button>

        <div className="mt-4 border-t border-line pt-4">
          <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-parchment-dim">
            Ou saisir un d20 (jet physique)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={20}
              className="field"
              value={manual}
              onChange={(e) =>
                setManual(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
              }
            />
            <button
              type="button"
              className="btn btn-ghost shrink-0"
              disabled={busy}
              onClick={() => onManual(manual)}
            >
              Valider
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

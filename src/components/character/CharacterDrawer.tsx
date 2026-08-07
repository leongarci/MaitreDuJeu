"use client";

import { abilityModifier, formatModifier } from "@/lib/rules/d20";
import {
  ATTRIBUTE_LABELS,
  ATTRIBUTES,
  type Character,
} from "@/lib/types";

interface Props {
  character: Character;
  open: boolean;
  onClose: () => void;
}

export function CharacterDrawer({ character, open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-sm">
      <button
        type="button"
        className="flex-1"
        aria-label="Fermer"
        onClick={onClose}
      />
      <aside className="panel fade-in h-full w-[min(100%,22rem)] overflow-y-auto rounded-none border-y-0 border-r-0 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-amber">
              Fiche
            </p>
            <h2 className="font-display text-2xl">{character.name}</h2>
          </div>
          <button type="button" className="btn btn-ghost px-3 py-2" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-line bg-ink/40 p-3">
          <div className="text-xs text-parchment-dim">Points de vie</div>
          <div className="font-display text-3xl text-parchment">
            {character.hp}
            <span className="text-lg text-parchment-dim"> / {character.maxHp}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ATTRIBUTES.map((attr) => (
            <div
              key={attr}
              className="rounded-xl border border-line bg-ink/30 p-3"
            >
              <div className="text-xs text-amber">{ATTRIBUTE_LABELS[attr]}</div>
              <div className="font-display text-2xl">{character.attributes[attr]}</div>
              <div className="text-xs text-parchment-dim">
                {formatModifier(abilityModifier(character.attributes[attr]))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-xs uppercase tracking-[0.16em] text-parchment-dim">
            Inventaire
          </h3>
          {character.inventory.length === 0 ? (
            <p className="text-sm text-parchment-dim">Vide</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {character.inventory.map((item) => (
                <li key={item} className="rounded-lg border border-line px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

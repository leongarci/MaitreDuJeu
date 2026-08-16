"use client";

import { useState } from "react";
import {
  abilityModifier,
  defaultAttributes,
  formatModifier,
  rollRandomAttributes,
} from "@/lib/rules/d20";
import {
  ATTRIBUTE_LABELS,
  ATTRIBUTES,
  type Attributes,
} from "@/lib/types";

interface Props {
  onSubmit: (input: {
    name: string;
    mode: "manual" | "random";
    attributes: Attributes;
  }) => void;
}

export function CharacterForm({ onSubmit }: Props) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"manual" | "random">("random");
  const [attributes, setAttributes] = useState<Attributes>(rollRandomAttributes());

  return (
    <div className="panel space-y-4 p-4">
      <label className="block space-y-1.5">
        <span className="text-xs uppercase tracking-[0.16em] text-parchment-dim">
          Nom
        </span>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du héros"
          maxLength={40}
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          className={`btn flex-1 ${mode === "random" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => {
            setMode("random");
            setAttributes(rollRandomAttributes());
          }}
        >
          Aléatoire
        </button>
        <button
          type="button"
          className={`btn flex-1 ${mode === "manual" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => {
            setMode("manual");
            setAttributes(defaultAttributes());
          }}
        >
          Manuel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ATTRIBUTES.map((attr) => (
          <label key={attr} className="rounded-xl border border-line bg-ink/40 p-2">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs text-amber">{ATTRIBUTE_LABELS[attr]}</span>
              <span className="text-xs text-parchment-dim">
                {formatModifier(abilityModifier(attributes[attr]))}
              </span>
            </div>
            {mode === "manual" ? (
              <input
                type="number"
                min={3}
                max={18}
                className="field py-2"
                value={attributes[attr]}
                onChange={(e) =>
                  setAttributes((prev) => ({
                    ...prev,
                    [attr]: Math.min(18, Math.max(3, Number(e.target.value) || 3)),
                  }))
                }
              />
            ) : (
              <div className="font-display text-2xl text-parchment">
                {attributes[attr]}
              </div>
            )}
          </label>
        ))}
      </div>

      {mode === "random" && (
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => setAttributes(rollRandomAttributes())}
        >
          Relancer les dés
        </button>
      )}

      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={!name.trim()}
        onClick={() => {
          const trimmed = name.trim();
          if (!trimmed) return;
          onSubmit({
            name: trimmed,
            mode,
            attributes,
          });
        }}
      >
        Ajouter le personnage
      </button>
    </div>
  );
}

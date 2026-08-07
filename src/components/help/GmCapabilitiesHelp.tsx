"use client";

import { GM_CAPABILITIES } from "@/lib/gm/capabilities";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function GmCapabilitiesHelp({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-4 sm:items-center">
      <div className="panel max-h-[85dvh] w-full max-w-lg overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-xl text-parchment">
            Capacités du MJ
          </h2>
          <button type="button" className="btn btn-ghost px-3 py-1 text-sm" onClick={onClose}>
            Fermer
          </button>
        </div>
        <p className="mb-4 text-sm text-parchment-dim">
          Ce que le Maître du Jeu peut faire. On pourra reformuler ces libellés
          plus tard.
        </p>
        <ul className="space-y-3">
          {GM_CAPABILITIES.map((c) => (
            <li key={c.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
              <div className="text-sm font-semibold text-amber">{c.label}</div>
              <div className="text-sm text-parchment">{c.description}</div>
              <div className="mt-1 text-xs text-parchment-dim">Quand : {c.when}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

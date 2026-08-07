"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { useCampaignStore } from "@/lib/store/campaign-store";
import type { ScenarioBeat } from "@/lib/types";

type Props = {
  campaignId: string;
  nextHref?: string;
};

export function ScenarioEditor({ campaignId, nextHref }: Props) {
  const {
    campaign,
    scenarioBeats,
    loreEntries,
    pdfChunks,
    busy,
    error,
    loadCampaign,
    saveBeats,
    validateScenario,
    setScenarioCursor,
    restructureScenario,
    extractLore,
  } = useCampaignStore();

  const [drafts, setDrafts] = useState<ScenarioBeat[]>([]);
  const [selected, setSelected] = useState(0);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    void loadCampaign(campaignId);
  }, [campaignId, loadCampaign]);

  useEffect(() => {
    setDrafts(scenarioBeats);
    if (scenarioBeats.length) {
      setSelected((prev) => Math.min(prev, scenarioBeats.length - 1));
    }
  }, [scenarioBeats]);

  if (!campaign) {
    return (
      <div className="app-shell px-5 py-10">
        <p className="text-parchment-dim">Chargement du scénario…</p>
      </div>
    );
  }

  const current = drafts[selected];
  const total = drafts.length;

  function updateCurrent(patch: Partial<ScenarioBeat>) {
    setDrafts((prev) =>
      prev.map((b, i) => (i === selected ? { ...b, ...patch } : b)),
    );
  }

  async function persist() {
    await saveBeats(drafts);
    setSavedMsg("Modifications enregistrées (trame pas encore validée)");
    setTimeout(() => setSavedMsg(null), 2500);
  }

  async function validateAndSave() {
    await saveBeats(drafts);
    await validateScenario();
    await setScenarioCursor(0);
    setSavedMsg("Trame validée — le MJ suivra ces battements");
    setTimeout(() => setSavedMsg(null), 3000);
  }

  return (
    <div className="app-shell px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/" className="text-sm text-parchment-dim">
          ← Accueil
        </Link>
        <span className="text-xs uppercase tracking-[0.16em] text-amber">
          Éditeur de trame
        </span>
      </div>

      <h1 className="font-display mb-1 text-3xl text-parchment">
        {campaign.title}
      </h1>
      <p className="mb-4 text-sm text-parchment-dim">
        Chaque battement = une étape narrative. Les fiches (PNJ, créatures,
        lieux…) vont dans la bible de référence : le MJ s’y rapporte quand vous
        les rencontrez, sans spoiler les secrets.
        {loreEntries.length > 0
          ? ` ${loreEntries.length} fiche${loreEntries.length > 1 ? "s" : ""} en mémoire.`
          : " Aucune fiche encore — extrais-les depuis le PDF."}
      </p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {savedMsg && <p className="mb-3 text-sm text-ok">{savedMsg}</p>}
      {campaign.scenarioValidated && (
        <p className="mb-3 text-sm text-amber">Trame validée pour la partie.</p>
      )}

      {total === 0 ? (
        <div className="panel p-4 text-sm text-parchment-dim">
          Aucun battement. Réimporte un PDF depuis la création de partie pour
          générer la structure (Gemini).
        </div>
      ) : (
        <>
          <div className="panel mb-4 space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="btn btn-ghost shrink-0 px-3 py-2 text-sm"
                disabled={selected <= 0}
                onClick={() => setSelected((i) => Math.max(0, i - 1))}
              >
                ← Préc.
              </button>
              <div className="text-center">
                <div className="text-xs uppercase tracking-[0.14em] text-parchment-dim">
                  Battement
                </div>
                <div className="font-display text-xl text-amber">
                  {selected + 1} / {total}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost shrink-0 px-3 py-2 text-sm"
                disabled={selected >= total - 1}
                onClick={() =>
                  setSelected((i) => Math.min(total - 1, i + 1))
                }
              >
                Suiv. →
              </button>
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-parchment-dim">
                Aller à une scène
              </span>
              <select
                className="field"
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {drafts.map((b, i) => (
                  <option key={b.id} value={i}>
                    {i + 1}. {b.title || `Scène ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {current && (
            <div className="fade-in space-y-3">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-parchment-dim">
                  Titre
                </span>
                <input
                  className="field"
                  value={current.title}
                  onChange={(e) => updateCurrent({ title: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-parchment-dim">
                  Objectif MJ
                </span>
                <input
                  className="field"
                  value={current.objective}
                  onChange={(e) => updateCurrent({ objective: e.target.value })}
                  placeholder="Ex. Remettre la mission Charlie Jinx"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-amber">
                  Texte joueurs (fidèle)
                </span>
                <textarea
                  className="field min-h-28"
                  value={current.playerText}
                  onChange={(e) => updateCurrent({ playerText: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-parchment-dim">
                  Notes MJ
                </span>
                <textarea
                  className="field min-h-20"
                  value={current.mjNotes}
                  onChange={(e) => updateCurrent({ mjNotes: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-danger">
                  Secrets
                </span>
                <textarea
                  className="field min-h-20"
                  value={current.secrets}
                  onChange={(e) => updateCurrent({ secrets: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-parchment-dim">
                  Condition de passage
                </span>
                <textarea
                  className="field min-h-16"
                  value={current.transition}
                  onChange={(e) => updateCurrent({ transition: e.target.value })}
                />
              </label>
            </div>
          )}
        </>
      )}

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-2">
          {pdfChunks.length > 0 && (
            <>
              <button
                type="button"
                className="btn btn-ghost w-full"
                disabled={busy}
                onClick={async () => {
                  if (
                    !confirm(
                      "Restructurer tout le PDF avec Gemini ? Cela remplace les battements et rafraîchit la bible de référence (peut prendre quelques minutes).",
                    )
                  ) {
                    return;
                  }
                  const n = await restructureScenario();
                  if (n > 0) {
                    setSavedMsg(
                      `Trame / références mises à jour — vérifie les battements`,
                    );
                    setTimeout(() => setSavedMsg(null), 4000);
                  }
                }}
              >
                {busy
                  ? "Structuration en cours…"
                  : "Restructurer trame + références (Gemini)"}
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full"
                disabled={busy}
                onClick={async () => {
                  const n = await extractLore();
                  if (n > 0) {
                    setSavedMsg(
                      `${n} fiche${n > 1 ? "s" : ""} de référence extraites`,
                    );
                    setTimeout(() => setSavedMsg(null), 4000);
                  }
                }}
              >
                {busy
                  ? "Extraction…"
                  : "Extraire seulement la bible (PNJ / lieux / créatures)"}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost w-full"
            disabled={busy}
            onClick={() => {
              const beat: ScenarioBeat = {
                id: nanoid(),
                campaignId,
                order: drafts.length,
                title: `Scène ${drafts.length + 1}`,
                playerText: "",
                mjNotes: "",
                secrets: "",
                transition: "",
                objective: "",
                validated: false,
              };
              setDrafts((prev) => [...prev, beat]);
              setSelected(drafts.length);
            }}
          >
            Ajouter un battement
          </button>
          {current && (
            <button
              type="button"
              className="btn btn-ghost w-full text-danger"
              onClick={() => {
                const next = drafts.filter((_, i) => i !== selected);
                setDrafts(next);
                setSelected(Math.max(0, selected - 1));
              }}
            >
              Supprimer ce battement
            </button>
          )}
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-xs text-parchment-dim">
            <strong className="text-parchment">Enregistrer</strong> — sauve tes
            edits sans marquer la trame comme prête.
          </p>
          <button
            type="button"
            className="btn btn-ghost w-full"
            disabled={busy || total === 0}
            onClick={() => void persist()}
          >
            Enregistrer
          </button>

          <p className="text-xs text-parchment-dim">
            <strong className="text-parchment">Valider la trame</strong> —
            enregistre + dit au MJ « suis cette bible » (curseur au battement 1).
          </p>
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={busy || total === 0}
            onClick={() => void validateAndSave()}
          >
            Valider la trame
          </button>
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          {nextHref && (
            <>
              <p className="text-xs text-parchment-dim">
                <strong className="text-parchment">Continuer</strong> — retour au
                wizard (création des personnages).
              </p>
              <Link href={nextHref} className="btn btn-ghost w-full text-center">
                Continuer → personnages
              </Link>
            </>
          )}
          <p className="text-xs text-parchment-dim">
            <strong className="text-parchment">Lancer la partie</strong> — ouvre
            la session de jeu (si les PJ existent déjà).
          </p>
          <Link
            href={`/campaign/${campaignId}/play`}
            className="btn btn-ghost w-full text-center"
          >
            Lancer la partie
          </Link>
        </div>
      </div>
    </div>
  );
}

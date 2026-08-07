"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CharacterForm } from "@/components/character/CharacterForm";
import { useCampaignStore } from "@/lib/store/campaign-store";
import { abilityModifier, formatModifier } from "@/lib/rules/d20";
import { ATTRIBUTE_LABELS, ATTRIBUTES } from "@/lib/types";

function NewCampaignInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    createCampaign,
    loadCampaign,
    campaign,
    characters,
    pdfChunks,
    scenarioBeats,
    assets,
    busy,
    error,
    addCharacter,
    ingestPdf,
    importAsset,
  } = useCampaignStore();

  const [title, setTitle] = useState("La lanterne brisée");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [assetTags, setAssetTags] = useState("taverne, ambiance");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const resume = searchParams.get("resume");
    if (!resume) return;
    setCampaignId(resume);
    void loadCampaign(resume).then(() => setStep(2));
  }, [searchParams, loadCampaign]);

  async function ensureCampaign() {
    if (campaignId) return campaignId;
    const id = await createCampaign(title);
    setCampaignId(id);
    await loadCampaign(id);
    return id;
  }

  return (
    <div className="app-shell px-5 pb-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-parchment-dim">
          ← Accueil
        </Link>
        <span className="text-xs uppercase tracking-[0.18em] text-amber">
          Étape {step}/3
        </span>
      </div>

      <h1 className="font-display fade-in mb-6 text-3xl text-parchment">
        {step === 1 && "Préparer la table"}
        {step === 2 && "Héros de la soirée"}
        {step === 3 && "Assets & départ"}
      </h1>

      {step === 1 && (
        <div className="fade-in space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-[0.16em] text-parchment-dim">
              Titre de la campagne
            </span>
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="panel block space-y-2 p-4">
            <span className="text-xs uppercase tracking-[0.16em] text-parchment-dim">
              PDF du scénario
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="block w-full text-sm text-parchment-dim file:mr-3 file:rounded-lg file:border-0 file:bg-amber/20 file:px-3 file:py-2 file:text-amber"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await ensureCampaign();
                setStatus("Extraction + structuration IA…");
                const n = await ingestPdf(file);
                setStatus(
                  n
                    ? `${n} battements / extraits prêts — édite la trame ensuite`
                    : "Échec PDF",
                );
              }}
            />
            <p className="text-xs text-parchment-dim">
              {scenarioBeats.length > 0
                ? `${scenarioBeats.length} battements structurés · ${pdfChunks.length} extraits`
                : pdfChunks.length > 0
                  ? `${pdfChunks.length} extraits (structuration en cours ou fallback)`
                  : "Le PDF sera découpé en scènes (mission, lieux, twists…)."}
            </p>
          </label>

          {status && <p className="text-sm text-amber">{status}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={busy}
            onClick={async () => {
              const id = await ensureCampaign();
              const { db } = await import("@/lib/db/schema");
              const current = await db.campaigns.get(id);
              if (current) {
                await db.campaigns.put({
                  ...current,
                  title: title.trim() || current.title,
                  updatedAt: Date.now(),
                });
              }
              router.push(`/campaign/${id}/scenario`);
            }}
          >
            Éditer / valider la trame
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="fade-in space-y-4">
          {campaignId && (
            <Link
              href={`/campaign/${campaignId}/scenario`}
              className="panel block p-3 text-sm text-amber"
            >
              Trame : {scenarioBeats.length} battement
              {scenarioBeats.length !== 1 ? "s" : ""}
              {campaign?.scenarioValidated ? " · validée" : " · à valider"} →
            </Link>
          )}
          <CharacterForm
            onSubmit={(input) => {
              void addCharacter(input);
            }}
          />

          <ul className="space-y-2">
            {characters.map((c) => (
              <li key={c.id} className="panel p-3">
                <div className="font-display text-lg">{c.name}</div>
                <div className="mt-1 text-xs text-parchment-dim">
                  PV {c.hp}/{c.maxHp} ·{" "}
                  {ATTRIBUTES.map(
                    (a) =>
                      `${ATTRIBUTE_LABELS[a].slice(0, 3)} ${c.attributes[a]} (${formatModifier(abilityModifier(c.attributes[a]))})`,
                  ).join(" · ")}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={characters.length === 0}
            onClick={() => setStep(3)}
          >
            Continuer ({characters.length} perso
            {characters.length > 1 ? "s" : ""})
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="fade-in space-y-4">
          <label className="panel block space-y-2 p-4">
            <span className="text-xs uppercase tracking-[0.16em] text-parchment-dim">
              Importer images / sons
            </span>
            <input
              className="field"
              value={assetTags}
              onChange={(e) => setAssetTags(e.target.value)}
              placeholder="tags séparés par des virgules"
            />
            <input
              type="file"
              accept="image/*,audio/*"
              multiple
              className="block w-full text-sm text-parchment-dim file:mr-3 file:rounded-lg file:border-0 file:bg-amber/20 file:px-3 file:py-2 file:text-amber"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                const tags = assetTags.split(",");
                for (const file of files) {
                  await importAsset(file, tags);
                }
              }}
            />
            <p className="text-xs text-parchment-dim">
              {assets.length} asset{assets.length !== 1 ? "s" : ""} importé
              {assets.length !== 1 ? "s" : ""}
            </p>
          </label>

          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => {
              const id = campaignId ?? campaign?.id;
              if (id) router.push(`/campaign/${id}/play`);
            }}
          >
            Lancer la partie
          </button>
        </div>
      )}
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <div className="app-shell px-5 py-10 text-parchment-dim">Chargement…</div>
      }
    >
      <NewCampaignInner />
    </Suspense>
  );
}

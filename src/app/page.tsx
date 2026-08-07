"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GmCapabilitiesHelp } from "@/components/help/GmCapabilitiesHelp";
import { useDeviceMode } from "@/hooks/useDeviceMode";
import { useCampaignStore } from "@/lib/store/campaign-store";
import { speakTestSample } from "@/lib/client/tts";
import { unlockAudio } from "@/lib/client/tts-local";

export default function HomePage() {
  const router = useRouter();
  const { mode, setMode, isDesktop } = useDeviceMode();
  const {
    ready,
    campaigns,
    syncStatus,
    error,
    initHome,
    deleteCampaign,
    joinCampaign,
  } = useCampaignStore();

  const [joinCode, setJoinCode] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [ttsOk, setTtsOk] = useState<boolean | null>(null);
  const [ttsHint, setTtsHint] = useState<string | null>(null);

  useEffect(() => {
    void initHome();
  }, [initHome]);

  async function testTts(playSample = false) {
    setTtsOk(null);
    setTtsHint(playSample ? "Génération de la voix…" : null);
    try {
      // Only unlock audio on a real click — auto-probe must not create AudioContext.
      if (playSample) await unlockAudio();
      const res = await fetch("/api/tts/probe");
      const data = (await res.json()) as {
        ok?: boolean;
        speechReady?: boolean;
        hint?: string;
        base?: string;
        engine?: string;
      };
      setTtsOk(Boolean(data.speechReady ?? data.ok));
      if (!data.ok) {
        setTtsHint(
          data.hint ||
            `Injoignable (${data.base || "127.0.0.1:3900"}). Ouvre VoiceStudio et vérifie le backend.`,
        );
        return;
      }
      if (!data.speechReady && !playSample) {
        setTtsHint(
          data.hint ||
            "API OK — tentative voix possible. Génère un test dans VoiceStudio si silence.",
        );
      }
      if (playSample) {
        const sample = await speakTestSample();
        if (sample.ok) {
          setTtsHint(
            sample.voiceName
              ? `Voix OK — narrateur « ${sample.voiceName} » (VoiceStudio).`
              : "Voix VoiceStudio OK.",
          );
        } else {
          setTtsHint(sample.error || "Échec VoiceStudio — pas de secours navigateur.");
        }
      }
    } catch {
      setTtsOk(false);
      setTtsHint("Échec du test — est-ce que npm run dev tourne ?");
    }
  }

  useEffect(() => {
    if (!isDesktop) {
      setTtsOk(null);
      setTtsHint(null);
      return;
    }
    void testTts(false);
  }, [isDesktop]);

  return (
    <div className="app-shell px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="fade-in mb-8 pt-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-[0.28em] text-amber/80">
            Table partagée
          </p>
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              className={`btn btn-ghost px-2 py-1 text-xs ${mode === "mobile" ? "border-amber text-amber" : ""}`}
              onClick={() => setMode("mobile")}
            >
              Tel
            </button>
            <button
              type="button"
              className={`btn btn-ghost px-2 py-1 text-xs ${mode === "desktop" ? "border-amber text-amber" : ""}`}
              onClick={() => setMode("desktop")}
            >
              PC
            </button>
            <button
              type="button"
              className="btn btn-ghost px-2 py-1 text-xs"
              onClick={() => setHelpOpen(true)}
            >
              MJ ?
            </button>
          </div>
        </div>
        <h1 className="font-display text-5xl leading-none text-parchment">
          Maître
          <br />
          <span className="text-amber">du Jeu</span>
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-parchment-dim">
          {isDesktop
            ? "Mode PC : sync Supabase + voix VoiceStudio (Mimir uniquement)."
            : "Mode téléphone : hotseat, sync via code de partie (voix = VoiceStudio sur le PC hôte)."}
        </p>
        {isDesktop && (
          <p className="mt-2 text-xs text-parchment-dim">
            Moteur vocal :{" "}
            {ttsOk === null
              ? "…"
              : ttsOk
                ? "VoiceStudio (Mimir)"
                : "VoiceStudio off — aucune voix"}
            {" · "}
            <button
              type="button"
              className="text-amber underline"
              onClick={() => void testTts(true)}
            >
              Tester la voix
            </button>
          </p>
        )}
        {ttsHint && (
          <p
            className={`mt-1 text-xs ${
              ttsHint.includes("OK") ? "text-ok" : "text-danger"
            }`}
          >
            {ttsHint}
          </p>
        )}
      </header>

      <Link href="/campaign/new" className="btn btn-primary w-full fade-in">
        Nouvelle partie
      </Link>

      <section className="panel mt-4 space-y-2 p-3 fade-in">
        <h2 className="text-xs uppercase tracking-[0.2em] text-parchment-dim">
          Rejoindre (code)
        </h2>
        <div className="flex gap-2">
          <input
            className="field flex-1 uppercase"
            placeholder="ABC123"
            value={joinCode}
            maxLength={8}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button
            type="button"
            className="btn btn-primary shrink-0"
            onClick={async () => {
              const id = await joinCampaign(joinCode);
              if (id) router.push(`/campaign/${id}/play`);
            }}
          >
            OK
          </button>
        </div>
        {syncStatus && (
          <p className="text-xs text-amber">{syncStatus}</p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </section>

      <section className="mt-8 fade-in">
        <h2 className="mb-3 text-xs uppercase tracking-[0.2em] text-parchment-dim">
          Reprendre
        </h2>
        {!ready && (
          <p className="pulse-soft text-sm text-parchment-dim">Chargement…</p>
        )}
        {ready && campaigns.length === 0 && (
          <div className="panel p-4 text-sm text-parchment-dim">
            Aucune partie sauvegardée sur cet appareil.
          </div>
        )}
        <ul className="flex flex-col gap-3">
          {campaigns.map((c) => (
            <li key={c.id} className="panel flex items-stretch overflow-hidden">
              <Link
                href={`/campaign/${c.id}/play`}
                className="flex flex-1 flex-col px-4 py-3"
              >
                <span className="font-display text-lg text-parchment">
                  {c.title}
                </span>
                <span className="text-xs text-parchment-dim">
                  {new Date(c.updatedAt).toLocaleString("fr-FR")}
                  {c.joinCode ? ` · code ${c.joinCode}` : ""}
                </span>
              </Link>
              <Link
                href={`/campaign/${c.id}/scenario`}
                className="flex items-center border-l border-line px-3 text-xs text-amber"
              >
                Trame
              </Link>
              <button
                type="button"
                className="btn-danger border-0 border-l border-line px-3 text-xs"
                onClick={() => {
                  if (confirm(`Supprimer « ${c.title} » ?`)) {
                    void deleteCampaign(c.id);
                  }
                }}
              >
                Effacer
              </button>
            </li>
          ))}
        </ul>
      </section>

      <GmCapabilitiesHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

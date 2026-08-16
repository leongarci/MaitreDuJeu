"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CharacterDrawer } from "@/components/character/CharacterDrawer";
import { DiceModal } from "@/components/dice/DiceModal";
import { EncounterBanner } from "@/components/session/EncounterBanner";
import { OocChat } from "@/components/session/OocChat";
import { useDeviceMode } from "@/hooks/useDeviceMode";
import { getLastTtsError } from "@/lib/client/tts";
import { unlockAudio } from "@/lib/client/tts-local";
import { oocMessages, tableMessages } from "@/lib/messages";
import { currentCombatant, living } from "@/lib/combat/engine";
import { groupMembers, isCharacterDown } from "@/lib/party/groups";
import { useCampaignStore } from "@/lib/store/campaign-store";

interface Props {
  campaignId: string;
}

export function SessionView({ campaignId }: Props) {
  const { mode, setMode, isDesktop } = useDeviceMode();
  const {
    campaign,
    characters,
    messages,
    scenarioBeats,
    busy,
    error,
    sceneUrl,
    sceneGenerating,
    loadCampaign,
    setActiveCharacter,
    setTtsMuted,
    startIntro,
    runRelance,
    startNewRound,
    sendAction,
    confirmJointAction,
    declineJointAction,
    setActivePartyGroup,
    splitParty,
    mergeParty,
    resolvePendingCheck,
    setScenarioCursor,
    pullCampaignSync,
    sendOoc,
    oocBusy,
  } = useCampaignStore();

  const [text, setText] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitLabel, setSplitLabel] = useState("");
  const [splitHint, setSplitHint] = useState("");
  const [splitIds, setSplitIds] = useState<string[]>([]);
  const [jointIds, setJointIds] = useState<string[]>([]);
  const [oocOpen, setOocOpen] = useState(false);
  const [oocSeen, setOocSeen] = useState(0);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const introStarted = useRef(false);
  const hasEverHadMessages = useRef(false);

  useEffect(() => {
    introStarted.current = false;
    hasEverHadMessages.current = false;
    void loadCampaign(campaignId);
  }, [campaignId, loadCampaign]);

  const icMessages = useMemo(() => tableMessages(messages), [messages]);
  const oocLog = useMemo(() => oocMessages(messages), [messages]);
  const oocUnread = oocOpen ? 0 : Math.max(0, oocLog.length - oocSeen);

  useEffect(() => {
    if (icMessages.length > 0) hasEverHadMessages.current = true;
  }, [icMessages.length]);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) return;
    if (introStarted.current || busy || icMessages.length > 0) return;
    if (hasEverHadMessages.current) return;
    if (characters.length === 0) return;
    introStarted.current = true;
    void startIntro();
  }, [campaign, campaignId, characters.length, icMessages.length, busy, startIntro]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [icMessages.length, busy]);

  useEffect(() => {
    if (!campaign?.joinCode) return;
    const t = window.setInterval(() => {
      void pullCampaignSync();
    }, 12_000);
    return () => window.clearInterval(t);
  }, [campaign?.joinCode, pullCampaignSync]);

  useEffect(() => {
    if (busy) return;
    const err = getLastTtsError();
    if (err) setTtsError(err);
  }, [busy, messages.length]);

  const groups = campaign?.partyGroups ?? [];
  const activeGroupId = campaign?.activePartyGroupId ?? groups[0]?.id ?? null;
  const groupChars = useMemo(
    () => groupMembers(characters, activeGroupId),
    [characters, activeGroupId],
  );
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const acted = new Set(activeGroup?.actedThisRound ?? campaign?.actedThisRound ?? []);
  const waiting = groupChars.filter(
    (c) => !acted.has(c.id) && !isCharacterDown(c),
  );
  const active = characters.find((c) => c.id === campaign?.activeCharacterId);
  const currentBeat =
    scenarioBeats.find((b) => b.order === campaign?.scenarioCursor) ||
    scenarioBeats[0];
  const dialogue = campaign?.pendingDialogue;
  const joint = campaign?.pendingJointAction;
  const roundDone = groupChars.length > 0 && waiting.length === 0;
  const allies = groupChars.filter(
    (c) =>
      c.id !== active?.id && !acted.has(c.id) && !isCharacterDown(c),
  );
  const encounter = campaign?.encounter;
  const encounterOn = Boolean(encounter?.active);
  const encounterTurn = encounterOn ? currentCombatant(encounter) : null;
  const encounterBlocksInput =
    encounterOn &&
    (encounterTurn?.side !== "pc" ||
      encounterTurn.characterId !== active?.id);

  useEffect(() => {
    if (oocOpen) setOocSeen(oocLog.length);
  }, [oocOpen, oocLog.length]);

  useEffect(() => {
    if (!encounter?.active) {
      setTargetId(null);
      return;
    }
    const hostiles = living(encounter, "hostile");
    if (!hostiles.length) {
      setTargetId(null);
      return;
    }
    if (!targetId || !hostiles.some((h) => h.id === targetId)) {
      setTargetId(hostiles[0]!.id);
    }
  }, [encounter, targetId]);

  if (!campaign) {
    return (
      <div className="app-shell px-5 py-10">
        <p className="pulse-soft text-parchment-dim">Ouverture de la table…</p>
        <Link href="/" className="btn btn-ghost mt-6 inline-flex">
          Retour
        </Link>
      </div>
    );
  }

  const turnHelp = encounterOn
    ? `Tour de ${encounterTurn?.name || "?"} (init ${encounterTurn?.initiative ?? "—"})`
    : joint
      ? `Action collective — confirmation de ${
          characters.find((c) => c.id === campaign.activeCharacterId)?.name || "?"
        }`
      : roundDone
        ? "Tout le monde a agi — Nouveau round ou Relancer"
        : `Tour de ${active?.name || "?"} · encore : ${
            waiting.map((c) => c.name).join(", ") || "—"
          }`;

  const tableActions = (
    <>
      <button
        type="button"
        className="btn btn-ghost px-2 py-1 text-xs"
        disabled={busy || groupChars.length < 2}
        onClick={() => {
          setSplitIds([]);
          setSplitLabel("");
          setSplitHint("");
          setSplitOpen(true);
          setMenuOpen(false);
        }}
      >
        Séparer
      </button>
      <button
        type="button"
        className="btn btn-ghost px-2 py-1 text-xs"
        disabled={busy || !!campaign.pendingCheck || encounterOn || !roundDone}
        onClick={() => {
          void startNewRound();
          setMenuOpen(false);
        }}
      >
        Nouveau round
      </button>
      <button
        type="button"
        className="btn btn-ghost px-2 py-1 text-xs"
        disabled={busy || !!campaign.pendingCheck || characters.length === 0}
        onClick={() => {
          void runRelance();
          setMenuOpen(false);
        }}
      >
        Relancer
      </button>
    </>
  );

  return (
    <div className="app-shell relative flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <header className="z-10 shrink-0 border-b border-line bg-ink/70 px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Link href="/" className="shrink-0 px-1 py-1 text-xs text-parchment-dim">
            ←
          </Link>
          <h1 className="font-display min-w-0 flex-1 truncate text-sm text-parchment md:text-base">
            {campaign.title}
          </h1>
          {isDesktop && campaign.joinCode && (
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-amber">
              {campaign.joinCode}
            </span>
          )}
          {!isDesktop && (
            <button
              type="button"
              className="btn btn-ghost relative shrink-0 px-2 py-1 text-xs"
              onClick={() => setOocOpen(true)}
              title="Hors-jeu — questions au MJ"
            >
              MJ
              {oocUnread > 0 && (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-amber px-1 text-[10px] font-semibold leading-4 text-ink">
                  {oocUnread > 9 ? "9+" : oocUnread}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost shrink-0 px-2 py-1 text-xs"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            title="Options"
          >
            {menuOpen ? "Fermer" : "Menu"}
          </button>
        </div>

        {menuOpen && (
          <div className="mb-2 space-y-2 rounded-lg border border-line/80 bg-ink/50 px-2 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-xs"
                onClick={() => setMode(mode === "mobile" ? "desktop" : "mobile")}
                title="Mode tel / PC"
              >
                {isDesktop ? "Mode PC" : "Mode Tel"}
              </button>
              {isDesktop && (
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-xs"
                  onClick={() => void setTtsMuted(!campaign.ttsMuted)}
                  title="Couper/rétablir la voix du MJ"
                >
                  {campaign.ttsMuted ? "TTS off" : "TTS on"}
                </button>
              )}
              {!isDesktop && campaign.joinCode && (
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-amber">
                  {campaign.joinCode}
                </span>
              )}
              {!isDesktop && tableActions}
            </div>
            {!isDesktop && currentBeat && scenarioBeats.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-amber/90">
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 px-2 py-0.5 text-[11px]"
                  disabled={busy || campaign.scenarioCursor <= 0}
                  onClick={() => void setScenarioCursor(campaign.scenarioCursor - 1)}
                >
                  ←
                </button>
                <p className="min-w-0 flex-1 truncate" title={currentBeat.transition || undefined}>
                  Étape {campaign.scenarioCursor + 1}/{scenarioBeats.length} —{" "}
                  {currentBeat.title}
                </p>
                <button
                  type="button"
                  className="btn btn-ghost shrink-0 px-2 py-0.5 text-[11px]"
                  disabled={
                    busy || campaign.scenarioCursor >= scenarioBeats.length - 1
                  }
                  onClick={() => void setScenarioCursor(campaign.scenarioCursor + 1)}
                >
                  →
                </button>
              </div>
            )}
          </div>
        )}

        {groups.length > 1 && (
          <div className="mb-1.5 flex gap-2 overflow-x-auto pb-0.5">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => void setActivePartyGroup(g.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                  g.id === activeGroupId
                    ? "border-amber bg-amber/20 text-amber"
                    : "border-line text-parchment-dim"
                }`}
              >
                {g.label}
                {g.locationHint ? ` · ${g.locationHint}` : ""}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-ghost shrink-0 px-2 py-1 text-[11px]"
              onClick={() => void mergeParty()}
            >
              Reformer
            </button>
          </div>
        )}

        {isDesktop && currentBeat && scenarioBeats.length > 0 && (
          <div className="mb-2 flex items-center gap-2 text-[11px] text-amber/90">
            <button
              type="button"
              className="btn btn-ghost shrink-0 px-2 py-0.5 text-[11px]"
              disabled={busy || campaign.scenarioCursor <= 0}
              onClick={() => void setScenarioCursor(campaign.scenarioCursor - 1)}
            >
              ←
            </button>
            <p className="min-w-0 flex-1 truncate" title={currentBeat.transition || undefined}>
              Étape {campaign.scenarioCursor + 1}/{scenarioBeats.length} —{" "}
              {currentBeat.title}
            </p>
            <button
              type="button"
              className="btn btn-ghost shrink-0 px-2 py-0.5 text-[11px]"
              disabled={
                busy || campaign.scenarioCursor >= scenarioBeats.length - 1
              }
              onClick={() => void setScenarioCursor(campaign.scenarioCursor + 1)}
            >
              →
            </button>
          </div>
        )}

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {groupChars.map((c) => {
            const selected = c.id === campaign.activeCharacterId;
            const hasActed = acted.has(c.id);
            const down = isCharacterDown(c);
            const combatTurn =
              encounterOn && encounterTurn?.characterId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => void setActiveCharacter(c.id)}
                disabled={!encounterOn && hasActed && !down && !selected}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition md:px-3 md:py-1.5 md:text-sm ${
                  down
                    ? "border-danger/50 bg-danger/10 text-danger"
                    : combatTurn || selected
                      ? "border-amber bg-amber/20 text-amber"
                      : hasActed
                        ? "border-line/50 bg-ink/20 text-parchment-dim/60"
                        : "border-line bg-ink/40 text-parchment-dim"
                }`}
              >
                {c.name} {c.hp}/{c.maxHp}
                {down ? " ✕" : hasActed && !encounterOn ? " ✓" : combatTurn || selected ? " ←" : ""}
              </button>
            );
          })}
          {active && (
            <button
              type="button"
              className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-parchment-dim md:px-3 md:py-1.5 md:text-sm"
              onClick={() => setSheetOpen(true)}
            >
              Fiche
            </button>
          )}
        </div>

        {(!encounterOn || isDesktop) && (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-[11px] text-parchment-dim">
              {turnHelp}
            </p>
            {isDesktop && <div className="flex gap-1">{tableActions}</div>}
          </div>
        )}
      </header>

      <div
        className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 md:px-4 md:py-4 ${
          isDesktop ? "md:grid md:grid-cols-[1fr_18rem] md:gap-4" : ""
        }`}
      >
        <div>
          {isDesktop && encounterOn && encounter && (
            <EncounterBanner
              encounter={encounter}
              targetId={targetId}
              onSelectTarget={setTargetId}
            />
          )}
          {sceneUrl ? (
            <div className="fade-in mb-4 overflow-hidden rounded-2xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sceneUrl}
                alt="Scène"
                className="h-40 w-full object-cover md:h-56"
              />
            </div>
          ) : sceneGenerating ? (
            <div className="pulse-soft mb-4 flex h-40 items-center justify-center rounded-2xl border border-line bg-ink/40 text-sm text-parchment-dim md:h-56">
              Illustration de la scène…
            </div>
          ) : null}

          <div className="space-y-3">
            {icMessages.length === 0 && !hasEverHadMessages.current && (
              <div className="panel fade-in p-4 text-sm leading-relaxed text-parchment-dim">
                {busy
                  ? "Le Maître du Jeu prépare l’introduction…"
                  : "La table est prête — l’intro va commencer."}
              </div>
            )}
            {icMessages.map((m) => {
              const speaker =
                m.role === "gm"
                  ? "MJ"
                  : characters.find((c) => c.id === m.characterId)?.name ||
                    "Joueur";
              const isGm = m.role === "gm";
              return (
                <article
                  key={m.id}
                  className={`fade-in rounded-2xl border px-3.5 py-3 ${
                    isGm
                      ? "border-amber/25 bg-amber/8"
                      : "border-line bg-ink/35"
                  }`}
                >
                  <div
                    className={`mb-1 text-[11px] uppercase tracking-[0.16em] ${
                      isGm ? "text-amber" : "text-parchment-dim"
                    }`}
                  >
                    {speaker}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-parchment">
                    {m.text}
                  </p>
                </article>
              );
            })}
            {busy && (
              <p className="pulse-soft text-sm text-amber">
                Le MJ prépare la suite…
              </p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            {ttsError && !campaign.ttsMuted && (
              <p className="text-sm text-danger">Voix : {ttsError}</p>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {isDesktop && (
          <div className="hidden md:block">
            <OocChat
              variant="sidebar"
              messages={oocLog}
              busy={oocBusy}
              onSend={(t) => void sendOoc(t)}
            />
          </div>
        )}
      </div>

      {!isDesktop && encounterOn && encounter && (
        <EncounterBanner
          encounter={encounter}
          targetId={targetId}
          onSelectTarget={setTargetId}
          compact
        />
      )}

      {dialogue && (
        <div className="border-t border-amber/40 bg-amber/10 px-3 py-2 text-sm text-parchment">
          <span className="text-amber">Dialogue — </span>
          {dialogue.prompt}
          <span className="text-parchment-dim">
            {" "}
            ({dialogue.to.replace(/^(pj|pnj):/i, "")})
          </span>
        </div>
      )}

      {joint && (
        <div className="border-t border-amber/40 bg-amber/10 px-3 py-2 text-sm text-parchment">
          <p>
            <span className="text-amber">Action collective — </span>
            {joint.text}
          </p>
          <p className="mt-1 text-xs text-parchment-dim">
            Confirmé :{" "}
            {joint.confirmedIds
              .map((id) => characters.find((c) => c.id === id)?.name)
              .filter(Boolean)
              .join(", ")}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn btn-primary px-3 py-1 text-xs"
              disabled={busy}
              onClick={() => void confirmJointAction()}
            >
              J’accompagne
            </button>
            <button
              type="button"
              className="btn btn-ghost px-3 py-1 text-xs"
              disabled={busy}
              onClick={() => void declineJointAction()}
            >
              Refuser
            </button>
          </div>
        </div>
      )}

      {!joint && (
        <form
          className="shrink-0 border-t border-line bg-ink/80 px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const value = text;
            setText("");
            const withIds = [...jointIds];
            setJointIds([]);
            void unlockAudio();
            void sendAction(value, {
              withCharacterIds: withIds,
              targetCombatantId: targetId ?? undefined,
            });
          }}
        >
          {allies.length > 0 && !dialogue && !encounterOn && (
            <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-parchment-dim">
              <span>Avec :</span>
              {allies.map((c) => {
                const on = jointIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`rounded-full border px-2 py-0.5 ${
                      on ? "border-amber text-amber" : "border-line"
                    }`}
                    onClick={() =>
                      setJointIds((prev) =>
                        on ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                      )
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="field py-2.5 text-sm md:py-[0.85rem] md:text-base"
              enterKeyHint="send"
              placeholder={
                dialogue
                  ? "Ta réplique…"
                  : encounterBlocksInput
                    ? `Tour de ${encounterTurn?.name ?? "…"} — attends ton tour`
                    : active && isCharacterDown(active)
                      ? `${active.name} est à terre — utilise Hors-jeu pour une question`
                      : active
                        ? `Action de ${active.name}…`
                        : "Choisissez un personnage"
              }
              value={text}
              disabled={
                busy ||
                !!campaign.pendingCheck ||
                !active ||
                encounterBlocksInput ||
                (!!active && isCharacterDown(active)) ||
                (!!active && !encounterOn && acted.has(active.id) && !dialogue)
              }
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary shrink-0 px-4"
              disabled={
                busy ||
                !!campaign.pendingCheck ||
                !active ||
                !text.trim() ||
                encounterBlocksInput ||
                (!!active && isCharacterDown(active)) ||
                (!!active && !encounterOn && acted.has(active.id) && !dialogue)
              }
            >
              Envoyer
            </button>
          </div>
        </form>
      )}

      {splitOpen && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-ink/70 p-4 sm:items-center">
          <div className="panel w-full max-w-md space-y-3 p-4">
            <h2 className="font-display text-lg text-amber">Se séparer</h2>
            <p className="text-xs text-parchment-dim">
              Choisis qui part dans un nouveau sous-groupe (au moins un reste).
            </p>
            <input
              className="field"
              placeholder="Nom du sous-groupe"
              value={splitLabel}
              onChange={(e) => setSplitLabel(e.target.value)}
            />
            <input
              className="field"
              placeholder="Lieu / indice (optionnel)"
              value={splitHint}
              onChange={(e) => setSplitHint(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {groupChars.map((c) => {
                const on = splitIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-sm ${
                      on ? "border-amber text-amber" : "border-line"
                    }`}
                    onClick={() =>
                      setSplitIds((prev) =>
                        on ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                      )
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setSplitOpen(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                disabled={
                  splitIds.length === 0 ||
                  splitIds.length >= groupChars.length ||
                  !splitLabel.trim()
                }
                onClick={() => {
                  void splitParty(splitIds, splitLabel, splitHint);
                  setSplitOpen(false);
                }}
              >
                Séparer
              </button>
            </div>
          </div>
        </div>
      )}

      {campaign.pendingCheck && active && (
        <DiceModal
          check={campaign.pendingCheck}
          characterName={
            characters.find((c) => c.id === campaign.pendingCheck?.characterId)
              ?.name || active.name
          }
          busy={busy}
          onAuto={() => void resolvePendingCheck("auto")}
          onManual={(d20) => void resolvePendingCheck("manual", d20)}
        />
      )}

      {active && (
        <CharacterDrawer
          character={active}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {!isDesktop && oocOpen && (
        <OocChat
          variant="drawer"
          messages={oocLog}
          busy={oocBusy}
          onSend={(t) => void sendOoc(t)}
          onClose={() => setOocOpen(false)}
        />
      )}

    </div>
  );
}

import { nanoid } from "nanoid";
import type { Campaign, Character, PartyGroup, PartySplitUpdate } from "@/lib/types";

export function createDefaultPartyGroup(campaignId: string): PartyGroup {
  return {
    id: nanoid(),
    campaignId,
    label: "Groupe",
    locationHint: "",
    activeCharacterId: null,
    actedThisRound: [],
  };
}

export function ensurePartyState(
  campaign: Campaign,
  characters: Character[],
): { campaign: Campaign; characters: Character[] } {
  let groups = Array.isArray(campaign.partyGroups)
    ? campaign.partyGroups.map((g) => ({
        ...g,
        actedThisRound: Array.isArray(g.actedThisRound) ? g.actedThisRound : [],
      }))
    : [];

  if (groups.length === 0) {
    const g = createDefaultPartyGroup(campaign.id);
    g.activeCharacterId = campaign.activeCharacterId;
    g.actedThisRound = Array.isArray(campaign.actedThisRound)
      ? campaign.actedThisRound
      : [];
    groups = [g];
  }

  let activePartyGroupId =
    campaign.activePartyGroupId &&
    groups.some((g) => g.id === campaign.activePartyGroupId)
      ? campaign.activePartyGroupId
      : groups[0]!.id;

  const defaultGroupId = groups[0]!.id;
  const nextChars = characters.map((c) => ({
    ...c,
    partyGroupId:
      c.partyGroupId && groups.some((g) => g.id === c.partyGroupId)
        ? c.partyGroupId
        : defaultGroupId,
  }));

  const activeGroup = groups.find((g) => g.id === activePartyGroupId)!;
  const groupMembers = nextChars.filter((c) => c.partyGroupId === activeGroup.id);
  let activeCharacterId = campaign.activeCharacterId;
  if (
    !activeCharacterId ||
    !groupMembers.some((c) => c.id === activeCharacterId)
  ) {
    activeCharacterId =
      activeGroup.activeCharacterId &&
      groupMembers.some((c) => c.id === activeGroup.activeCharacterId)
        ? activeGroup.activeCharacterId
        : groupMembers[0]?.id ?? null;
  }

  const syncedGroups = groups.map((g) =>
    g.id === activePartyGroupId
      ? { ...g, activeCharacterId }
      : g,
  );

  // Mirror active group acted into legacy field for older sync readers.
  const actedThisRound =
    syncedGroups.find((g) => g.id === activePartyGroupId)?.actedThisRound ?? [];

  return {
    campaign: {
      ...campaign,
      partyGroups: syncedGroups,
      activePartyGroupId,
      activeCharacterId,
      actedThisRound,
      pendingJointAction: campaign.pendingJointAction ?? null,
    },
    characters: nextChars,
  };
}

export function isCharacterDown(c: Character): boolean {
  return (c.hp ?? 0) <= 0;
}

export function groupMembers(
  characters: Character[],
  groupId: string | null | undefined,
): Character[] {
  if (!groupId) return characters;
  return characters.filter((c) => c.partyGroupId === groupId);
}

export function nextWaitingCharacterId(
  characters: Character[],
  group: PartyGroup,
): string | null {
  const members = groupMembers(characters, group.id);
  const acted = new Set(group.actedThisRound);
  const waiting = members.filter((c) => !acted.has(c.id) && !isCharacterDown(c));
  if (waiting.length === 0) return null;
  return waiting[0]!.id;
}

export function markActedInGroup(
  campaign: Campaign,
  characterIds: string[],
): Campaign {
  const groupId = campaign.activePartyGroupId;
  if (!groupId) return campaign;
  const groups = campaign.partyGroups.map((g) => {
    if (g.id !== groupId) return g;
    const acted = new Set([...g.actedThisRound, ...characterIds]);
    return { ...g, actedThisRound: Array.from(acted) };
  });
  const active = groups.find((g) => g.id === groupId)!;
  return {
    ...campaign,
    partyGroups: groups,
    actedThisRound: active.actedThisRound,
  };
}

export function advanceTurnInGroup(
  campaign: Campaign,
  characters: Character[],
): Campaign {
  const groupId = campaign.activePartyGroupId;
  if (!groupId) return campaign;
  const group = campaign.partyGroups.find((g) => g.id === groupId);
  if (!group) return campaign;
  const nextId = nextWaitingCharacterId(characters, group);
  const groups = campaign.partyGroups.map((g) =>
    g.id === groupId ? { ...g, activeCharacterId: nextId } : g,
  );
  return {
    ...campaign,
    partyGroups: groups,
    activeCharacterId: nextId ?? campaign.activeCharacterId,
  };
}

export function resetGroupRound(
  campaign: Campaign,
  characters: Character[],
): Campaign {
  const groupId = campaign.activePartyGroupId;
  if (!groupId) return campaign;
  const groups = campaign.partyGroups.map((g) =>
    g.id === groupId ? { ...g, actedThisRound: [] } : g,
  );
  const group = groups.find((g) => g.id === groupId)!;
  const members = groupMembers(characters, groupId);
  const first =
    members.find((c) => !isCharacterDown(c))?.id ?? members[0]?.id ?? null;
  const withActive = groups.map((g) =>
    g.id === groupId ? { ...g, activeCharacterId: first } : g,
  );
  return {
    ...campaign,
    partyGroups: withActive,
    actedThisRound: [],
    activeCharacterId: first,
  };
}

export function applyPartySplit(
  campaign: Campaign,
  characters: Character[],
  split: PartySplitUpdate,
): { campaign: Campaign; characters: Character[] } {
  if (!split.groups?.length) {
    return { campaign, characters };
  }

  const byName = new Map(
    characters.map((c) => [c.name.trim().toLowerCase(), c]),
  );
  const used = new Set<string>();
  const newGroups: PartyGroup[] = [];
  const assignments = new Map<string, string>();

  for (const spec of split.groups) {
    const label = (spec.label || "Groupe").trim() || "Groupe";
    const g: PartyGroup = {
      id: nanoid(),
      campaignId: campaign.id,
      label,
      locationHint: spec.locationHint?.trim() || "",
      activeCharacterId: null,
      actedThisRound: [],
    };
    const ids: string[] = [];
    for (const raw of spec.characterNames || []) {
      const ch = byName.get(raw.trim().toLowerCase());
      if (!ch || used.has(ch.id)) continue;
      used.add(ch.id);
      ids.push(ch.id);
      assignments.set(ch.id, g.id);
    }
    if (ids.length === 0) continue;
    g.activeCharacterId = ids[0]!;
    newGroups.push(g);
  }

  // Orphans stay in leftover group.
  const orphans = characters.filter((c) => !used.has(c.id));
  if (orphans.length > 0) {
    const g: PartyGroup = {
      id: nanoid(),
      campaignId: campaign.id,
      label: "Reste du groupe",
      locationHint: "",
      activeCharacterId: orphans[0]!.id,
      actedThisRound: [],
    };
    newGroups.push(g);
    for (const c of orphans) assignments.set(c.id, g.id);
  }

  if (newGroups.length === 0) {
    return { campaign, characters };
  }

  const nextChars = characters.map((c) => ({
    ...c,
    partyGroupId: assignments.get(c.id) || newGroups[0]!.id,
  }));

  const activePartyGroupId = newGroups[0]!.id;
  const active = newGroups[0]!;

  return {
    campaign: {
      ...campaign,
      partyGroups: newGroups,
      activePartyGroupId,
      activeCharacterId: active.activeCharacterId,
      actedThisRound: [],
      pendingJointAction: null,
    },
    characters: nextChars,
  };
}

export function splitPartyManually(
  campaign: Campaign,
  characters: Character[],
  movingIds: string[],
  label: string,
  locationHint = "",
): { campaign: Campaign; characters: Character[] } {
  const fromId = campaign.activePartyGroupId;
  if (!fromId || movingIds.length === 0) {
    return { campaign, characters };
  }
  const movers = new Set(movingIds);
  const staying = characters.filter(
    (c) => c.partyGroupId === fromId && !movers.has(c.id),
  );
  const leaving = characters.filter((c) => movers.has(c.id));
  if (leaving.length === 0 || staying.length === 0) {
    // Need at least one in each side for a real split.
    return { campaign, characters };
  }

  const newGroup: PartyGroup = {
    id: nanoid(),
    campaignId: campaign.id,
    label: label.trim() || "Sous-groupe",
    locationHint: locationHint.trim(),
    activeCharacterId: leaving[0]!.id,
    actedThisRound: [],
  };

  const groups = campaign.partyGroups.map((g) => {
    if (g.id !== fromId) return g;
    const acted = g.actedThisRound.filter((id) => !movers.has(id));
    const stayActive =
      g.activeCharacterId && !movers.has(g.activeCharacterId)
        ? g.activeCharacterId
        : staying[0]!.id;
    return { ...g, actedThisRound: acted, activeCharacterId: stayActive };
  });
  groups.push(newGroup);

  const nextChars = characters.map((c) =>
    movers.has(c.id) ? { ...c, partyGroupId: newGroup.id } : c,
  );

  return {
    campaign: {
      ...campaign,
      partyGroups: groups,
      activePartyGroupId: fromId,
      activeCharacterId:
        groups.find((g) => g.id === fromId)?.activeCharacterId ?? null,
      pendingJointAction: null,
    },
    characters: nextChars,
  };
}

export function mergeAllGroups(
  campaign: Campaign,
  characters: Character[],
): { campaign: Campaign; characters: Character[] } {
  const g = createDefaultPartyGroup(campaign.id);
  g.label = "Groupe";
  g.activeCharacterId = campaign.activeCharacterId ?? characters[0]?.id ?? null;
  g.actedThisRound = [];
  return {
    campaign: {
      ...campaign,
      partyGroups: [g],
      activePartyGroupId: g.id,
      activeCharacterId: g.activeCharacterId,
      actedThisRound: [],
      pendingJointAction: null,
    },
    characters: characters.map((c) => ({ ...c, partyGroupId: g.id })),
  };
}

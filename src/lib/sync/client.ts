import type { CampaignSnapshot } from "@/lib/sync/snapshot";

export async function syncPush(snapshot: CampaignSnapshot): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const res = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        joinCode: snapshot.campaign.joinCode,
        snapshot,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || "Échec sync push" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec sync" };
  }
}

export async function syncJoin(joinCode: string): Promise<{
  snapshot?: CampaignSnapshot;
  error?: string;
}> {
  try {
    const res = await fetch("/api/sync/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || "Code invalide" };
    return { snapshot: data.snapshot as CampaignSnapshot };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Échec join" };
  }
}

export async function syncPull(opts: {
  joinCode?: string;
  campaignId?: string;
}): Promise<{ snapshot?: CampaignSnapshot; error?: string }> {
  try {
    const res = await fetch("/api/sync/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || "Échec pull" };
    return { snapshot: data.snapshot as CampaignSnapshot };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Échec pull" };
  }
}

export async function ensureSyncSchema(): Promise<void> {
  try {
    await fetch("/api/sync/migrate", { method: "POST" });
  } catch {
    // ignore — tables may already exist or need manual SQL
  }
}

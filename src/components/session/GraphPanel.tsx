"use client";

import type { GraphEdge, GraphNode } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

function affinityLabel(n: number): string {
  if (n <= -3) return "haine";
  if (n === -2) return "forte hostilité";
  if (n === -1) return "méfiance";
  if (n === 0) return "neutre";
  if (n === 1) return "sympathie";
  if (n === 2) return "allié";
  return "lien fort";
}

export function GraphPanel({ open, onClose, nodes, edges }: Props) {
  if (!open) return null;

  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-sm">
      <button type="button" className="flex-1" aria-label="Fermer" onClick={onClose} />
      <aside className="panel fade-in h-full w-[min(100%,24rem)] overflow-y-auto rounded-none border-y-0 border-r-0 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-amber">
              Graphe
            </p>
            <h2 className="font-display text-2xl">Relations</h2>
          </div>
          <button type="button" className="btn btn-ghost px-3 py-2" onClick={onClose}>
            Fermer
          </button>
        </div>

        <section className="mb-5">
          <h3 className="mb-2 text-xs uppercase tracking-[0.14em] text-parchment-dim">
            Entités ({nodes.length})
          </h3>
          <ul className="space-y-2">
            {nodes.length === 0 && (
              <li className="text-sm text-parchment-dim">Aucune entité encore.</li>
            )}
            {nodes.map((n) => (
              <li key={n.id} className="rounded-xl border border-line bg-ink/40 p-3 text-sm">
                <div className="text-amber">
                  [{n.type}] {n.name}
                </div>
                <p className="mt-1 text-parchment-dim">{n.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-xs uppercase tracking-[0.14em] text-parchment-dim">
            Liens ({edges.length})
          </h3>
          <ul className="space-y-2">
            {edges.length === 0 && (
              <li className="text-sm text-parchment-dim">Aucun lien encore.</li>
            )}
            {edges.map((e) => (
              <li key={e.id} className="rounded-xl border border-line bg-ink/40 p-3 text-sm">
                <div>
                  {byId.get(e.fromId)?.name || e.fromId}
                  <span className="text-amber"> —{e.relation}→ </span>
                  {byId.get(e.toId)?.name || e.toId}
                </div>
                <div className="mt-1 text-xs text-parchment-dim">
                  {e.category} · {affinityLabel(e.affinity ?? 0)} ({e.affinity ?? 0})
                  {e.revealed === false ? " · secret" : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

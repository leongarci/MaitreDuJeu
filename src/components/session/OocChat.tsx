"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/types";

type Props = {
  messages: Message[];
  busy: boolean;
  onSend: (text: string) => void;
  variant: "sidebar" | "drawer";
  onClose?: () => void;
};

export function OocChat({ messages, busy, onSend, variant, onClose }: Props) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  const body = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-amber">
            Hors-jeu
          </p>
          <p className="text-[11px] text-parchment-dim">
            Questions au MJ (règles, UI, ce que vous savez). Pas un tour, pas un
            PNJ.
          </p>
        </div>
        {variant === "drawer" && onClose && (
          <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={onClose}>
            Fermer
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-xs text-parchment-dim">
            Ex. « Est-ce qu’on a déjà rencontré ce PNJ ? » ou « Pourquoi le
            tour est bloqué ? »
          </p>
        )}
        {messages.map((m) => {
          const isGm = m.role === "ooc_gm";
          return (
            <article
              key={m.id}
              className={`rounded-xl border px-2.5 py-2 text-xs leading-relaxed ${
                isGm
                  ? "border-amber/25 bg-amber/8 text-parchment"
                  : "border-line bg-ink/35 text-parchment"
              }`}
            >
              <div
                className={`mb-0.5 text-[10px] uppercase tracking-[0.14em] ${
                  isGm ? "text-amber" : "text-parchment-dim"
                }`}
              >
                {isGm ? "MJ" : "Table"}
              </div>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </article>
          );
        })}
        {busy && (
          <p className="pulse-soft text-xs text-amber">Le MJ réfléchit…</p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value || busy) return;
          setText("");
          onSend(value);
        }}
      >
        <input
          className="field py-2 text-sm"
          placeholder="Question hors-RP…"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary shrink-0 px-3 py-2 text-xs"
          disabled={busy || !text.trim()}
        >
          OK
        </button>
      </form>
    </>
  );

  if (variant === "drawer") {
    return (
      <div className="fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-sm">
        <button type="button" className="flex-1" aria-label="Fermer" onClick={onClose} />
        <aside className="panel flex h-full w-[min(100%,22rem)] flex-col rounded-none border-y-0 border-r-0 p-4">
          {body}
        </aside>
      </div>
    );
  }

  return (
    <aside className="panel sticky top-2 flex max-h-[calc(100dvh-8rem)] flex-col p-3">
      {body}
    </aside>
  );
}

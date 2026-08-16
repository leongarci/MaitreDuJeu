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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (variant !== "drawer") return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [variant]);

  const body = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-amber">
            Hors-jeu
          </p>
          <p className="text-[11px] text-parchment-dim">
            Questions au MJ (règles, UI, ce que vous savez). Pas un tour, pas un
            PNJ.
          </p>
        </div>
        {variant === "drawer" && onClose && (
          <button
            type="button"
            className="btn btn-ghost shrink-0 px-2.5 py-1.5 text-xs"
            onClick={onClose}
          >
            Fermer
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
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
          ref={inputRef}
          className="field py-2.5 text-sm"
          placeholder="Question hors-RP…"
          value={text}
          disabled={busy}
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary shrink-0 px-3 py-2.5 text-xs"
          disabled={busy || !text.trim()}
        >
          OK
        </button>
      </form>
    </>
  );

  if (variant === "drawer") {
    return (
      <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/55 backdrop-blur-sm">
        <button
          type="button"
          className="min-h-12 flex-1"
          aria-label="Fermer"
          onClick={onClose}
        />
        <aside className="panel flex h-[min(88dvh,34rem)] w-full flex-col rounded-b-none rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-parchment/25" />
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

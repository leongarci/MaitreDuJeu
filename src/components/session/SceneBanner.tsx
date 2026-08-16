"use client";

import { useEffect, useState } from "react";

interface Props {
  sceneUrl: string | null;
  sceneGenerating: boolean;
  locationHint?: string;
}

export function SceneBanner({
  sceneUrl,
  sceneGenerating,
  locationHint,
}: Props) {
  const [shownUrl, setShownUrl] = useState<string | null>(sceneUrl);
  const [opaque, setOpaque] = useState(true);

  useEffect(() => {
    if (!sceneUrl) {
      if (!sceneGenerating) setShownUrl(null);
      return;
    }
    if (sceneUrl === shownUrl) {
      setOpaque(true);
      return;
    }
    setOpaque(false);
    const t = window.setTimeout(() => {
      setShownUrl(sceneUrl);
      requestAnimationFrame(() => setOpaque(true));
    }, 220);
    return () => window.clearTimeout(t);
  }, [sceneUrl, shownUrl, sceneGenerating]);

  if (!shownUrl && !sceneGenerating && !locationHint) return null;

  return (
    <div className="relative mb-4 h-40 overflow-hidden rounded-2xl border border-line bg-ink/50 md:h-56">
      {shownUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shownUrl}
          alt={locationHint || "Scène"}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            opaque ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
      {sceneGenerating ? (
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-ink/80 via-ink/25 to-transparent">
          <p className="pulse-soft px-3 py-2 text-sm text-parchment">
            {shownUrl ? "Changement de scène…" : "Illustration de la scène…"}
          </p>
        </div>
      ) : locationHint ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-parchment-dim">
            {locationHint}
          </p>
        </div>
      ) : null}
    </div>
  );
}

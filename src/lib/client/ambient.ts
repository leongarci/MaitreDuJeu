let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function clearFade() {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function fadeTo(
  audio: HTMLAudioElement,
  target: number,
  ms: number,
  onDone?: () => void,
) {
  const start = audio.volume;
  const steps = Math.max(4, Math.round(ms / 50));
  let i = 0;
  clearFade();
  fadeTimer = setInterval(() => {
    i += 1;
    const t = Math.min(1, i / steps);
    audio.volume = Math.max(0, Math.min(1, start + (target - start) * t));
    if (t >= 1) {
      clearFade();
      onDone?.();
    }
  }, 50);
}

export function stopAmbient() {
  clearFade();
  if (current) {
    current.pause();
    current.src = "";
    current = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export async function playAmbientLoop(
  blob: Blob,
  muted: boolean,
): Promise<void> {
  if (muted) {
    stopAmbient();
    return;
  }
  const url = URL.createObjectURL(blob);
  const next = new Audio(url);
  next.loop = true;
  next.volume = 0;
  try {
    await next.play();
  } catch {
    URL.revokeObjectURL(url);
    return;
  }

  const prev = current;
  const prevUrl = currentUrl;
  current = next;
  currentUrl = url;
  fadeTo(next, 0.18, 900);
  if (prev) {
    const dying = prev;
    const dyingUrl = prevUrl;
    let v = dying.volume;
    const steps = 12;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      v = Math.max(0, v - 0.18 / steps);
      dying.volume = v;
      if (i >= steps) {
        clearInterval(t);
        dying.pause();
        dying.src = "";
        if (dyingUrl && dyingUrl !== currentUrl) URL.revokeObjectURL(dyingUrl);
      }
    }, 50);
  }
}

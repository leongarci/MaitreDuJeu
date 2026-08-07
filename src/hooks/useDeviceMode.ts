"use client";

import { useEffect, useState } from "react";

export type DeviceMode = "mobile" | "desktop";

const STORAGE_KEY = "mdj_device_mode";

function detectMode(): DeviceMode {
  if (typeof window === "undefined") return "mobile";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 767px)").matches;
  return narrow || coarse ? "mobile" : "desktop";
}

export function useDeviceMode() {
  const [mode, setModeState] = useState<DeviceMode>("mobile");
  const [manual, setManual] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as DeviceMode | null;
    if (stored === "mobile" || stored === "desktop") {
      setModeState(stored);
      setManual(true);
      return;
    }
    setModeState(detectMode());
    const onResize = () => {
      if (!manual) setModeState(detectMode());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [manual]);

  function setMode(next: DeviceMode) {
    setManual(true);
    setModeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.dataset.deviceMode = next;
  }

  useEffect(() => {
    document.documentElement.dataset.deviceMode = mode;
  }, [mode]);

  return { mode, setMode, isDesktop: mode === "desktop", isMobile: mode === "mobile" };
}

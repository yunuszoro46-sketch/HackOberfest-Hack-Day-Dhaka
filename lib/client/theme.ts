"use client";

import { useCallback, useSyncExternalStore } from "react";

export const THEMES = ["console", "dim", "paper"] as const;
export type Theme = (typeof THEMES)[number];
const KEY = "teammate:theme";

/** Runs before first paint (inlined in <head>) so the saved theme never flashes. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}");if(t==="console"||t==="dim"||t==="paper")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

const listeners = new Set<() => void>();
const read = (): Theme => {
  const t = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null;
  return (THEMES as readonly string[]).includes(t ?? "") ? (t as Theme) : "console";
};

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "console" as Theme,
  );
  const setTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      // private mode: the theme still applies for this visit
    }
    listeners.forEach((l) => l());
  }, []);
  return { theme, setTheme };
}

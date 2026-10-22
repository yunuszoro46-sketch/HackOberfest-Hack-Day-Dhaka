"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun, SunDim, Volume2, VolumeX } from "lucide-react";
import { useTheme, type Theme } from "@/lib/client/theme";
import { voice } from "@/lib/client/speech";
import { cn } from "@/lib/utils";

const THEME_ITEMS: { id: Theme; label: string; icon: typeof Moon }[] = [
  { id: "console", label: "Console", icon: Moon },
  { id: "dim", label: "Dim", icon: SunDim },
  { id: "paper", label: "Paper", icon: Sun },
];

const seg = "inline-flex h-[30px] items-center gap-1.5 px-2.5 font-mono text-[11px] uppercase tracking-[.06em] transition-colors";

/** Console / Dim / Paper / Voice as one segmented group (icon + label, never icon only). */
export function ConsoleControls({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const on = useSyncExternalStore((cb) => voice.subscribe(cb), () => voice.isEnabled(), () => false);
  return (
    <div className={cn("inline-flex overflow-hidden rounded-[6px] border border-line-2 bg-panel", className)} role="group" aria-label="Display and voice">
      {THEME_ITEMS.map((t) => (
        <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)} data-theme-option={t.id}
          className={cn(seg, "border-r border-line-2", theme === t.id ? "bg-[var(--amber-ghost)] text-amber" : "text-fg-dim hover:text-fg")}>
          <t.icon className="size-3.5" aria-hidden="true" /> {t.label}
        </button>
      ))}
      <button type="button" aria-pressed={on} onClick={() => voice.setEnabled(!on)} title="Read stage summaries aloud"
        className={cn(seg, on ? "bg-[var(--amber-ghost)] text-amber" : "text-fg-dim hover:text-fg")}>
        {on ? <Volume2 className="size-3.5" aria-hidden="true" /> : <VolumeX className="size-3.5" aria-hidden="true" />} Voice {on ? "on" : "off"}
      </button>
    </div>
  );
}

"use client";

import { Check } from "lucide-react";
import { ARCHETYPES } from "@/lib/archetypes";
import { cn } from "@/lib/utils";

/** "Aesthetic DNA" cards. The chosen archetype styles the preview and is written into the build prompt. */
export function VisualArchetypes({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Visual archetype" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {ARCHETYPES.map((a) => {
        const on = a.id === selectedId;
        return (
          <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => onSelect(on ? null : a.id)} data-archetype={a.id}
            className={cn("relative flex flex-col gap-2.5 rounded-[8px] border bg-panel p-3 text-left", on ? "border-amber shadow-[0_0_0_1px_var(--amber)]" : "border-line hover:border-line-2")}>
            <span className={cn("absolute right-3 top-3 inline-flex size-[18px] items-center justify-center rounded-[4px] border", on ? "border-amber bg-amber text-amber-ink" : "border-line-2")} aria-hidden="true">
              {on && <Check className="size-3" />}
            </span>
            <span className="pr-7 font-sans text-[15px] font-semibold leading-snug">{a.name}</span>
            <span className="text-[14px] text-fg-dim">{a.tagline}</span>
            <span className="font-mono text-[12px] text-fg-faint">Optimal fit: {a.bestFor}</span>
            <span className="grid grid-cols-4 gap-1">
              {a.palette.map((p) => (
                <span key={p.hex} className="flex flex-col gap-1">
                  <span className="h-6 rounded-[4px] border border-line" style={{ background: p.hex }} aria-hidden="true" />
                  <span className="font-mono text-[11px] text-fg-dim">{p.hex}</span>
                </span>
              ))}
            </span>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 rounded-[6px] border border-line p-2 font-mono text-[12px]">
              <dt className="text-fg-faint">Display</dt><dd className="truncate">{a.typography.display}</dd>
              <dt className="text-fg-faint">Prose</dt><dd className="truncate">{a.typography.body}</dd>
              <dt className="text-fg-faint">Numerals</dt><dd className="truncate">{a.typography.data}</dd>
            </dl>
            <ul className="space-y-0.5 text-[13px] text-fg-dim">
              {a.principles.slice(0, 3).map((p) => <li key={p}>— {p}</li>)}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

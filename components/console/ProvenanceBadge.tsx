"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Provenance } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";

export type BadgeKind = Provenance["kind"] | "you";

const STYLE: Record<BadgeKind, { glyph: string; cls: string }> = {
  model: { glyph: "◆", cls: "border-amber text-amber" },
  search: { glyph: "⊙", cls: "border-ok text-ok" },
  rules: { glyph: "▢", cls: "border-line-2 text-fg-dim" },
  mock: { glyph: "▢", cls: "border-line-2 text-fg-dim" },
  you: { glyph: "●", cls: "border-ok bg-ok text-[var(--bg)]" },
};

function label(kind: BadgeKind, p?: Partial<Provenance>) {
  switch (kind) {
    case "model":
      return <>Model-generated{p?.model && <span className="text-fg-dim"> ({p.model})</span>}</>;
    case "search":
      return <>Source-verified{p?.sources !== undefined && <> · {p.sources} source{p.sources === 1 ? "" : "s"}</>}</>;
    case "rules":
      return <>Rule-based · no model</>;
    case "mock":
      return <>Mock reply · no model</>;
    case "you":
      return <>Locked by you</>;
  }
}

/** Every generated block carries one (design §4.4). Clicking opens the provenance legend. */
export function ProvenanceBadge({ kind, provenance, className }: { kind?: BadgeKind; provenance?: Partial<Provenance> | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const k: BadgeKind = kind ?? provenance?.kind ?? "rules";
  const s = STYLE[k];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-provenance={k}
        className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border px-[7px] py-[3px] font-mono text-[11px] leading-none hover:brightness-110", s.cls, className)}
        aria-label={`Provenance: ${k}. Open the provenance legend.`}>
        <span aria-hidden="true">{s.glyph}</span>
        <span>{label(k, provenance ?? undefined)}</span>
      </button>
      <ProvenanceLegendModal open={open} onOpenChange={setOpen} />
    </>
  );
}

const LEGEND: { kind: BadgeKind; text: string }[] = [
  { kind: "model", text: "Written by the language model named in brackets. Treat it as a draft: edit it, lock what you trust." },
  { kind: "search", text: "Backed by live web search results. Links are copied from the search results, never typed by the model." },
  { kind: "rules", text: "Produced by deterministic rules or a fixed template, with no model involved. Also used as the fallback when no model or search was available." },
  { kind: "mock", text: "A canned demo reply (LLM_PROVIDER=mock). Useful for trying the flow; not real analysis." },
  { kind: "you", text: "You locked this value. It goes downstream exactly as written and is never regenerated." },
];

export function ProvenanceLegendModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="space-y-0" aria-describedby="legend-desc">
        <div className="ph pr-10"><DialogTitle className="h2-console">Provenance legend</DialogTitle></div>
        <div className="pb space-y-3">
          <DialogDescription id="legend-desc">Where every generated block came from. Nothing is shown without a source label.</DialogDescription>
          <ul className="space-y-3">
            {LEGEND.map((l) => (
              <li key={l.kind} className="grid gap-1.5 sm:grid-cols-[190px_1fr] sm:items-start">
                <span><ProvenanceStatic kind={l.kind} /></span>
                <span className="text-[14px] text-fg-dim">{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Same look as the badge, without the click (used inside the legend). */
function ProvenanceStatic({ kind }: { kind: BadgeKind }) {
  const s = STYLE[kind];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[4px] border px-[7px] py-[3px] font-mono text-[11px] leading-none", s.cls)}>
      <span aria-hidden="true">{s.glyph}</span>
      <span>{label(kind, kind === "model" ? { model: "gemma-4-26b-a4b-it" } : kind === "search" ? { sources: 5 } : undefined)}</span>
    </span>
  );
}

/** Provenance from a stage reply: mock, model, or a search-backed result. */
export function provenanceFrom(res: { provider?: string; model?: string }, sources?: number): Provenance {
  const at = new Date().toISOString();
  if (res.provider === "mock") return { kind: "mock", model: res.model, at };
  if (sources !== undefined && sources > 0) return { kind: "search", model: res.model, sources, at };
  return { kind: "model", model: res.model, at };
}

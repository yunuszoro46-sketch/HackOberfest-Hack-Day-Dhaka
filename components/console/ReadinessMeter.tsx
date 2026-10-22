"use client";

import { Check, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { computeReadiness } from "@/lib/readiness";
import type { IdeaCard } from "@/lib/schema/ideaCard";

/** Build-Readiness: number + label + 5px bar; tooltip lists the six contributors (design §4.9). */
export function ReadinessMeter({ card }: { card: IdeaCard }) {
  const r = computeReadiness(card);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="flex min-w-[132px] flex-col gap-1 rounded-[6px] px-1.5 py-0.5 text-left" data-testid="readiness" aria-label={`Build readiness ${r.score} of 100`}>
          <span className="flex items-baseline gap-2">
            <span className="font-display text-[22px] font-bold leading-none text-amber tabular" data-testid="readiness-value">{r.score}</span>
            <span className="font-mono text-[10px] uppercase tracking-[.14em] text-fg-dim">Build readiness</span>
          </span>
          <span className="readiness-bar block h-[5px] w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span className="block h-full bg-amber" style={{ width: `${r.score}%` }} />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="panel max-w-xs border-line-2 bg-panel-2 p-3 text-fg">
        <ul className="space-y-1.5 font-mono text-[11px]">
          {r.contributors.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              {c.done ? <Check className="mt-px size-3.5 shrink-0 text-ok" aria-label="done" /> : <Minus className="mt-px size-3.5 shrink-0 text-fg-faint" aria-label="not yet" />}
              <span className="flex-1">{c.label}{!c.done && <span className="block text-fg-faint">{c.hint}</span>}</span>
              <span className="tabular text-fg-dim">{Math.round(c.got)}/{c.max}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

"use client";

import { AlertTriangle, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { isStale } from "@/lib/stale";
import { STAGE_STEPS, stageGate } from "@/lib/client/stages";
import type { IdeaCard, StageId } from "@/lib/schema/ideaCard";

export function Stepper({ card, current, onSelect }: { card: IdeaCard; current: StageId; onSelect: (s: StageId) => void }) {
  return (
    <nav aria-label="Stages">
      <ol className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {STAGE_STEPS.map((s, i) => {
          const gate = stageGate(card, s.id);
          const done = card.stamps[s.id] !== undefined;
          const stale = isStale(card, s.id);
          const active = s.id === current;
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                disabled={!!gate}
                title={gate ?? undefined}
                onClick={() => onSelect(s.id)}
                aria-current={active ? "step" : undefined}
                data-stage={s.id}
                data-status={stale ? "stale" : done ? "done" : gate ? "locked" : "open"}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-xs", active && "border-primary-foreground/40")}>
                  {stale ? <AlertTriangle className="size-3.5 text-warning" /> : done ? <Check className="size-3.5" /> : gate ? <Lock className="size-3" /> : i + 1}
                </span>
                <span className="whitespace-nowrap">{s.label}</span>
                {stale && <span className="ml-auto text-xs text-warning">stale</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

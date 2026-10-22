"use client";

import { Gauge } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { computeReadiness } from "@/lib/readiness";
import type { IdeaCard } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";

export function ReadinessBadge({ card }: { card: IdeaCard }) {
  const r = computeReadiness(card);
  const tone = r.score >= 75 ? "text-success border-success/40" : r.score >= 40 ? "text-warning border-warning/40" : "text-muted-foreground";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium tabular-nums", tone)} data-testid="readiness" aria-label={`Build readiness ${r.score} of 100`}>
          <Gauge className="size-4" /> Readiness {r.score}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm text-left">
        {r.improvements.length ? (
          <div>
            <p className="mb-1 font-medium">What would raise it:</p>
            <ul className="space-y-0.5">{r.improvements.map((i) => <li key={i.label}>+{i.points} · {i.label}</li>)}</ul>
          </div>
        ) : "Everything is in place."}
      </TooltipContent>
    </Tooltip>
  );
}

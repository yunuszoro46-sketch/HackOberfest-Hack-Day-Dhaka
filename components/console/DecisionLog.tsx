"use client";

import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { IdeaCard, LogEntry } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";

const GLYPH: Record<LogEntry["kind"], { g: string; cls: string }> = {
  stage: { g: "◆", cls: "text-fg-dim" },
  lock: { g: "●", cls: "text-ok" },
  unlock: { g: "○", cls: "text-fg-dim" },
  direction: { g: "→", cls: "text-amber" },
  approve: { g: "✓", cls: "text-ok" },
  stack: { g: "▤", cls: "text-amber" },
  sign: { g: "✎", cls: "text-amber" },
  prompt: { g: "¶", cls: "text-info" },
  check: { g: "☑", cls: "text-info" },
  review: { g: "✉", cls: "text-info" },
};

/** The decision log: every lock, pick, approval, sign-off, prompt version, build check and review, newest first. */
export function DecisionLog({ card, className }: { card: IdeaCard; className?: string }) {
  const entries = [...card.log].reverse();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className={className} data-testid="open-log"><ScrollText /> Log <span className="tabular font-mono text-[12px] text-fg-faint">{card.log.length}</span></Button>
      </DialogTrigger>
      <DialogContent className="max-w-[620px]" data-testid="decision-log">
        <p className="eyebrow">Supervision</p>
        <DialogTitle className="text-[20px] font-semibold">Decision log</DialogTitle>
        <DialogDescription className="text-[15px] text-fg-dim">What you decided and when. It ships in the bundle as DECISIONS.md.</DialogDescription>
        {entries.length ? (
          <ol className="max-h-[60vh] space-y-0 overflow-auto pr-1">
            {entries.map((e, i) => (
              <li key={`${e.at}-${i}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-b border-line py-2 last:border-0" data-kind={e.kind}>
                <span className={cn("w-4 text-center font-mono text-[15px]", GLYPH[e.kind].cls)} aria-hidden="true">{GLYPH[e.kind].g}</span>
                <div className="min-w-0">
                  <p className="text-[15px]">{e.text}</p>
                  <p className="tabular font-mono text-[12px] text-fg-faint"><span className="uppercase">{e.kind}</span> · {new Date(e.at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="text-[15px] text-fg-dim">No decisions yet. Locks, picks, approvals and sign-offs appear here.</p>}
      </DialogContent>
    </Dialog>
  );
}

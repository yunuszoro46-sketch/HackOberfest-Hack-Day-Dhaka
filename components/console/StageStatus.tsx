"use client";

import { AlertTriangle, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useElapsed } from "@/lib/client/useStageRun";
import type { StageCallError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

/** "COUNCIL · running Target User… 1.8s": which stage is running and for how long (design §4.11). */
export function RunningLine({ label, startedAt }: { label: string; startedAt: number | null }) {
  const secs = useElapsed(startedAt);
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 font-mono text-[12px] text-fg-dim" data-testid="stage-loading">
      <span className="blink text-amber" aria-hidden="true">●</span>
      <span className="uppercase tracking-[.06em]">{label}…</span>
      <span className="tabular ml-auto text-amber">{secs}s</span>
    </p>
  );
}

/** Skeleton blocks, never a spinner. */
export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton h-4" style={{ width: `${92 - i * 14}%` }} />)}
    </div>
  );
}

/** Red-outlined panel: plain-English first line, raw output disclosure, Retry. Never a blank area. */
export function StageError({ error, onRetry }: { error: StageCallError; onRetry?: () => void }) {
  return (
    <section role="alert" className="panel border-crit" data-testid="stage-error">
      <div className="pb space-y-2">
        <p className="flex items-start gap-2 text-fg"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-crit" aria-hidden="true" /><span><span className="font-medium">That step did not finish.</span> {plainEnglish(error)}</span></p>
        <div className="flex flex-wrap items-center gap-2">
          {onRetry && <Button size="sm" onClick={onRetry}><RotateCcw /> Retry</Button>}
          <Collapsible>
            <CollapsibleTrigger asChild><Button size="sm" variant="ghost"><ChevronDown /> Show raw output</Button></CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-[6px] border border-line bg-[var(--bg)] p-2 font-mono text-[12px] text-fg-dim">
                {`HTTP ${error.status}\n${error.message}${error.detail ? `\n${error.detail}` : ""}${error.raw ? `\n\n--- model output ---\n${error.raw}` : ""}`}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </section>
  );
}

function plainEnglish(e: StageCallError): string {
  if (e.status === 422) return "The model returned text that isn't valid JSON for this step. Retry sends the error back to the model.";
  if (e.status === 503) return `${e.message} Set it on the server, or use the example idea.`;
  if (e.status === 429) return e.message;
  if (e.status === 0) return "TeamMate's server could not be reached. Check your connection and retry.";
  return e.message;
}

/** Dashed panel: one sentence and one button. */
export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[8px] border border-dashed border-line-2 p-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-fg-dim">{text}</p>
      {action}
    </div>
  );
}

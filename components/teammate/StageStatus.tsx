"use client";

import { AlertTriangle, ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useElapsed } from "@/lib/client/useStageRun";
import type { StageCallError } from "@/lib/client/api";

/** Which stage is running and for how long. */
export function StageLoading({ label, startedAt }: { label: string; startedAt: number | null }) {
  const secs = useElapsed(startedAt);
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-testid="stage-loading">
      <Loader2 className="size-4 animate-spin" />
      <span>{label}…</span>
      <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">{secs}s</span>
    </div>
  );
}

/** A failed stage: the message, the raw model reply in a collapsible panel, and Retry. Never a blank screen. */
export function StageError({ error, onRetry }: { error: StageCallError; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" data-testid="stage-error">
      <AlertTriangle />
      <AlertTitle>That stage failed</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {error.detail && <p className="text-xs">{error.detail}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RotateCcw /> Retry</Button>}
          {(error.raw || error.status) && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="ghost"><ChevronDown /> Raw error</Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 max-h-60 w-full overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs text-foreground">
                  {`HTTP ${error.status}\n${error.message}${error.detail ? `\n${error.detail}` : ""}${error.raw ? `\n\n--- model reply ---\n${error.raw}` : ""}`}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

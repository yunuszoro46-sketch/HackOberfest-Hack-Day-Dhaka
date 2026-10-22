"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchHealth, type Health } from "@/lib/client/api";
import { useIdea } from "@/lib/client/IdeaContext";
import { applyPatch } from "@/lib/client/patch";
import { STALE_RUNNERS, STAGE_STEPS, stageGate, stageLabel } from "@/lib/client/stages";
import { useStageRun } from "@/lib/client/useStageRun";
import { stamp, staleStages } from "@/lib/stale";
import type { StageId } from "@/lib/schema/ideaCard";
import { summaryTitle } from "@/lib/store/IdeaStore";
import { ArchitectureStage } from "./ArchitectureStage";
import { CouncilStage } from "./CouncilStage";
import { InterrogatorStage } from "./InterrogatorStage";
import { PreviewStage } from "./PreviewStage";
import { PromptStage } from "./PromptStage";
import { ReadinessBadge } from "./ReadinessBadge";
import { StageError, StageLoading } from "./StageStatus";
import { Stepper } from "./Stepper";

export function Workspace() {
  const { card, loaded, update, latest, saveError } = useIdea();
  const runner = useStageRun();
  const [current, setCurrent] = useState<StageId | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  // Open the first stage that is not done yet.
  useEffect(() => {
    if (!card || current) return;
    const next = STAGE_STEPS.find((s) => card.stamps[s.id] === undefined && !stageGate(card, s.id));
    setCurrent(next?.id ?? "interrogate");
  }, [card, current]);

  if (!loaded) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  if (!card) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="mb-4">This idea is not in this browser&apos;s storage.</p>
        <Button asChild><Link href="/">Back to your ideas</Link></Button>
      </div>
    );
  }

  const stale = staleStages(card);
  const go = (s: StageId) => {
    runner.clear();
    setCurrent(s);
  };

  const regenerateStale = () =>
    runner.run("Regenerating stale stages", async () => {
      for (const s of stale) {
        const run = STALE_RUNNERS[s];
        if (!run) continue;
        const patch = await run(latest()!);
        update((c) => stamp(applyPatch(c, patch), s));
      }
    });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">TeamMate</Link>
          <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">{summaryTitle(card)}</span>
          <div className="ml-auto flex items-center gap-2">
            {health && (
              <Badge variant={health.provider === "mock" || !health.providerConfigured ? "warning" : "outline"} title="Model provider for every stage">
                <Bot /> {health.provider === "mock" ? "mock replies" : `${health.provider} · ${health.model}`}
              </Badge>
            )}
            <ReadinessBadge card={card} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="md:sticky md:top-20 md:self-start">
          <Stepper card={card} current={current ?? "interrogate"} onSelect={go} />
        </aside>
        <main className="min-w-0 space-y-4">
          {health && !health.providerConfigured && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>No model key on the server</AlertTitle>
              <AlertDescription>Set GEMINI_API_KEY (or LLM_PROVIDER=mock for canned replies). You can still edit the card and load the example idea.</AlertDescription>
            </Alert>
          )}
          {saveError && <Alert variant="destructive"><AlertTitle>Could not save to this browser</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
          {stale.length > 0 && (
            <Alert variant="warning" data-testid="stale-banner">
              <AlertTriangle />
              <AlertTitle>Upstream edits made {stale.length === 1 ? "a stage" : `${stale.length} stages`} stale</AlertTitle>
              <AlertDescription>
                <p>{stale.map(stageLabel).join(", ")} ran on older inputs. Locked fields survive regeneration.</p>
                <Button size="sm" variant="outline" className="mt-1" onClick={regenerateStale} disabled={!!runner.running}><RefreshCw /> Regenerate stale</Button>
              </AlertDescription>
            </Alert>
          )}
          {runner.running && <StageLoading label={runner.running} startedAt={runner.startedAt} />}
          {runner.error && <StageError error={runner.error} onRetry={runner.retry} />}

          {current === "interrogate" && <InterrogatorStage runner={runner} onDone={() => go("council")} />}
          {current === "council" && <CouncilStage runner={runner} onDone={() => go("preview")} />}
          {current === "preview" && <PreviewStage runner={runner} onDone={() => go("architecture")} />}
          {current === "architecture" && <ArchitectureStage runner={runner} onDone={() => go("prompt")} />}
          {current === "prompt" && <PromptStage />}
        </main>
      </div>
    </div>
  );
}

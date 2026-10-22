"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/console/Chip";
import { ReadinessMeter } from "@/components/console/ReadinessMeter";
import { RailFooter, StageStrip, StepperRail } from "@/components/console/StepperRail";
import { RunningLine, StageError } from "@/components/console/StageStatus";
import { Crumb, TopBar } from "@/components/console/TopBar";
import { fetchHealth, type Health } from "@/lib/client/api";
import { useIdea } from "@/lib/client/IdeaContext";
import { voice } from "@/lib/client/speech";
import { STALE_RUNNERS, STAGE_STEPS, stageGate, stageLabel } from "@/lib/client/stages";
import { useStageRun } from "@/lib/client/useStageRun";
import { stamp, staleStages } from "@/lib/stale";
import type { StageId } from "@/lib/schema/ideaCard";
import { summaryTitle } from "@/lib/store/IdeaStore";
import { ArchitectureStage } from "./ArchitectureStage";
import { CouncilStage } from "./CouncilStage";
import { IdeaStage } from "./IdeaStage";
import { PreviewStage } from "./PreviewStage";
import { PromptStage } from "./PromptStage";

export type Announce = (text: string) => void;

export function Workspace() {
  const { card, loaded, update, latest, saveError, savedAt } = useIdea();
  const runner = useStageRun();
  const [current, setCurrent] = useState<StageId | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  // Open the first stage that is not done yet.
  useEffect(() => {
    if (!card || current) return;
    const next = STAGE_STEPS.find((s) => card.stamps[s.id] === undefined && !stageGate(card, s.id));
    setCurrent(next?.id ?? "interrogate");
  }, [card, current]);

  /** Screen readers hear stage results; Voice (when on) reads them aloud. */
  const announce: Announce = useCallback((text) => {
    setAnnouncement(text);
    voice.say(text);
  }, []);

  const go = useCallback((s: StageId) => {
    runner.clear();
    setCurrent(s);
    window.scrollTo({ top: 0 });
  }, [runner]);

  if (!loaded) return <div className="p-8"><div className="skeleton h-6 w-64" /></div>;
  if (!card) {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-8">
        <p>This idea is not in this browser&apos;s storage.</p>
        <Button asChild variant="primary"><Link href="/">Back to your ideas</Link></Button>
      </main>
    );
  }

  const stale = staleStages(card);
  const staleModel = stale.filter((s) => STALE_RUNNERS[s]);
  const stage = current ?? "interrogate";

  const regenerateStale = () =>
    runner.run("Regenerating stale stages", async () => {
      for (const s of staleModel) {
        const next = await STALE_RUNNERS[s]!(latest()!);
        update(() => stamp(next, s));
      }
      announce(`Regenerated ${staleModel.map(stageLabel).join(", ")}.`);
    });

  return (
    <div className="min-[860px]:flex">
      <StepperRail card={card} current={stage} onSelect={go} health={health} />
      <div className="min-w-0 flex-1">
        <TopBar
          crumbs={[<Crumb key="i" href="/">Idea</Crumb>, <Crumb key="t">{summaryTitle(card).slice(0, 48)}</Crumb>]}
          right={<ReadinessMeter card={card} />}
          mobileSheet={<RailFooter health={health} />}
        />
        <StageStrip card={card} current={stage} onSelect={go} />
        <main className="mx-auto w-full max-w-[1180px] space-y-5 px-4 py-6 sm:px-6">
          <p className="sr-only" aria-live="polite" data-testid="announcer">{announcement}</p>
          {health && !health.providerConfigured && (
            <section className="panel border-crit" role="status">
              <p className="pb flex items-start gap-2"><span className="text-crit" aria-hidden="true">✕</span><span><span className="font-medium">No model key on the server.</span> <span className="text-fg-dim">Set GEMINI_API_KEY, or LLM_PROVIDER=mock for canned replies. You can still edit the card and load the example idea.</span></span></p>
            </section>
          )}
          {saveError && <section className="panel border-crit" role="alert"><p className="pb text-crit">✕ Could not save to this browser: {saveError}</p></section>}
          {stale.length > 0 && (
            <section className="panel border-warn" data-testid="stale-banner">
              <div className="pb flex flex-wrap items-center gap-3">
                <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-[14px]">
                  <span className="font-medium">Upstream edits made {stale.map(stageLabel).join(", ")} stale.</span>{" "}
                  <span className="text-fg-dim">Locked fields survive regeneration.{stale.includes("prompt") && " The prompt needs a new sign-off."}</span>
                </p>
                {staleModel.length > 0 && <Button size="sm" onClick={regenerateStale} disabled={!!runner.running}><RefreshCw /> Regenerate stale</Button>}
              </div>
            </section>
          )}
          {runner.running && <RunningLine label={runner.running} startedAt={runner.startedAt} />}
          {runner.error && <StageError error={runner.error} onRetry={runner.retry} />}

          {stage === "interrogate" && <IdeaStage runner={runner} announce={announce} onDone={() => go("council")} savedAt={savedAt} />}
          {stage === "council" && <CouncilStage runner={runner} announce={announce} onDone={() => go("preview")} />}
          {stage === "preview" && <PreviewStage runner={runner} announce={announce} onDone={() => go("architecture")} onBack={() => go("council")} />}
          {stage === "architecture" && <ArchitectureStage runner={runner} announce={announce} onDone={() => go("prompt")} />}
          {stage === "prompt" && <PromptStage announce={announce} />}
          <footer className="pt-6 font-mono text-[11px] text-fg-faint">
            <Chip tone="default">The Human Has the Key</Chip>
          </footer>
        </main>
      </div>
    </div>
  );
}

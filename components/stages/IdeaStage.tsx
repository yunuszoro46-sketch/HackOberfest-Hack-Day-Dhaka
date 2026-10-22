"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/console/Chip";
import { LockableField, LockableLines } from "@/components/console/LockableField";
import { Panel, PanelBody, PanelHeader, StageHeading } from "@/components/console/Panel";
import { ProvenanceBadge } from "@/components/console/ProvenanceBadge";
import { useIdea } from "@/lib/client/IdeaContext";
import { applyStage, provenanceOf, runInterrogate } from "@/lib/client/stages";
import type { useStageRun } from "@/lib/client/useStageRun";
import { INTERROGATOR_QUESTIONS, type InterrogateField } from "@/lib/prompts/interrogate";
import { stamp } from "@/lib/stale";
import type { Constraints, IdeaCard } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";
import type { Announce } from "./Workspace";

const HINTS = [
  "One sentence. A verb the user performs, e.g. “Students hold a free study room in two taps.”",
  "Be exact about who, and name today’s workaround.",
  "What changed recently that makes this possible or urgent?",
  "Team size, days left, budget, skills, tech you must use or avoid.",
  "List what it is not, separated by commas.",
];

type Runner = ReturnType<typeof useStageRun>;
type TextField = "problem" | "targetUser" | "coreAction" | "whyNow";

/** Before the model runs, answers fill the card directly so the user sees it take shape. */
function prefill(c: IdeaCard, answers: string[]): IdeaCard {
  if (c.stamps.interrogate !== undefined) return c;
  const set = (k: TextField, v: string) => (c[k].locked || c[k].generatedAt ? c[k] : { ...c[k], value: v });
  const firstSentence = (s: string) => (s.split(/(?<=[.!?])\s/)[0] ?? s).trim();
  return {
    ...c,
    coreAction: set("coreAction", answers[0] ?? ""),
    targetUser: set("targetUser", answers[1] ?? ""),
    whyNow: set("whyNow", answers[2] ?? ""),
    problem: set("problem", firstSentence(c.raw)),
    outOfScope: c.outOfScope.locked || c.outOfScope.generatedAt ? c.outOfScope : { ...c.outOfScope, value: (answers[4] ?? "").split(",").map((s) => s.trim()).filter(Boolean) },
  };
}

export function IdeaStage({ runner, announce, onDone, savedAt }: { runner: Runner; announce: Announce; onDone: () => void; savedAt: number | null }) {
  const { card, update, latest } = useIdea();
  const [step, setStep] = useState(() => Math.min(4, card?.answers.filter((a) => a.trim()).length ?? 0));
  const [regenerating, setRegenerating] = useState<InterrogateField | null>(null);
  if (!card) return null;

  const answers = INTERROGATOR_QUESTIONS.map((_, i) => card.answers[i] ?? "");
  const answeredAll = answers.every((a) => a.trim());
  const built = card.stamps.interrogate !== undefined;
  const setAnswer = (i: number, v: string) =>
    update((c) => {
      const next = INTERROGATOR_QUESTIONS.map((_, k) => (k === i ? v : c.answers[k] ?? ""));
      return prefill({ ...c, answers: next }, next);
    });

  const build = async () => {
    const res = await runInterrogate(latest()!);
    update((c) => stamp(applyStage(c, res.patch, "interrogate", provenanceOf(res)), "interrogate"));
    announce("Idea card built. Lock the fields you trust.");
  };

  const runCouncil = () =>
    runner.run("Idea · sharpening the card", async () => {
      if (!built) await build();
      onDone();
    });

  const regenerate = (field: InterrogateField) => {
    setRegenerating(field);
    return runner.run(`Idea · regenerating ${field}`, async () => {
      try {
        const res = await runInterrogate(latest()!, [field]);
        update((c) => applyStage(c, res.patch, "interrogate", provenanceOf(res)));
      } finally {
        setRegenerating(null);
      }
    });
  };

  const setText = (k: TextField, value: string) => update((c) => ({ ...c, [k]: { ...c[k], value } }));
  const toggle = (k: TextField | "outOfScope") => update((c) => ({ ...c, [k]: { ...c[k], locked: !c[k].locked } }));
  const busy = !!runner.running;

  return (
    <div className="space-y-5" data-testid="idea-stage">
      <StageHeading eyebrow="Stage 01 · Idea" title="Answer five questions. Watch the card take shape." lead="Not a chat. Five fixed questions, then a card you can edit and lock field by field." />

      <div className="grid gap-5 min-[860px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Panel aria-labelledby="q-h" data-testid="interrogator">
          <div className="ph">
            <div className="flex w-full gap-1" aria-label={`Question ${step + 1} of 5`} role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1}>
              {INTERROGATOR_QUESTIONS.map((_, i) => (
                <span key={i} className={cn("h-[5px] flex-1 rounded-full", answers[i].trim() ? "bg-amber" : i === step ? "bg-line-2" : "bg-line")} />
              ))}
            </div>
          </div>
          <PanelBody className="space-y-3">
            <p className="eyebrow" data-testid="question-count">Question {step + 1} of 5</p>
            <h3 id="q-h" className="font-display text-[20px] font-semibold leading-snug">
              <label htmlFor="answer">{INTERROGATOR_QUESTIONS[step]}</label>
            </h3>
            <textarea id="answer" rows={4} className="field" value={answers[step]} maxLength={1000} autoFocus
              onChange={(e) => setAnswer(step, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && step < 4 && answers[step].trim()) setStep(step + 1);
              }} />
            <p className="text-[14px] text-fg-faint">{HINTS[step]}</p>
            <div className="flex items-center justify-between gap-2">
              <Button onClick={() => setStep(step - 1)} disabled={step === 0}><ArrowLeft /> Back</Button>
              {step < 4 ? (
                <Button onClick={() => setStep(step + 1)} disabled={!answers[step].trim()} title={answers[step].trim() ? undefined : "Answer this question first"}>Next <ArrowRight /></Button>
              ) : (
                <Button onClick={() => runner.run("Idea · sharpening the card", build)} disabled={!answeredAll || busy} data-testid="build-card"
                  title={answeredAll ? "Ask the model to sharpen the card" : "Answer all five questions first"}><Sparkles /> {built ? "Rebuild card" : "Build card"}</Button>
              )}
            </div>
            {card.raw && <p className="border-t border-line pt-3 text-[14px] text-fg-dim"><span className="label-mono">Your paragraph · </span>{card.raw}</p>}
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="card-h" data-testid="idea-card">
          <PanelHeader id="card-h" title="Idea card" right={<>
            {card.provenance.interrogate && <ProvenanceBadge provenance={card.provenance.interrogate} />}
            <Chip key={savedAt ?? 0} className={savedAt ? "saved-flash" : undefined} tone="default" icon={<span aria-hidden="true">●</span>}>v{card.version} · autosaved</Chip>
          </>} />
          <PanelBody className="space-y-3">
            <LockableField id="coreAction" label="Core action" value={card.coreAction.value} locked={card.coreAction.locked} rows={2}
              onChange={(v) => setText("coreAction", v)} onToggleLock={() => toggle("coreAction")} onRegenerate={built ? () => regenerate("coreAction") : undefined} regenerating={regenerating === "coreAction"} busy={busy} />
            <LockableField id="problem" label="Problem" value={card.problem.value} locked={card.problem.locked} rows={2}
              onChange={(v) => setText("problem", v)} onToggleLock={() => toggle("problem")} onRegenerate={built ? () => regenerate("problem") : undefined} regenerating={regenerating === "problem"} busy={busy} />
            <LockableField id="targetUser" label="Target user" value={card.targetUser.value} locked={card.targetUser.locked} rows={2}
              onChange={(v) => setText("targetUser", v)} onToggleLock={() => toggle("targetUser")} onRegenerate={built ? () => regenerate("targetUser") : undefined} regenerating={regenerating === "targetUser"} busy={busy} />
            <LockableField id="whyNow" label="Why now" value={card.whyNow.value} locked={card.whyNow.locked} rows={2}
              onChange={(v) => setText("whyNow", v)} onToggleLock={() => toggle("whyNow")} onRegenerate={built ? () => regenerate("whyNow") : undefined} regenerating={regenerating === "whyNow"} busy={busy} />
            <LockableLines id="outOfScope" label="Out of scope" value={card.outOfScope.value} locked={card.outOfScope.locked}
              onChange={(v) => update((c) => ({ ...c, outOfScope: { ...c.outOfScope, value: v } }))} onToggleLock={() => toggle("outOfScope")}
              onRegenerate={built ? () => regenerate("outOfScope") : undefined} regenerating={regenerating === "outOfScope"} busy={busy} />
            <ConstraintsEditor constraints={card.constraints} onChange={(p) => update((c) => ({ ...c, constraints: { ...c.constraints, ...p } }))} />
          </PanelBody>
        </Panel>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={runCouncil} disabled={!answeredAll || busy} data-testid="run-council-from-idea"
          title={answeredAll ? undefined : "Answer all five questions first"}><Users /> Run Council <ArrowRight /></Button>
      </div>
    </div>
  );
}

const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

function ConstraintsEditor({ constraints: c, onChange }: { constraints: IdeaCard["constraints"]; onChange: (p: Partial<Constraints>) => void }) {
  const num = (v: string, min: number) => Math.max(min, Number(v) || 0);
  const box = "space-y-1";
  const lab = "label-mono";
  return (
    <div className="rounded-[8px] border border-line p-3" data-field="constraints">
      <p className={cn(lab, "mb-2")}>Constraints</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={box}><label htmlFor="c-team" className={lab}>Team size</label><input id="c-team" type="number" min={1} className="field tabular font-mono" value={c.teamSize} onChange={(e) => onChange({ teamSize: num(e.target.value, 1) })} /></div>
        <div className={box}><label htmlFor="c-days" className={lab}>Days left</label><input id="c-days" type="number" min={0} className="field tabular font-mono" value={c.deadlineDays} onChange={(e) => onChange({ deadlineDays: num(e.target.value, 0) })} /></div>
        <div className={box}><label htmlFor="c-budget" className={lab}>Budget USD</label><input id="c-budget" type="number" min={0} className="field tabular font-mono" value={c.budgetUSD} onChange={(e) => onChange({ budgetUSD: num(e.target.value, 0) })} /></div>
        <div className={box}><label htmlFor="c-skills" className={lab}>Skills</label><input id="c-skills" key={c.skills.join("|")} className="field font-mono" defaultValue={c.skills.join(", ")} onBlur={(e) => onChange({ skills: csv(e.target.value) })} /></div>
        <div className={box}><label htmlFor="c-use" className={lab}>Must use</label><input id="c-use" key={c.mustUse.join("|")} className="field font-mono" defaultValue={c.mustUse.join(", ")} onBlur={(e) => onChange({ mustUse: csv(e.target.value) })} /></div>
        <div className={box}><label htmlFor="c-avoid" className={lab}>Must avoid</label><input id="c-avoid" key={c.mustAvoid.join("|")} className="field font-mono" defaultValue={c.mustAvoid.join(", ")} onBlur={(e) => onChange({ mustAvoid: csv(e.target.value) })} /></div>
      </div>
    </div>
  );
}

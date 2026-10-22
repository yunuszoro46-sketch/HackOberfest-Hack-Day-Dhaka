"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useIdea } from "@/lib/client/IdeaContext";
import { applyPatch } from "@/lib/client/patch";
import { runInterrogate } from "@/lib/client/stages";
import type { useStageRun } from "@/lib/client/useStageRun";
import { INTERROGATOR_QUESTIONS, type InterrogateField } from "@/lib/prompts/interrogate";
import { stamp } from "@/lib/stale";
import type { Constraints, IdeaCard } from "@/lib/schema/ideaCard";
import { LockableField, LockableLines } from "./LockableField";

const PLACEHOLDERS = [
  "e.g. Students book a free study room in two taps.",
  "e.g. Undergraduates in exam weeks; today they walk floor to floor checking doors.",
  "e.g. The library just installed room sensors and nobody uses the data.",
  "e.g. Solo, 2 days, $0 budget, I know React and TypeScript, must avoid native mobile.",
  "e.g. Not a calendar app, not a campus-wide booking system, no payments.",
];

type Runner = ReturnType<typeof useStageRun>;

export function InterrogatorStage({ runner, onDone }: { runner: Runner; onDone: () => void }) {
  const { card, update, latest } = useIdea();
  const answered = !!card && card.stamps.interrogate !== undefined;
  const [asking, setAsking] = useState(!answered);
  const [step, setStep] = useState(0);
  const [regenerating, setRegenerating] = useState<InterrogateField | null>(null);
  if (!card) return null;

  const answers = INTERROGATOR_QUESTIONS.map((_, i) => card.answers[i] ?? "");
  const setAnswer = (i: number, v: string) => update((c) => ({ ...c, answers: INTERROGATOR_QUESTIONS.map((_, k) => (k === i ? v : c.answers[k] ?? "")) }));

  const build = () =>
    runner.run("Interrogator: building your Idea Card", async () => {
      const res = await runInterrogate(latest()!);
      update((c) => stamp(applyPatch(c, res.patch), "interrogate"));
      setAsking(false);
    });

  const regenerate = (field: InterrogateField) => {
    setRegenerating(field);
    return runner.run(`Interrogator: regenerating ${field}`, async () => {
      try {
        const res = await runInterrogate(latest()!, [field]);
        update((c) => applyPatch(c, res.patch));
      } finally {
        setRegenerating(null);
      }
    });
  };

  const setLockable = (k: "problem" | "targetUser" | "coreAction" | "whyNow", value: string) => update((c) => ({ ...c, [k]: { ...c[k], value } }));
  const toggle = (k: "problem" | "targetUser" | "coreAction" | "whyNow" | "outOfScope") => update((c) => ({ ...c, [k]: { ...c[k], locked: !c[k].locked } }));
  const setConstraints = (patch: Partial<Constraints>) => update((c) => ({ ...c, constraints: { ...c.constraints, ...patch } }));

  if (asking) {
    const last = step === INTERROGATOR_QUESTIONS.length - 1;
    return (
      <Card data-testid="interrogator">
        <CardHeader>
          <CardDescription>Question {step + 1} of {INTERROGATOR_QUESTIONS.length}</CardDescription>
          <Progress value={((step + 1) / INTERROGATOR_QUESTIONS.length) * 100} aria-label="Question progress" />
        </CardHeader>
        <CardContent className="space-y-4">
          {card.raw && (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Your idea: </span>{card.raw}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="answer" className="text-base">{INTERROGATOR_QUESTIONS[step]}</Label>
            <Textarea id="answer" rows={3} autoFocus value={answers[step]} placeholder={PLACEHOLDERS[step]} maxLength={1000}
              onChange={(e) => setAnswer(step, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (last ? build() : setStep(step + 1));
              }} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0}><ArrowLeft /> Back</Button>
            {last ? (
              <Button onClick={build} disabled={!!runner.running || !answers[0].trim()} data-testid="build-card"><Sparkles /> Build my Idea Card</Button>
            ) : (
              <Button onClick={() => setStep(step + 1)} disabled={!answers[step].trim()}>Next <ArrowRight /></Button>
            )}
          </div>
          {answered && <Button variant="link" className="px-0" onClick={() => setAsking(false)}>Back to the card without re-running</Button>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="idea-card">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Your Idea Card</h2>
          <p className="text-sm text-muted-foreground">Edit anything. Lock what you trust: locked fields go downstream exactly as written and are never regenerated.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setStep(0); setAsking(true); }}><Pencil /> Edit answers</Button>
      </div>
      <LockableField name="coreAction" label="Core action — the one thing the user does" field={card.coreAction} rows={2}
        onChange={(v) => setLockable("coreAction", v)} onToggleLock={() => toggle("coreAction")} onRegenerate={() => regenerate("coreAction")} regenerating={regenerating === "coreAction"} />
      <div className="grid gap-4 md:grid-cols-2">
        <LockableField name="problem" label="Problem" field={card.problem} rows={3}
          onChange={(v) => setLockable("problem", v)} onToggleLock={() => toggle("problem")} onRegenerate={() => regenerate("problem")} regenerating={regenerating === "problem"} />
        <LockableField name="targetUser" label="Target user (and what they do today)" field={card.targetUser} rows={3}
          onChange={(v) => setLockable("targetUser", v)} onToggleLock={() => toggle("targetUser")} onRegenerate={() => regenerate("targetUser")} regenerating={regenerating === "targetUser"} />
      </div>
      <LockableField name="whyNow" label="Why now" field={card.whyNow}
        onChange={(v) => setLockable("whyNow", v)} onToggleLock={() => toggle("whyNow")} onRegenerate={() => regenerate("whyNow")} regenerating={regenerating === "whyNow"} />
      <ConstraintsEditor constraints={card.constraints} onChange={setConstraints} />
      <LockableLines name="outOfScope" label="Out of scope — what this app is not" field={card.outOfScope}
        onChange={(v) => update((c) => ({ ...c, outOfScope: { ...c.outOfScope, value: v } }))} onToggleLock={() => toggle("outOfScope")}
        onRegenerate={() => regenerate("outOfScope")} regenerating={regenerating === "outOfScope"} />
      <div className="flex justify-end">
        <Button onClick={onDone} disabled={!card.coreAction.value.trim()}>Next: Council & Directions <ArrowRight /></Button>
      </div>
    </div>
  );
}

const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

function ConstraintsEditor({ constraints: c, onChange }: { constraints: IdeaCard["constraints"]; onChange: (p: Partial<Constraints>) => void }) {
  const num = (v: string, min: number) => Math.max(min, Number(v) || 0);
  return (
    <Card className="gap-3 py-4">
      <CardHeader><CardTitle className="text-sm">Constraints</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="c-team">Team size</Label><Input id="c-team" type="number" min={1} value={c.teamSize} onChange={(e) => onChange({ teamSize: num(e.target.value, 1) })} /></div>
        <div className="space-y-1"><Label htmlFor="c-days">Days to deadline</Label><Input id="c-days" type="number" min={0} value={c.deadlineDays} onChange={(e) => onChange({ deadlineDays: num(e.target.value, 0) })} /></div>
        <div className="space-y-1"><Label htmlFor="c-budget">Budget (USD)</Label><Input id="c-budget" type="number" min={0} value={c.budgetUSD} onChange={(e) => onChange({ budgetUSD: num(e.target.value, 0) })} /></div>
        <div className="space-y-1"><Label htmlFor="c-skills">Skills (comma-separated)</Label><Input id="c-skills" key={c.skills.join("|")} defaultValue={c.skills.join(", ")} onBlur={(e) => onChange({ skills: csv(e.target.value) })} /></div>
        <div className="space-y-1"><Label htmlFor="c-use">Must use</Label><Input id="c-use" key={c.mustUse.join("|")} defaultValue={c.mustUse.join(", ")} onBlur={(e) => onChange({ mustUse: csv(e.target.value) })} /></div>
        <div className="space-y-1"><Label htmlFor="c-avoid">Must avoid</Label><Input id="c-avoid" key={c.mustAvoid.join("|")} defaultValue={c.mustAvoid.join(", ")} onBlur={(e) => onChange({ mustAvoid: csv(e.target.value) })} /></div>
      </CardContent>
    </Card>
  );
}

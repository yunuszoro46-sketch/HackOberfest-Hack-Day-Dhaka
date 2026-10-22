"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, ExternalLink, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useIdea } from "@/lib/client/IdeaContext";
import { applyPatch } from "@/lib/client/patch";
import { COUNCIL_PART_LABEL, runCouncilStage, type CouncilPart } from "@/lib/client/stages";
import type { useStageRun } from "@/lib/client/useStageRun";
import { PERSONA_BRIEFS } from "@/lib/prompts/council";
import { stamp } from "@/lib/stale";
import { PERSONAS, type Competitor, type Critique, type Direction, type IdeaCard } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";

type Runner = ReturnType<typeof useStageRun>;

const SOURCE_LABEL: Record<Competitor["source"], { label: string; variant: "success" | "warning" | "secondary" }> = {
  tavily: { label: "live search", variant: "success" },
  "google-search": { label: "Google Search", variant: "success" },
  "model-knowledge": { label: "model knowledge · no link", variant: "warning" },
  user: { label: "added by you", variant: "secondary" },
};

export function CouncilStage({ runner, onDone }: { runner: Runner; onDone: () => void }) {
  const { card, update, latest } = useIdea();
  const [warning, setWarning] = useState<string | null>(null);
  if (!card) return null;
  const ran = card.council !== null || card.directions.length > 0;

  const run = (parts?: CouncilPart[]) =>
    runner.run(COUNCIL_PART_LABEL[parts?.[0] ?? "council"], async () => {
      const full = !parts || parts.length === 3;
      await runCouncilStage(latest()!, (part, patch, warn) => {
        if (!patch) return;
        if (part === "competitors") setWarning(warn ?? null);
        update((c) => applyPatch(c, patch));
      }, parts);
      if (full) update((c) => stamp(c, "council"));
    });

  const setCritique = (k: (typeof PERSONAS)[number], field: keyof Critique, v: string) =>
    update((c) => (c.council ? { ...c, council: { ...c.council, [k]: { ...c.council[k], [field]: v } } } : c));
  const setCompetitor = (i: number, patch: Partial<Competitor>) =>
    update((c) => ({ ...c, competitors: c.competitors.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  const setDirection = (id: string, patch: Partial<Direction>) =>
    update((c) => ({ ...c, directions: c.directions.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));

  return (
    <div className="space-y-6" data-testid="council-stage">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Council & Directions</h2>
          <p className="text-sm text-muted-foreground">Three critics attack the card, a web search finds real competitors, then you pick a direction that answers them.</p>
        </div>
        <Button onClick={() => run()} disabled={!!runner.running} data-testid="run-council">
          {ran ? <RefreshCw /> : <Users />} {ran ? "Re-run all three" : "Run Council & Directions"}
        </Button>
      </div>

      {card.council && (
        <section aria-labelledby="crit-h" className="space-y-3">
          <h3 id="crit-h" className="font-medium">Council critiques</h3>
          <div className="grid gap-4 lg:grid-cols-3">
            {PERSONAS.map((k) => (
              <Card key={k} className="gap-3 py-4" data-persona={k}>
                <CardHeader>
                  <CardTitle className="text-base">{PERSONA_BRIEFS[k].title}</CardTitle>
                  <CardDescription>{PERSONA_BRIEFS[k].brief}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(["strongest_objection", "what_would_change_my_mind", "one_question"] as const).map((f) => (
                    <div key={f} className="space-y-1">
                      <Label htmlFor={`${k}-${f}`} className="text-xs text-muted-foreground">
                        {f === "strongest_objection" ? "Strongest objection" : f === "what_would_change_my_mind" ? "What would change my mind" : "One question for you"}
                      </Label>
                      <Textarea id={`${k}-${f}`} rows={3} className="text-sm" value={card.council![k][f]} onChange={(e) => setCritique(k, f, e.target.value)} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {(card.competitors.length > 0 || card.competitorSearch) && (
        <section aria-labelledby="comp-h" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="comp-h" className="font-medium">Competitors</h3>
            {card.competitorSearch?.mode === "none" && (
              <Badge variant="warning" data-testid="no-live-search"><AlertTriangle /> No live search — model knowledge, verify these</Badge>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => run(["competitors"])} disabled={!!runner.running}><RefreshCw /> Re-run search</Button>
          </div>
          {warning && <p className="text-xs text-muted-foreground">{warning}</p>}
          {card.competitorSearch && <p className="text-xs text-muted-foreground">Searches: {card.competitorSearch.queries.map((q) => `“${q}”`).join(" · ")}</p>}
          <Table data-testid="competitors">
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>What they solve</TableHead><TableHead>Gap they leave</TableHead><TableHead>Source</TableHead><TableHead className="w-10" /></TableRow>
            </TableHeader>
            <TableBody>
              {card.competitors.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="min-w-40">
                    <Input aria-label="Competitor name" value={c.name} onChange={(e) => setCompetitor(i, { name: e.target.value })} className="h-8" />
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-56 items-center gap-1 truncate text-xs text-primary underline">
                        <ExternalLink className="size-3 shrink-0" /> {c.url.replace(/^https?:\/\//, "")}
                      </a>
                    ) : c.source === "user" ? (
                      <Input aria-label="Competitor URL" placeholder="https://… (optional)" value={c.url} onChange={(e) => setCompetitor(i, { url: e.target.value })} className="mt-1 h-7 text-xs" />
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-56"><Textarea aria-label="What they solve" rows={2} className="text-sm" value={c.whatTheySolve} onChange={(e) => setCompetitor(i, { whatTheySolve: e.target.value })} /></TableCell>
                  <TableCell className="min-w-56"><Textarea aria-label="Gap they leave" rows={2} className="text-sm" value={c.gap} onChange={(e) => setCompetitor(i, { gap: e.target.value })} /></TableCell>
                  <TableCell><Badge variant={SOURCE_LABEL[c.source].variant}>{SOURCE_LABEL[c.source].label}</Badge></TableCell>
                  <TableCell><Button size="icon" variant="ghost" aria-label={`Remove ${c.name}`} onClick={() => update((x) => ({ ...x, competitors: x.competitors.filter((_, k) => k !== i) }))}><Trash2 /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button size="sm" variant="outline" disabled={card.competitors.length >= 8}
            onClick={() => update((c) => ({ ...c, competitors: [...c.competitors, { name: "", url: "", whatTheySolve: "", gap: "", source: "user" }] }))}>
            <Plus /> Add a competitor you know
          </Button>
        </section>
      )}

      {card.directions.length > 0 && <Directions card={card} update={update} setDirection={setDirection} onRegenerate={() => run(["directions"])} busy={!!runner.running} />}

      {ran && (
        <div className="flex items-center justify-end gap-3">
          {!card.chosenDirectionId && <span className="text-sm text-muted-foreground">Pick a direction to continue.</span>}
          <Button onClick={onDone} disabled={!card.chosenDirectionId}>Next: Preview <ArrowRight /></Button>
        </div>
      )}
    </div>
  );
}

function Directions({
  card, update, setDirection, onRegenerate, busy,
}: {
  card: IdeaCard;
  update: (fn: (c: IdeaCard) => IdeaCard) => void;
  setDirection: (id: string, patch: Partial<Direction>) => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const addOwn = () =>
    update((c) => {
      const id = `dir-own-${Date.now().toString(36)}`;
      const own: Direction = { id, title: "My direction", oneLiner: "", rationale: "", citations: [], custom: true };
      // At most three: replace the last generated, unchosen direction to make room.
      const room = c.directions.length < 3 ? c.directions : (() => {
        const drop = [...c.directions].reverse().find((d) => !d.custom && d.id !== c.chosenDirectionId);
        return drop ? c.directions.filter((d) => d.id !== drop.id) : null;
      })();
      return room ? { ...c, directions: [...room, own], chosenDirectionId: id } : c;
    });

  return (
    <section aria-labelledby="dir-h" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="dir-h" className="font-medium">Directions — pick one</h3>
        <span className="text-xs text-muted-foreground">Each is a different product bet. Your own directions and the one you pick are kept when you regenerate.</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={busy}><RefreshCw /> Regenerate others</Button>
          <Button size="sm" variant="outline" onClick={addOwn} disabled={card.directions.every((d) => d.custom || d.id === card.chosenDirectionId) && card.directions.length >= 3}><Plus /> Add your own</Button>
        </div>
      </div>
      <div role="radiogroup" aria-label="Directions" className="grid gap-4 lg:grid-cols-3">
        {card.directions.map((d) => {
          const chosen = d.id === card.chosenDirectionId;
          return (
            <Card key={d.id} className={cn("gap-3 py-4 transition-colors", chosen && "border-primary ring-2 ring-primary/30")} data-direction={d.title}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <input type="radio" name="direction" aria-label={`Choose ${d.title}`} checked={chosen} className="size-4 accent-current"
                    onChange={() => update((c) => ({ ...c, chosenDirectionId: d.id, compareDirectionId: c.compareDirectionId === d.id ? null : c.compareDirectionId }))} />
                  <Input aria-label="Direction title" value={d.title} onChange={(e) => setDirection(d.id, { title: e.target.value })} className="h-8 font-medium" />
                  {d.custom && <Badge variant="secondary">yours</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea aria-label="One-liner" rows={2} className="text-sm" placeholder="One line: what is the bet?" value={d.oneLiner} onChange={(e) => setDirection(d.id, { oneLiner: e.target.value })} />
                <Textarea aria-label="Rationale" rows={4} className="text-sm" placeholder="Which critique or competitor gap does it answer?" value={d.rationale} onChange={(e) => setDirection(d.id, { rationale: e.target.value })} />
                {d.citations.length > 0 && (
                  <ul className="flex flex-wrap gap-1 text-xs">
                    {d.citations.map((c) => (
                      <li key={c}>{/^https?:\/\//.test(c) ? <a className="text-primary underline" href={c} target="_blank" rel="noopener noreferrer">{c.replace(/^https?:\/\//, "").slice(0, 40)}</a> : <Badge variant="outline">{c}</Badge>}</li>
                    ))}
                  </ul>
                )}
                {d.custom && (
                  <Button size="sm" variant="ghost" onClick={() => update((c) => ({ ...c, directions: c.directions.filter((x) => x.id !== d.id), chosenDirectionId: c.chosenDirectionId === d.id ? null : c.chosenDirectionId }))}><Trash2 /> Remove</Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

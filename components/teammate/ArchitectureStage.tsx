"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Check, Copy, Layers, Pencil, Star } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toSql } from "@/lib/architecture/sql";
import { useIdea } from "@/lib/client/IdeaContext";
import { applyPatch } from "@/lib/client/patch";
import { runArchitecture } from "@/lib/client/stages";
import type { useStageRun } from "@/lib/client/useStageRun";
import type { DetailBlock } from "@/lib/prompts/architecture";
import { stamp } from "@/lib/stale";
import { EndpointSchema, EntitySchema, RiskSchema, ServiceSchema, type Architecture, type StackCandidate } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";
import { LockControls } from "./LockableField";
import { MermaidView } from "./MermaidView";

type Runner = ReturnType<typeof useStageRun>;

const CRITERIA: { key: keyof StackCandidate["scores"]; label: string }[] = [
  { key: "speed", label: "Speed to demo" },
  { key: "fit", label: "Fit for core action" },
  { key: "skills", label: "Your skills" },
  { key: "cost", label: "Hosting cost" },
  { key: "hackathon", label: "Hackathon-friendly" },
];
const total = (c: StackCandidate) => Object.values(c.scores).reduce((a, b) => a + b, 0);

/** Structured blocks are edited as JSON and validated with the same Zod schema the model output must pass. */
const BLOCK_SCHEMAS = {
  dataModel: z.array(EntitySchema),
  apiSurface: z.array(EndpointSchema),
  services: z.array(ServiceSchema),
  risks: z.array(RiskSchema),
} as const;

export function ArchitectureStage({ runner, onDone }: { runner: Runner; onDone: () => void }) {
  const { card, update, latest } = useIdea();
  const [busyBlock, setBusyBlock] = useState<DetailBlock | null>(null);
  if (!card) return null;
  const a = card.architecture;
  const chosen = a?.candidates.find((c) => c.id === a.chosenId) ?? null;
  const designed = !!a && !!a.chosenId && (a.diagramMermaid.value.trim() !== "" || a.dataModel.value.length > 0);

  const suggest = () =>
    runner.run("Architecture: scoring three stacks", async () => {
      const res = await runArchitecture(latest()!, "candidates");
      update((c) => applyPatch(c, res.patch));
    });

  const design = (blocks?: DetailBlock[]) => {
    if (blocks?.length === 1) setBusyBlock(blocks[0]);
    return runner.run(blocks ? `Architecture: regenerating ${blocks.join(", ")}` : "Architecture: designing diagram, data model, API, services, deployment and risks", async () => {
      try {
        const res = await runArchitecture(latest()!, "details", blocks);
        update((c) => (blocks ? applyPatch(c, res.patch) : stamp(applyPatch(c, res.patch), "architecture")));
      } finally {
        setBusyBlock(null);
      }
    });
  };

  const choose = (id: string) => {
    update((c) => (c.architecture ? { ...c, architecture: { ...c.architecture, chosenId: id } } : c));
    design();
  };

  const setBlock = <K extends DetailBlock>(k: K, value: Architecture[K]["value"]) =>
    update((c) => (c.architecture ? { ...c, architecture: { ...c.architecture, [k]: { ...c.architecture[k], value } } } : c));
  const toggleLock = (k: DetailBlock) =>
    update((c) => (c.architecture ? { ...c, architecture: { ...c.architecture, [k]: { ...c.architecture[k], locked: !c.architecture[k].locked } } } : c));
  const controls = (k: DetailBlock, name: string) => (
    <LockControls name={name} locked={a![k].locked} onToggleLock={() => toggleLock(k)} onRegenerate={() => design([k])} regenerating={busyBlock === k} disabled={!!runner.running} />
  );

  return (
    <div className="space-y-6" data-testid="architecture-stage">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Architecture</h2>
          <p className="text-sm text-muted-foreground">Three stacks scored for your constraints. Choose one to get a diagram, data model, API, services, deployment and risks.</p>
        </div>
        <Button onClick={suggest} disabled={!!runner.running} variant={a ? "outline" : "default"} data-testid="suggest-stacks">
          <Layers /> {a ? "Re-suggest stacks" : "Suggest stacks"}
        </Button>
      </div>

      {a && a.candidates.length > 0 && (
        <Table data-testid="candidates">
          <TableHeader>
            <TableRow>
              <TableHead>Stack</TableHead>
              {CRITERIA.map((c) => <TableHead key={c.key} className="text-center">{c.label}</TableHead>)}
              <TableHead className="text-center">Total</TableHead>
              <TableHead>Why / why not</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {a.candidates.map((c, i) => (
              <TableRow key={c.id} data-state={c.id === a.chosenId ? "selected" : undefined} data-candidate={c.name}>
                <TableCell className="min-w-48">
                  <div className="flex items-center gap-1.5 font-medium">{c.name}{i === 0 && <Badge variant="success"><Star /> recommended</Badge>}</div>
                  <p className="text-xs text-muted-foreground">{c.stack.join(" · ")}</p>
                </TableCell>
                {CRITERIA.map((k) => <TableCell key={k.key} className="text-center tabular-nums">{c.scores[k.key]}/5</TableCell>)}
                <TableCell className="text-center font-medium tabular-nums">{total(c)}/25</TableCell>
                <TableCell className="min-w-64 text-xs"><p><span className="font-medium">Why:</span> {c.why}</p><p className="text-muted-foreground"><span className="font-medium">Why not:</span> {c.whyNot}</p></TableCell>
                <TableCell>
                  {c.id === a.chosenId
                    ? <Badge><Check /> chosen</Badge>
                    : <Button size="sm" variant="outline" onClick={() => choose(c.id)} disabled={!!runner.running} aria-label={`Choose ${c.name}`}>Choose</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {chosen && designed && a && (
        <div className="space-y-4" data-testid="design">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Design for {chosen.name}</h3>
            <Button size="sm" variant="ghost" onClick={() => design()} disabled={!!runner.running}>Regenerate all unlocked blocks</Button>
          </div>

          <Block title="Component diagram" locked={a.diagramMermaid.locked} controls={controls("diagramMermaid", "Component diagram")}>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mermaid-src" className="text-xs text-muted-foreground">Mermaid source (live)</Label>
                <Textarea id="mermaid-src" rows={10} className="font-mono text-xs" value={a.diagramMermaid.value} onChange={(e) => setBlock("diagramMermaid", e.target.value)} />
              </div>
              <MermaidView code={a.diagramMermaid.value} />
            </div>
          </Block>

          <Block title="Data model" locked={a.dataModel.locked} controls={controls("dataModel", "Data model")} json={{ key: "dataModel", value: a.dataModel.value, onSave: (v) => setBlock("dataModel", v as Architecture["dataModel"]["value"]) }}>
            <div className="grid gap-3 md:grid-cols-2">
              {a.dataModel.value.map((e) => (
                <div key={e.name} className="rounded-md border">
                  <p className="border-b px-3 py-1.5 text-sm font-medium">{e.name}</p>
                  <Table>
                    <TableBody>
                      {e.fields.map((f) => <TableRow key={f.name}><TableCell className="font-mono text-xs">{f.name}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{f.type}</TableCell><TableCell className="text-xs text-muted-foreground">{f.note}</TableCell></TableRow>)}
                    </TableBody>
                  </Table>
                  {e.relations.length > 0 && <p className="px-3 py-1.5 text-xs text-muted-foreground">{e.relations.join(" · ")}</p>}
                </div>
              ))}
            </div>
            <SqlBlock sql={toSql(a.dataModel.value)} />
          </Block>

          <Block title="API surface" locked={a.apiSurface.locked} controls={controls("apiSurface", "API surface")} json={{ key: "apiSurface", value: a.apiSurface.value, onSave: (v) => setBlock("apiSurface", v as Architecture["apiSurface"]["value"]) }}>
            <Table data-testid="api-table">
              <TableHeader><TableRow><TableHead>Method</TableHead><TableHead>Path</TableHead><TableHead>Request</TableHead><TableHead>Response</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
              <TableBody>{a.apiSurface.value.map((ep, i) => <TableRow key={i}><TableCell><Badge variant="outline">{ep.method}</Badge></TableCell><TableCell className="font-mono text-xs">{ep.path}</TableCell><TableCell className="text-xs">{ep.request}</TableCell><TableCell className="text-xs">{ep.response}</TableCell><TableCell className="text-xs text-muted-foreground">{ep.note}</TableCell></TableRow>)}</TableBody>
            </Table>
          </Block>

          <div className="grid gap-4 lg:grid-cols-2">
            <Block title="Third-party services" locked={a.services.locked} controls={controls("services", "Third-party services")} json={{ key: "services", value: a.services.value, onSave: (v) => setBlock("services", v as Architecture["services"]["value"]) }}>
              <ul className="space-y-2 text-sm">{a.services.value.map((s) => <li key={s.name}><span className="font-medium">{s.name}</span> — {s.reason}<br /><span className="text-xs text-muted-foreground">Free tier: {s.freeTier}</span></li>)}</ul>
              {a.services.value.length === 0 && <p className="text-sm text-muted-foreground">None needed.</p>}
            </Block>
            <Block title="Deployment" locked={a.deployment.locked} controls={controls("deployment", "Deployment")}>
              {a.deployment.value && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1"><Label htmlFor="dep-target" className="text-xs">Target</Label><Input id="dep-target" value={a.deployment.value.target} onChange={(e) => setBlock("deployment", { ...a.deployment.value!, target: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor="dep-cost" className="text-xs">Cost / month (USD)</Label><Input id="dep-cost" type="number" min={0} value={a.deployment.value.estCostPerMonth} onChange={(e) => setBlock("deployment", { ...a.deployment.value!, estCostPerMonth: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="space-y-1"><Label htmlFor="dep-hours" className="text-xs">Hours to first deploy</Label><Input id="dep-hours" type="number" min={0} value={a.deployment.value.estHoursToFirstDeploy} onChange={(e) => setBlock("deployment", { ...a.deployment.value!, estHoursToFirstDeploy: Math.max(0, Number(e.target.value) || 0) })} /></div>
                </div>
              )}
            </Block>
          </div>

          <Block title="Risk register" locked={a.risks.locked} controls={controls("risks", "Risk register")} json={{ key: "risks", value: a.risks.value, onSave: (v) => setBlock("risks", v as Architecture["risks"]["value"]) }}>
            <Table>
              <TableHeader><TableRow><TableHead>Risk</TableHead><TableHead>Likelihood</TableHead><TableHead>Mitigation</TableHead></TableRow></TableHeader>
              <TableBody>{a.risks.value.map((r, i) => <TableRow key={i}><TableCell className="text-sm">{r.risk}</TableCell><TableCell><Badge variant={r.likelihood === "high" ? "destructive" : r.likelihood === "medium" ? "warning" : "secondary"}>{r.likelihood}</Badge></TableCell><TableCell className="text-sm">{r.mitigation}</TableCell></TableRow>)}</TableBody>
            </Table>
          </Block>

          <div className="flex justify-end">
            <Button onClick={onDone}>Next: Prompt <ArrowRight /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Block({
  title, locked, controls, json, children,
}: {
  title: string;
  locked: boolean;
  controls: ReactNode;
  json?: { key: keyof typeof BLOCK_SCHEMAS; value: unknown; onSave: (v: unknown) => void };
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    try {
      const parsed = BLOCK_SCHEMAS[json!.key].safeParse(JSON.parse(draft));
      if (!parsed.success) {
        setError(parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        return;
      }
      json!.onSave(parsed.data);
      setEditing(false);
    } catch (e) {
      setError(`Not valid JSON: ${(e as Error).message}`);
    }
  };
  return (
    <Card className={cn("gap-3 py-4", locked && "border-primary/40")} data-block={title}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <div className="flex items-center gap-1">
          {json && <Button size="sm" variant="ghost" onClick={() => { setDraft(JSON.stringify(json.value, null, 2)); setError(null); setEditing((e) => !e); }} aria-label={`Edit ${title}`}><Pencil /> {editing ? "Cancel" : "Edit"}</Button>}
          {controls}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing && json ? (
          <div className="space-y-2">
            <Textarea aria-label={`${title} JSON`} rows={14} className="font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} />
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        ) : children}
      </CardContent>
    </Card>
  );
}

function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs" data-testid="sql">{sql}</pre>
      <Button size="sm" variant="ghost" className="absolute right-1 top-1" onClick={() => navigator.clipboard.writeText(sql).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
        <Copy /> {copied ? "Copied" : "Copy SQL"}
      </Button>
    </div>
  );
}

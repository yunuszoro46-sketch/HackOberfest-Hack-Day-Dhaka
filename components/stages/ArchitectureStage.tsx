"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Check, Copy, Layers, Pencil, RefreshCw } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/console/Chip";
import { LockActions } from "@/components/console/LockableField";
import { MermaidView } from "@/components/console/MermaidView";
import { Panel, PanelBody, PanelHeader, StageHeading } from "@/components/console/Panel";
import { ProvenanceBadge } from "@/components/console/ProvenanceBadge";
import { EmptyState, Skeleton } from "@/components/console/StageStatus";
import { useToast } from "@/components/console/Toast";
import { toSql } from "@/lib/architecture/sql";
import { useIdea } from "@/lib/client/IdeaContext";
import { applyStage, provenanceOf, runArchitecture } from "@/lib/client/stages";
import type { useStageRun } from "@/lib/client/useStageRun";
import type { DetailBlock } from "@/lib/prompts/architecture";
import { isStale, stamp } from "@/lib/stale";
import { EndpointSchema, EntitySchema, RiskSchema, ServiceSchema, type Architecture, type IdeaCard, type StackCandidate } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";
import type { Announce } from "./Workspace";

type Runner = ReturnType<typeof useStageRun>;

const CRITERIA: { key: keyof StackCandidate["scores"]; label: string }[] = [
  { key: "speed", label: "Speed" },
  { key: "fit", label: "Fit" },
  { key: "skills", label: "Skills" },
  { key: "cost", label: "Cost" },
  { key: "hackathon", label: "Hackathon" },
];
const total = (c: StackCandidate) => Object.values(c.scores).reduce((a, b) => a + b, 0);

/** Structured blocks are edited as JSON and validated with the same Zod schema the model output must pass. */
const BLOCK_SCHEMAS = {
  dataModel: z.array(EntitySchema),
  apiSurface: z.array(EndpointSchema),
  services: z.array(ServiceSchema),
  risks: z.array(RiskSchema),
} as const;

const LIKELIHOOD = { high: { tone: "crit", icon: "▲" }, medium: { tone: "warn", icon: "■" }, low: { tone: "default", icon: "▼" } } as const;

const th = "border-b border-line py-1.5 pr-3 text-left font-normal label-mono";
const td = "border-b border-line py-1.5 pr-3 align-top";

export function ArchitectureStage({ runner, announce, onDone }: { runner: Runner; announce: Announce; onDone: () => void }) {
  const { card, update, latest } = useIdea();
  const [busyBlock, setBusyBlock] = useState<DetailBlock | null>(null);
  if (!card) return null;
  const a = card.architecture;
  const chosen = a?.candidates.find((c) => c.id === a.chosenId) ?? null;
  const designed = !!a && !!a.chosenId && (a.diagramMermaid.value.trim() !== "" || a.dataModel.value.length > 0);
  const busy = !!runner.running;
  const stale = isStale(card, "architecture");

  const suggest = () =>
    runner.run("Architecture · scoring three stacks", async () => {
      const res = await runArchitecture(latest()!, "candidates");
      update((c) => applyStage(c, res.patch, "architecture", provenanceOf(res)));
      announce("Three stacks scored. Choose one.");
    });

  const design = (blocks?: DetailBlock[]) => {
    if (blocks?.length === 1) setBusyBlock(blocks[0]);
    return runner.run(blocks ? `Architecture · regenerating ${blocks.join(", ")}` : "Architecture · designing the system", async () => {
      try {
        const res = await runArchitecture(latest()!, "details", blocks);
        update((c) => {
          const next = applyStage(c, res.patch, "architecture-details", provenanceOf(res));
          return blocks ? next : stamp(next, "architecture");
        });
        if (!blocks) announce("Design ready: diagram, data model, API, services, deployment and risks.");
      } finally {
        setBusyBlock(null);
      }
    });
  };

  const choose = (id: string) => {
    if (a?.chosenId === id && designed) return;
    update((c) => (c.architecture ? { ...c, architecture: { ...c.architecture, chosenId: id } } : c));
    design();
  };

  const setBlock = <K extends DetailBlock>(k: K, value: Architecture[K]["value"]) =>
    update((c) => (c.architecture ? { ...c, architecture: { ...c.architecture, [k]: { ...c.architecture[k], value } } } : c));
  const toggleLock = (k: DetailBlock) =>
    update((c) => (c.architecture ? { ...c, architecture: { ...c.architecture, [k]: { ...c.architecture[k], locked: !c.architecture[k].locked } } } : c));
  const actions = (k: DetailBlock, name: string) => (
    <LockActions label={name} vertical={false} locked={a![k].locked} onToggleLock={() => toggleLock(k)} onRegenerate={() => design([k])} regenerating={busyBlock === k} busy={busy} />
  );
  const prov = card.provenance["architecture-details"];

  return (
    <div className="space-y-5" data-testid="architecture-stage">
      <StageHeading eyebrow="Stage 04 · Architecture" title="Three stacks, scored for your constraints. Choose one."
        lead="The chosen stack gets a diagram, data model, API, services, deployment and risks. Lock any block to keep it through regeneration."
        right={<Button variant={a ? "secondary" : "primary"} onClick={suggest} disabled={busy} data-testid="suggest-stacks"><Layers /> {a ? "Re-suggest stacks" : "Suggest stacks"}</Button>} />

      {!a && !busy && <EmptyState text="No stacks yet. Suggest stacks to score three options against your team, deadline, budget and skills." />}
      {!a && busy && <Panel><PanelBody><Skeleton lines={6} /></PanelBody></Panel>}

      {a && a.candidates.length > 0 && <Candidates card={card} candidates={a.candidates} chosenId={a.chosenId} onChoose={choose} busy={busy} />}

      {chosen && !designed && busy && <Panel><PanelBody><Skeleton lines={8} /></PanelBody></Panel>}
      {chosen && !designed && !busy && (
        <EmptyState text={`No design for ${chosen.name} yet.`} action={<Button onClick={() => design()} disabled={busy}><RefreshCw /> Design this stack</Button>} />
      )}

      {chosen && designed && a && (
        <div className="space-y-4" data-testid="design">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="h2-console">Design for {chosen.name}</h2>
            {prov && <ProvenanceBadge provenance={prov} />}
            {stale && <Chip tone="warn" icon={<span aria-hidden="true">!</span>}>stale · the card changed</Chip>}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => design()} disabled={busy}><RefreshCw /> Regenerate unlocked blocks</Button>
          </div>

          <Block title="Component diagram" locked={a.diagramMermaid.locked} actions={actions("diagramMermaid", "Component diagram")}>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <label htmlFor="mermaid-src" className="label-mono">Mermaid source · live</label>
                <textarea id="mermaid-src" rows={12} className="field font-mono text-[13px] leading-relaxed" value={a.diagramMermaid.value} onChange={(e) => setBlock("diagramMermaid", e.target.value)} />
              </div>
              <MermaidView code={a.diagramMermaid.value} />
            </div>
          </Block>

          <div className="grid gap-4 xl:grid-cols-2">
            <Block title="Data model" locked={a.dataModel.locked} actions={actions("dataModel", "Data model")}
              json={{ key: "dataModel", value: a.dataModel.value, onSave: (v) => setBlock("dataModel", v as Architecture["dataModel"]["value"]) }}>
              <div className="space-y-3">
                {a.dataModel.value.map((e) => (
                  <div key={e.name} className="min-w-0">
                    <p className="font-mono text-[14px] font-medium text-amber">{e.name}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[14px]">
                        <tbody>
                          {e.fields.map((f) => <tr key={f.name}><td className={cn(td, "font-mono")}>{f.name}</td><td className={cn(td, "font-mono text-fg-dim")}>{f.type}</td><td className={cn(td, "text-fg-dim")}>{f.note}</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                    {e.relations.length > 0 && <p className="mt-1 font-mono text-[12px] text-fg-faint">↳ {e.relations.join(" · ")}</p>}
                  </div>
                ))}
                <SqlBlock sql={toSql(a.dataModel.value)} />
              </div>
            </Block>

            <Block title="API surface" locked={a.apiSurface.locked} actions={actions("apiSurface", "API surface")}
              json={{ key: "apiSurface", value: a.apiSurface.value, onSave: (v) => setBlock("apiSurface", v as Architecture["apiSurface"]["value"]) }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-[14px]" data-testid="api-table">
                  <thead><tr><th className={th}>Method</th><th className={th}>Path</th><th className={th}>Response</th></tr></thead>
                  <tbody>
                    {a.apiSurface.value.map((ep, i) => (
                      <tr key={i}>
                        <td className={td}><span className="font-mono text-[12px] text-amber">{ep.method}</span></td>
                        <td className={cn(td, "font-mono")}>{ep.path}{ep.note && <p className="font-sans text-[13px] text-fg-faint">{ep.note}</p>}</td>
                        <td className={cn(td, "text-fg-dim")}>{ep.response}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Block title="Services" locked={a.services.locked} actions={actions("services", "Services")}
              json={{ key: "services", value: a.services.value, onSave: (v) => setBlock("services", v as Architecture["services"]["value"]) }}>
              {a.services.value.length ? (
                <ul className="space-y-2.5 text-[15px]">
                  {a.services.value.map((s) => <li key={s.name}><span className="font-medium">{s.name}</span> <span className="text-fg-dim">· {s.reason}</span><br /><span className="font-mono text-[12px] text-fg-faint">Free tier: {s.freeTier}</span></li>)}
                </ul>
              ) : <p className="text-[15px] text-fg-dim">None needed.</p>}
            </Block>

            <Block title="Deployment" locked={a.deployment.locked} actions={actions("deployment", "Deployment")}>
              {a.deployment.value ? (
                <div className="space-y-3">
                  <div className="space-y-1"><label htmlFor="dep-target" className="label-mono">Target</label><input id="dep-target" className="field" value={a.deployment.value.target} onChange={(e) => setBlock("deployment", { ...a.deployment.value!, target: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label htmlFor="dep-cost" className="label-mono">USD / month</label><input id="dep-cost" type="number" min={0} className="field tabular font-mono" value={a.deployment.value.estCostPerMonth} onChange={(e) => setBlock("deployment", { ...a.deployment.value!, estCostPerMonth: Math.max(0, Number(e.target.value) || 0) })} /></div>
                    <div className="space-y-1"><label htmlFor="dep-hours" className="label-mono">Hours to deploy</label><input id="dep-hours" type="number" min={0} className="field tabular font-mono" value={a.deployment.value.estHoursToFirstDeploy} onChange={(e) => setBlock("deployment", { ...a.deployment.value!, estHoursToFirstDeploy: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  </div>
                </div>
              ) : <p className="text-[15px] text-fg-dim">No target chosen.</p>}
            </Block>

            <Block title="Risk register" locked={a.risks.locked} actions={actions("risks", "Risk register")}
              json={{ key: "risks", value: a.risks.value, onSave: (v) => setBlock("risks", v as Architecture["risks"]["value"]) }}>
              <ul className="space-y-2.5 text-[15px]">
                {a.risks.value.map((r, i) => (
                  <li key={i} className="space-y-1">
                    <div className="flex items-start gap-2"><Chip tone={LIKELIHOOD[r.likelihood].tone} icon={<span aria-hidden="true">{LIKELIHOOD[r.likelihood].icon}</span>}>{r.likelihood}</Chip><span>{r.risk}</span></div>
                    <p className="text-[14px] text-fg-dim">↳ {r.mitigation}</p>
                  </li>
                ))}
              </ul>
            </Block>
          </div>

          <div className="flex justify-end">
            <Button variant="primary" onClick={onDone} data-testid="to-prompt">Sign off and compile <ArrowRight /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Candidates({ card, candidates, chosenId, onChoose, busy }: { card: IdeaCard; candidates: StackCandidate[]; chosenId: string | null; onChoose: (id: string) => void; busy: boolean }) {
  const best = Object.fromEntries(CRITERIA.map((c) => [c.key, Math.max(...candidates.map((x) => x.scores[c.key]))])) as Record<keyof StackCandidate["scores"], number>;
  const bestTotal = Math.max(...candidates.map(total));
  return (
    <section aria-labelledby="cand-h" className="space-y-2" data-testid="candidates">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="cand-h" className="h2-console">Candidate stacks</h2>
        {card.provenance.architecture && <ProvenanceBadge provenance={card.provenance.architecture} />}
      </div>
      <div className="space-y-2">
        {candidates.map((c, i) => {
          const chosen = c.id === chosenId;
          return (
            <button key={c.id} type="button" onClick={() => onChoose(c.id)} disabled={busy} data-candidate={c.name} aria-pressed={chosen}
              aria-label={`Choose ${c.name}`}
              className={cn("panel grid w-full gap-3 p-4 text-left hover:border-fg-faint disabled:cursor-not-allowed lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center", chosen && "border-amber hover:border-amber")}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-sans text-[16px] font-semibold">{c.name}</span>
                  {i === 0 && <Chip tone="info" icon={<span aria-hidden="true">★</span>}>Recommended</Chip>}
                  {chosen && <Chip tone="amber" icon={<Check />}>chosen</Chip>}
                </div>
                <p className="font-mono text-[12px] text-fg-dim">{c.stack.join(" · ")}</p>
              </div>
              <dl className="grid grid-cols-6 gap-1 text-center" aria-label="Scores out of 5">
                {CRITERIA.map((k) => (
                  <div key={k.key} className="min-w-0">
                    <dt className="truncate font-mono text-[11px] uppercase text-fg-faint">{k.label}</dt>
                    <dd className={cn("tabular font-mono text-[15px]", c.scores[k.key] === best[k.key] ? "text-amber" : "text-fg-dim")}>
                      {c.scores[k.key]}{c.scores[k.key] === best[k.key] && <span className="sr-only"> (highest)</span>}
                    </dd>
                  </div>
                ))}
                <div className="min-w-0 border-l border-line">
                  <dt className="font-mono text-[11px] uppercase text-fg-faint">Total</dt>
                  <dd className={cn("tabular font-mono text-[15px] font-medium", total(c) === bestTotal ? "text-amber" : "text-fg")}>{total(c)}</dd>
                </div>
              </dl>
              <div className="min-w-0 text-[14px]">
                <p><span className="text-ok" aria-hidden="true">+ </span><span className="sr-only">Why: </span>{c.why}</p>
                <p className="text-fg-dim"><span className="text-crit" aria-hidden="true">− </span><span className="sr-only">Why not: </span>{c.whyNot}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Block({ title, locked, actions, json, children }: {
  title: string;
  locked: boolean;
  actions: ReactNode;
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
    <Panel className={cn(locked && "border-ok")} data-block={title}>
      <PanelHeader title={<>{title}{locked && <span className="ml-2 font-mono text-[12px] font-normal normal-case tracking-normal text-ok">● LOCKED</span>}</>} right={<>
        {json && (
          <Button size="sm" variant="ghost" aria-pressed={editing} aria-label={`Edit ${title}`}
            onClick={() => { setDraft(JSON.stringify(json.value, null, 2)); setError(null); setEditing((e) => !e); }}><Pencil /> {editing ? "Cancel" : "Edit"}</Button>
        )}
        {actions}
      </>} />
      <PanelBody>
        {editing && json ? (
          <div className="space-y-2">
            <textarea aria-label={`${title} JSON`} rows={14} className="field font-mono text-[13px]" value={draft} onChange={(e) => setDraft(e.target.value)} />
            {error && <p role="alert" className="font-mono text-[13px] text-crit">✕ {error}</p>}
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        ) : children}
      </PanelBody>
    </Panel>
  );
}

function SqlBlock({ sql }: { sql: string }) {
  const toast = useToast();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="label-mono">SQL</span>
        <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(sql).then(() => toast("SQL copied"), () => toast("Clipboard blocked. Select the SQL and copy it.", "crit"))}><Copy /> Copy SQL</Button>
      </div>
      <pre className="max-h-64 overflow-auto rounded-[6px] border border-line bg-[var(--panel-2)] p-3 font-mono text-[13px]" data-testid="sql">{sql}</pre>
    </div>
  );
}

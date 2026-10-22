"use client";

import { useState } from "react";
import { ArrowRight, ExternalLink, Pencil, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/console/Chip";
import { Panel, PanelBody, PanelHeader, StageHeading } from "@/components/console/Panel";
import { ProvenanceBadge } from "@/components/console/ProvenanceBadge";
import { EmptyState, Skeleton } from "@/components/console/StageStatus";
import { useIdea } from "@/lib/client/IdeaContext";
import { applyStage, competitorProvenance, COUNCIL_PART_LABEL, provenanceOf, runCouncilStage, type CouncilPart } from "@/lib/client/stages";
import type { useStageRun } from "@/lib/client/useStageRun";
import { PERSONA_BRIEFS } from "@/lib/prompts/council";
import { stamp } from "@/lib/stale";
import { PERSONAS, type Competitor, type Critique, type Direction, type IdeaCard, type Persona } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";
import type { Announce } from "./Workspace";

type Runner = ReturnType<typeof useStageRun>;
type Update = (fn: (c: IdeaCard) => IdeaCard) => void;

const AVATAR: Record<Persona, { glyph: string; cls: string }> = {
  investor: { glyph: "$", cls: "border-crit text-crit bg-[var(--crit-ghost)]" },
  user: { glyph: "U", cls: "border-info text-info" },
  engineer: { glyph: "</>", cls: "border-ok text-ok bg-[var(--ok-ghost)]" },
};

const CRITIQUE_FIELDS: { key: keyof Critique; label: string }[] = [
  { key: "strongest_objection", label: "Strongest objection" },
  { key: "what_would_change_my_mind", label: "What would change my mind" },
  { key: "one_question", label: "One question for you" },
];

const SOURCE: Record<Competitor["source"], { label: string; tone: "ok" | "warn" | "default"; icon: string }> = {
  tavily: { label: "live search", tone: "ok", icon: "⊙" },
  "google-search": { label: "Google Search", tone: "ok", icon: "⊙" },
  "model-knowledge": { label: "model memory · no link", tone: "warn", icon: "!" },
  user: { label: "added by you", tone: "default", icon: "●" },
};

/** Picking a different direction voids the preview approval (it approved another direction). */
const choose = (c: IdeaCard, id: string): IdeaCard =>
  c.chosenDirectionId === id ? c : { ...c, chosenDirectionId: id, compareDirectionId: c.compareDirectionId === id ? null : c.compareDirectionId, previewApprovedId: null };

export function CouncilStage({ runner, announce, onDone }: { runner: Runner; announce: Announce; onDone: () => void }) {
  const { card, update, latest } = useIdea();
  if (!card) return null;
  const ran = card.council !== null || card.directions.length > 0;
  const busy = !!runner.running;

  const run = (parts?: CouncilPart[]) =>
    runner.run(COUNCIL_PART_LABEL[parts?.[0] ?? "council"], async () => {
      const full = !parts || parts.length === 3;
      // Each reply lands on the screen as it arrives, with its provenance.
      const next = await runCouncilStage(latest()!, (part, res) => {
        if (res) update((c) => applyStage(c, res.patch, part, part === "competitors" ? competitorProvenance(res) : provenanceOf(res)));
      }, parts);
      if (full) update((c) => stamp(c, "council"));
      announce(full ? `Council finished. ${next.directions.length} directions to pick from.` : "Council part regenerated.");
    });

  const setCritique = (k: Persona, field: keyof Critique, v: string) =>
    update((c) => (c.council ? { ...c, council: { ...c.council, [k]: { ...c.council[k], [field]: v } } } : c));

  return (
    <div className="space-y-5" data-testid="council-stage">
      <StageHeading eyebrow="Stage 02 · Council" title="Three critics try to break it. Then you pick a direction."
        lead="An investor, a target user and a senior engineer attack the card. A search finds who already does this. Directions answer the objections."
        right={ran
          ? <Button onClick={() => run()} disabled={busy} data-testid="run-council"><RefreshCw /> Re-run council</Button>
          : <Button variant="primary" onClick={() => run()} disabled={busy} data-testid="run-council"><Users /> Run Council</Button>} />

      {!ran && !busy && <EmptyState text="The council has not met yet. Run it for three critiques, a competitor check and three directions." />}

      {(card.council || (busy && !ran)) && (
        <section aria-labelledby="crit-h" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="crit-h" className="h2-console">Critics</h2>
            {card.provenance.council && <ProvenanceBadge provenance={card.provenance.council} />}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {PERSONAS.map((k) => card.council
              ? <CriticCard key={k} persona={k} critique={card.council[k]} onChange={(f, v) => setCritique(k, f, v)} />
              : <Panel key={k}><PanelBody><Skeleton lines={5} /></PanelBody></Panel>)}
          </div>
        </section>
      )}

      {(card.competitors.length > 0 || card.competitorSearch) && <Competitors card={card} update={update} onRerun={() => run(["competitors"])} busy={busy} />}

      {card.directions.length > 0 && <Directions card={card} update={update} onRegenerate={() => run(["directions"])} busy={busy} />}

      {ran && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!card.chosenDirectionId && <span className="text-[15px] text-fg-dim">Pick a direction to continue.</span>}
          <Button variant="primary" onClick={onDone} disabled={!card.chosenDirectionId} data-testid="to-preview">Preview this direction <ArrowRight /></Button>
        </div>
      )}
    </div>
  );
}

function CriticCard({ persona, critique, onChange }: { persona: Persona; critique: Critique; onChange: (f: keyof Critique, v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const a = AVATAR[persona];
  const brief = PERSONA_BRIEFS[persona];
  return (
    <Panel data-persona={persona} aria-labelledby={`p-${persona}`}>
      <div className="ph">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-[6px] border font-mono text-[13px] font-medium", a.cls)}>{a.glyph}</span>
          <div className="min-w-0">
            <h3 id={`p-${persona}`} className="font-sans text-[15px] font-semibold">{brief.title}</h3>
            <p className="truncate text-[13px] text-fg-faint">{brief.brief}</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)} aria-pressed={editing} aria-label={`Edit ${brief.title}`}><Pencil /> {editing ? "Done" : "Edit"}</Button>
      </div>
      <PanelBody>
        <dl className="space-y-3">
          {CRITIQUE_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <dt className="label-mono">{editing ? <label htmlFor={`${persona}-${f.key}`}>{f.label}</label> : f.label}</dt>
              <dd className="text-[15px] leading-relaxed">
                {editing
                  ? <textarea id={`${persona}-${f.key}`} rows={3} className="field" value={critique[f.key]} onChange={(e) => onChange(f.key, e.target.value)} />
                  : critique[f.key]}
              </dd>
            </div>
          ))}
        </dl>
      </PanelBody>
    </Panel>
  );
}

function Competitors({ card, update, onRerun, busy }: { card: IdeaCard; update: Update; onRerun: () => void; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const set = (i: number, patch: Partial<Competitor>) => update((c) => ({ ...c, competitors: c.competitors.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  const gaps = card.competitors.filter((c) => c.gap.trim());
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" aria-label="Competitors">
      <Panel aria-labelledby="comp-h">
        <PanelHeader id="comp-h" title="Who already does this" right={<>
          {card.provenance.competitors && <ProvenanceBadge provenance={card.provenance.competitors} />}
          {card.competitorSearch?.mode === "none" && <span data-testid="no-live-search"><Chip tone="warn" icon={<span aria-hidden="true">!</span>}>No live search · verify these</Chip></span>}
        </>} />
        <PanelBody className="space-y-3">
          {card.competitorSearch && card.competitorSearch.queries.length > 0 && (
            <p className="font-mono text-[13px] text-fg-faint">Searched: {card.competitorSearch.queries.map((q) => `“${q}”`).join(" · ")}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[15px]" data-testid="competitors">
              <thead>
                <tr className="label-mono">
                  <th className="border-b border-line py-2 pr-3 font-normal">Name</th>
                  <th className="border-b border-line py-2 pr-3 font-normal">What they solve</th>
                  <th className="border-b border-line py-2 pr-3 font-normal">Source</th>
                  {editing && <th className="border-b border-line py-2 font-normal"><span className="sr-only">Remove</span></th>}
                </tr>
              </thead>
              <tbody>
                {card.competitors.map((c, i) => (
                  <tr key={i} className="align-top">
                    <td className="border-b border-line py-2 pr-3">
                      {editing ? <input aria-label="Competitor name" className="field" value={c.name} onChange={(e) => set(i, { name: e.target.value })} /> : <span className="font-medium">{c.name}</span>}
                      {c.url && !editing && (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex max-w-52 items-center gap-1 truncate font-mono text-[12px] text-fg-dim underline hover:text-fg">
                          <ExternalLink className="size-3 shrink-0" aria-hidden="true" /> {c.url.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {editing && c.source === "user" && <input aria-label="Competitor URL" placeholder="https://… (optional)" className="field mt-1 font-mono text-[13px]" value={c.url} onChange={(e) => set(i, { url: e.target.value })} />}
                    </td>
                    <td className="border-b border-line py-2 pr-3 text-fg-dim">
                      {editing ? <textarea aria-label="What they solve" rows={2} className="field" value={c.whatTheySolve} onChange={(e) => set(i, { whatTheySolve: e.target.value })} /> : c.whatTheySolve}
                      {editing && <textarea aria-label="Gap they leave" rows={2} className="field mt-1" placeholder="Gap they leave" value={c.gap} onChange={(e) => set(i, { gap: e.target.value })} />}
                    </td>
                    <td className="border-b border-line py-2 pr-3"><Chip tone={SOURCE[c.source].tone} icon={<span aria-hidden="true">{SOURCE[c.source].icon}</span>}>{SOURCE[c.source].label}</Chip></td>
                    {editing && (
                      <td className="border-b border-line py-2">
                        <Button size="icon" variant="ghost" aria-label={`Remove ${c.name || "competitor"}`} onClick={() => update((x) => ({ ...x, competitors: x.competitors.filter((_, k) => k !== i) }))}><Trash2 /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {card.competitors.length === 0 && <p className="text-[15px] text-fg-dim">No competitors found. Add one you know.</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)} aria-pressed={editing}><Pencil /> {editing ? "Done editing" : "Edit table"}</Button>
            <Button size="sm" variant="ghost" disabled={card.competitors.length >= 8}
              onClick={() => { setEditing(true); update((c) => ({ ...c, competitors: [...c.competitors, { name: "", url: "", whatTheySolve: "", gap: "", source: "user" }] })); }}>
              <Plus /> Add a competitor
            </Button>
            <Button size="sm" variant="ghost" onClick={onRerun} disabled={busy}><RefreshCw /> Re-run search</Button>
          </div>
        </PanelBody>
      </Panel>

      <Panel aria-labelledby="gap-h" data-testid="gap-summary">
        <PanelHeader id="gap-h" title="Gap summary" />
        <PanelBody>
          {gaps.length ? (
            <ul className="space-y-2.5 text-[15px]">
              {gaps.map((c, i) => (
                <li key={i} className="flex gap-2"><span className="font-mono text-amber" aria-hidden="true">→</span><span><span className="font-medium">{c.name}</span> <span className="text-fg-dim">leaves: {c.gap}</span></span></li>
              ))}
            </ul>
          ) : <p className="text-[15px] text-fg-dim">No gaps recorded yet.</p>}
        </PanelBody>
      </Panel>
    </section>
  );
}

function Directions({ card, update, onRegenerate, busy }: { card: IdeaCard; update: Update; onRegenerate: () => void; busy: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const set = (id: string, patch: Partial<Direction>) => update((c) => ({ ...c, directions: c.directions.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const canAdd = card.directions.length < 3 || card.directions.some((d) => !d.custom && d.id !== card.chosenDirectionId);

  const addOwn = () => {
    const id = `dir-own-${Date.now().toString(36)}`;
    update((c) => {
      const own: Direction = { id, title: "My direction", oneLiner: "", rationale: "", citations: [], custom: true, tag: "YOUR OWN BET" };
      // At most three: replace the last generated, unchosen direction to make room.
      const drop = c.directions.length < 3 ? null : [...c.directions].reverse().find((d) => !d.custom && d.id !== c.chosenDirectionId);
      const room = c.directions.length < 3 ? c.directions : drop ? c.directions.filter((d) => d.id !== drop.id) : null;
      return room ? choose({ ...c, directions: [...room, own] }, id) : c;
    });
    setEditing(id);
  };

  return (
    <section aria-labelledby="dir-h" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="dir-h" className="h2-console">Directions · pick one</h2>
        {card.provenance.directions && <ProvenanceBadge provenance={card.provenance.directions} />}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onRegenerate} disabled={busy}><RefreshCw /> Regenerate others</Button>
      </div>
      <p className="measure text-[15px] text-fg-dim">Each is a different product bet. Your own directions and the one you pick are kept when you regenerate.</p>
      <div className="grid gap-4 lg:grid-cols-3" role="group" aria-label="Directions">
        {card.directions.map((d) => {
          const chosen = d.id === card.chosenDirectionId;
          const isEditing = editing === d.id;
          return (
            <div key={d.id} data-direction={d.title} data-chosen={chosen}
              className={cn("panel relative flex cursor-pointer flex-col gap-2 p-4 hover:border-fg-faint", chosen && "border-amber hover:border-amber")}
              onClick={(e) => { if (!(e.target as HTMLElement).closest("input,textarea,button,a")) update((c) => choose(c, d.id)); }}
              onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) update((c) => choose(c, d.id)); }}
              tabIndex={0} aria-label={`${d.title}${chosen ? ", chosen" : ""}. Press Enter to choose.`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-[12px] uppercase tracking-[.08em] text-amber">{d.tag ?? (d.custom ? "YOUR OWN BET" : "DIRECTION")}</p>
                <input type="checkbox" checked={chosen} onChange={() => update((c) => choose(c, d.id))} aria-label={`Choose ${d.title}`}
                  className="size-[18px] shrink-0 cursor-pointer accent-[var(--amber)]" />
              </div>
              {isEditing ? (
                <div className="space-y-2">
                  <input aria-label="Direction title" className="field font-semibold" value={d.title} onChange={(e) => set(d.id, { title: e.target.value })} />
                  <textarea aria-label="One-liner" rows={2} className="field" placeholder="One line: what is the bet?" value={d.oneLiner} onChange={(e) => set(d.id, { oneLiner: e.target.value })} />
                  <textarea aria-label="Rationale" rows={4} className="field" placeholder="Which critique or competitor gap does it answer?" value={d.rationale} onChange={(e) => set(d.id, { rationale: e.target.value })} />
                </div>
              ) : (
                <>
                  <h3 className="font-sans text-[17px] font-semibold leading-snug">{d.title}</h3>
                  <p className="text-[15px]">{d.oneLiner}</p>
                  <p className="text-[14px] leading-relaxed text-fg-dim">{d.rationale}</p>
                </>
              )}
              {d.citations.length > 0 && (
                <p className="font-mono text-[12px] text-fg-faint">
                  <span aria-hidden="true">↳ </span>
                  {d.citations.map((c, i) => (
                    <span key={c}>{i > 0 && " · "}{/^https?:\/\//.test(c) ? <a className="underline hover:text-fg" href={c} target="_blank" rel="noopener noreferrer">{c.replace(/^https?:\/\//, "").slice(0, 40)}</a> : c}</span>
                  ))}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-1 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(isEditing ? null : d.id)} aria-pressed={isEditing} aria-label={`Edit ${d.title}`}><Pencil /> {isEditing ? "Done" : "Edit"}</Button>
                {d.custom && (
                  <Button size="sm" variant="ghost" onClick={() => update((c) => ({ ...c, directions: c.directions.filter((x) => x.id !== d.id), chosenDirectionId: c.chosenDirectionId === d.id ? null : c.chosenDirectionId }))}><Trash2 /> Remove</Button>
                )}
              </div>
            </div>
          );
        })}
        {canAdd && (
          <button type="button" onClick={addOwn}
            className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-line-2 p-4 text-[15px] text-fg-dim hover:border-fg-dim hover:text-fg">
            <Plus className="size-4" aria-hidden="true" /> Add my own direction
            {card.directions.length >= 3 && <span className="text-[13px] text-fg-faint">Replaces the last generated one you did not pick.</span>}
          </button>
        )}
      </div>
    </section>
  );
}

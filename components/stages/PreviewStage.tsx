"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Columns2, Monitor, ShieldCheck, Smartphone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Chip } from "@/components/console/Chip";
import { Panel, PanelBody, PanelHeader, StageHeading } from "@/components/console/Panel";
import { ProvenanceBadge } from "@/components/console/ProvenanceBadge";
import { Skeleton } from "@/components/console/StageStatus";
import { VisualArchetypes } from "@/components/console/VisualArchetypes";
import { archetypeById, suggestedArchetype } from "@/lib/archetypes";
import { useIdea } from "@/lib/client/IdeaContext";
import { runPreview, withPreview } from "@/lib/client/stages";
import type { useStageRun } from "@/lib/client/useStageRun";
import { findScreens } from "@/lib/preview/sanitize";
import { isStale, stamp } from "@/lib/stale";
import { chosenDirection, type Direction, type IdeaCard } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";
import type { Announce } from "./Workspace";

type Runner = ReturnType<typeof useStageRun>;
type Width = "desktop" | "mobile";

/** Window chrome + the sandboxed frame. Scripts run (screen switching only) with no same-origin access. */
function PreviewFrame({ direction, width, loading, label }: { direction: Direction; width: Width; loading: boolean; label?: string }) {
  const screens = direction.previewHtml ? findScreens(direction.previewHtml) : [];
  const h = width === "mobile" ? "h-[420px]" : "h-[520px]";
  return (
    <div className="min-w-0 overflow-hidden rounded-[8px] border border-line bg-[var(--panel)]">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex gap-1" aria-hidden="true">
          <span className="size-2 rounded-full bg-line-2" /><span className="size-2 rounded-full bg-line-2" /><span className="size-2 rounded-full bg-line-2" />
        </span>
        <span className="min-w-0 truncate font-mono text-[11px] text-fg-dim">
          {label ? `${label} · ` : ""}{direction.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.preview · {screens.length ? `${screens.length} screens` : "not generated"}
        </span>
      </div>
      {loading && !direction.previewHtml ? (
        <div className={cn("p-6", h)}><Skeleton lines={8} /></div>
      ) : direction.previewHtml ? (
        <div className={cn("mx-auto bg-white", width === "mobile" ? "max-w-[390px]" : "w-full")}>
          <iframe title={`Preview of ${direction.title}`} sandbox="allow-scripts" srcDoc={direction.previewHtml}
            className={cn("block w-full", h)} data-testid="preview-frame" data-direction-id={direction.id} />
        </div>
      ) : (
        <div className={cn("grid place-items-center p-6 text-center text-[14px] text-fg-dim", h)}>
          <p>No preview yet for “{direction.title}”.</p>
        </div>
      )}
    </div>
  );
}

export function PreviewStage({ runner, announce, onDone, onBack }: { runner: Runner; announce: Announce; onDone: () => void; onBack: () => void }) {
  const { card, update, latest } = useIdea();
  const [note, setNote] = useState("");
  const [width, setWidth] = useState<Width>("desktop");
  const [removed, setRemoved] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  // The hardware-console look is preselected only when the domain fits; otherwise no archetype is chosen.
  useEffect(() => {
    if (!card || card.archetypeId || card.directions.some((d) => d.previewHtml)) return;
    const s = suggestedArchetype(`${card.raw} ${card.coreAction.value} ${card.targetUser.value}`);
    if (s) update((c) => ({ ...c, archetypeId: s }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  if (!card) return null;
  const chosen = chosenDirection(card);
  if (!chosen) return null;
  const compare = card.directions.find((d) => d.id === card.compareDirectionId && d.id !== chosen.id) ?? null;
  const others = card.directions.filter((d) => d.id !== chosen.id);
  const busy = !!runner.running;
  const approved = card.previewApprovedId === chosen.id;
  const stale = isStale(card, "preview");
  const screens = chosen.previewHtml ? findScreens(chosen.previewHtml) : [];
  const archetype = archetypeById(card.archetypeId);

  const generate = (directionId: string, withNote?: string) => {
    setPending(directionId);
    return runner.run(withNote ? `Preview · applying “${withNote}”` : `Preview · designing ${card.directions.find((d) => d.id === directionId)?.title ?? "screens"}`, async () => {
      try {
        const res = await runPreview(latest()!, { directionId, note: withNote });
        setRemoved(res.removed);
        update((c) => {
          const next = withPreview(c, res);
          // A new preview of the chosen direction needs a fresh approval.
          return directionId === c.chosenDirectionId ? stamp({ ...next, previewApprovedId: null }, "preview") : next;
        });
        if (withNote) setNote("");
        announce(`Preview ready: ${findScreens(res.previewHtml).length} screens.`);
      } finally {
        setPending(null);
      }
    });
  };

  const startCompare = (id: string) => {
    update((c) => ({ ...c, compareDirectionId: id }));
    if (!card.directions.find((d) => d.id === id)?.previewHtml) generate(id);
  };

  const approve = () => {
    update((c) => ({ ...c, previewApprovedId: chosen.id }));
    announce(`Direction approved: ${chosen.title}.`);
  };

  const swap = (c: IdeaCard, id: string): IdeaCard => ({ ...c, chosenDirectionId: id, compareDirectionId: c.chosenDirectionId, previewApprovedId: null });

  return (
    <div className="space-y-5" data-testid="preview-stage">
      <StageHeading eyebrow="Stage 03 · Preview" title={<>What it would look like if you chose <span className="text-amber">{chosen.title}</span>.</>}
        lead="A small clickable mockup of the main flow. Three to five screens, fake data, nothing is built." />

      <Collapsible className="panel">
        <CollapsibleTrigger className="ph w-full text-left hover:bg-[var(--panel-2)]" data-testid="archetype-toggle">
          <span className="h2-console">Visual archetype</span>
          <span className="flex items-center gap-2 font-mono text-[11px] text-fg-dim">
            {archetype ? archetype.name : "Neutral kit"}<ChevronDown className="size-3.5" aria-hidden="true" />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <PanelBody className="space-y-2">
            <p className="text-[13px] text-fg-dim">Sets the look of the preview and the visual section of the prompt. Click a selected archetype again to clear it.</p>
            <VisualArchetypes selectedId={card.archetypeId} onSelect={(id) => update((c) => ({ ...c, archetypeId: id }))} />
          </PanelBody>
        </CollapsibleContent>
      </Collapsible>

      <div className={cn("grid gap-4", compare ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]" : "lg:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {chosen.previewHtml && card.provenance[`preview:${chosen.id}`] && <ProvenanceBadge provenance={card.provenance[`preview:${chosen.id}`]} />}
            {stale && chosen.previewHtml && <Chip tone="warn" icon={<span aria-hidden="true">!</span>}>stale · the card changed</Chip>}
            <div className="ml-auto flex rounded-[4px] border border-line-2 p-0.5" role="group" aria-label="Preview width">
              {(["desktop", "mobile"] as const).map((w) => (
                <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}
                  className={cn("inline-flex h-[30px] items-center gap-1 rounded-[3px] px-2 font-mono text-[11px] uppercase", width === w ? "bg-[var(--panel-2)] text-fg" : "text-fg-dim hover:text-fg")}>
                  {w === "desktop" ? <Monitor className="size-3" aria-hidden="true" /> : <Smartphone className="size-3" aria-hidden="true" />}{w}
                </button>
              ))}
            </div>
          </div>
          <PreviewFrame direction={chosen} width={width} loading={pending === chosen.id} label={compare ? "chosen" : undefined} />
          {!chosen.previewHtml && pending !== chosen.id && (
            <Button variant="primary" onClick={() => generate(chosen.id)} disabled={busy} data-testid="generate-preview"><Sparkles /> Generate preview</Button>
          )}
          {removed.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-fg-faint" data-testid="sanitizer-note">
              <ShieldCheck className="size-3.5" aria-hidden="true" /> The sanitizer removed: {removed.join(", ")}.
            </p>
          )}
        </div>

        {compare && (
          <div className="min-w-0 space-y-2" data-testid="compare-pane">
            <div className="flex flex-wrap items-center gap-2">
              {compare.previewHtml && card.provenance[`preview:${compare.id}`] && <ProvenanceBadge provenance={card.provenance[`preview:${compare.id}`]} />}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => update((c) => ({ ...c, compareDirectionId: null }))}><X /> Close</Button>
            </div>
            <PreviewFrame direction={compare} width={width} loading={pending === compare.id} label="compare" />
            <Button size="sm" onClick={() => update((c) => swap(c, compare.id))}>Choose {compare.title} instead</Button>
          </div>
        )}

        <div className="min-w-0 space-y-4">
          <Panel aria-labelledby="regen-h">
            <PanelHeader id="regen-h" title="Regenerate" />
            <PanelBody>
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); generate(chosen.id, note.trim() || undefined); }}>
                <label htmlFor="preview-note" className="label-mono uppercase tracking-[.1em]">Note for the model</label>
                <input id="preview-note" className="field" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. mobile-first, darker, fewer fields" />
                <Button type="submit" size="sm" disabled={busy} className="w-full" data-testid="regenerate-preview">
                  <Sparkles /> {note.trim() ? "Apply note" : chosen.previewHtml ? "Regenerate" : "Generate"}
                </Button>
              </form>
            </PanelBody>
          </Panel>

          <Panel aria-labelledby="screens-h">
            <PanelHeader id="screens-h" title="Screens" />
            <PanelBody>
              {screens.length ? (
                <ol className="flex flex-wrap gap-1.5" data-testid="screen-list">
                  {screens.map((s, i) => <li key={s.id}><Chip icon={<span className="tabular" aria-hidden="true">{i + 1}</span>}>{s.title}</Chip></li>)}
                </ol>
              ) : <p className="text-[13px] text-fg-dim">Generate a preview to list its screens.</p>}
            </PanelBody>
          </Panel>

          {others.length > 0 && !compare && (
            <Panel aria-labelledby="compare-h">
              <PanelHeader id="compare-h" title="Compare" />
              <PanelBody className="space-y-1.5">
                <p className="text-[13px] text-fg-dim">Side by side with another direction.</p>
                {others.map((d) => (
                  <Button key={d.id} size="sm" variant="ghost" className="w-full justify-start" onClick={() => startCompare(d.id)} disabled={busy}>
                    <Columns2 /> <span className="truncate">{d.title}</span>
                  </Button>
                ))}
              </PanelBody>
            </Panel>
          )}

          <Panel aria-labelledby="verdict-h" className={cn(approved && "border-ok")}>
            <PanelHeader id="verdict-h" title="Verdict" right={approved ? <Chip tone="ok" icon={<Check />}>approved</Chip> : undefined} />
            <PanelBody className="space-y-2">
              <p className="text-[13px] text-fg-dim">{approved ? "You approved this direction. Architecture is next." : "Does this flow prove the bet? Approve it, or go back and pick another."}</p>
              <Button variant="approve" className="w-full" onClick={approve} disabled={!chosen.previewHtml || approved} data-testid="approve-direction"><Check /> Approve direction</Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={onBack}><ArrowLeft /> Change direction</Button>
            </PanelBody>
          </Panel>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant={chosen.previewHtml ? "primary" : "secondary"} onClick={onDone} data-testid="to-architecture"
          title={approved ? undefined : "You can continue without approving; readiness counts the approval."}>Architecture <ArrowRight /></Button>
      </div>
    </div>
  );
}

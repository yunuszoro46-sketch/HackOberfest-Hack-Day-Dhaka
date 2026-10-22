"use client";

import { useState } from "react";
import { ArrowRight, Columns2, Monitor, MessageSquarePlus, ShieldCheck, Smartphone, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIdea } from "@/lib/client/IdeaContext";
import { runPreview, withPreview } from "@/lib/client/stages";
import type { useStageRun } from "@/lib/client/useStageRun";
import { findScreens } from "@/lib/preview/sanitize";
import { stamp } from "@/lib/stale";
import { chosenDirection, type Direction } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";

type Runner = ReturnType<typeof useStageRun>;

/** The preview runs scripts (screen switching only) but has no same-origin access: no cookies, storage or parent DOM. */
function PreviewFrame({ direction, width }: { direction: Direction; width: "desktop" | "mobile" }) {
  if (!direction.previewHtml) {
    return <div className="grid h-[560px] place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">No preview yet for “{direction.title}”.</div>;
  }
  const screens = findScreens(direction.previewHtml);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {screens.length} screens: {screens.map((s) => s.title).join(" → ")} · click through, or use the bar at the bottom.
      </p>
      <div className={cn("mx-auto overflow-hidden rounded-lg border bg-white shadow-sm", width === "mobile" ? "max-w-[390px]" : "w-full")}>
        <iframe
          title={`Preview of ${direction.title}`}
          sandbox="allow-scripts"
          srcDoc={direction.previewHtml}
          className="block h-[600px] w-full"
          data-testid="preview-frame"
          data-direction-id={direction.id}
        />
      </div>
    </div>
  );
}

export function PreviewStage({ runner, onDone }: { runner: Runner; onDone: () => void }) {
  const { card, update, latest } = useIdea();
  const [note, setNote] = useState("");
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [removed, setRemoved] = useState<string[]>([]);
  if (!card) return null;
  const chosen = chosenDirection(card);
  if (!chosen) return null;
  const compare = card.directions.find((d) => d.id === card.compareDirectionId && d.id !== chosen.id) ?? null;
  const others = card.directions.filter((d) => d.id !== chosen.id);

  const generate = (directionId: string, withNote?: string) =>
    runner.run(withNote ? `Preview: applying “${withNote}”` : `Preview: designing ${card.directions.find((d) => d.id === directionId)?.title ?? "screens"}`, async () => {
      const res = await runPreview(latest()!, { directionId, note: withNote });
      setRemoved(res.removed);
      update((c) => {
        const next = withPreview(c, res);
        return directionId === c.chosenDirectionId ? stamp(next, "preview") : next;
      });
      if (withNote) setNote("");
    });

  const startCompare = (id: string) => {
    update((c) => ({ ...c, compareDirectionId: id }));
    if (!card.directions.find((d) => d.id === id)?.previewHtml) generate(id);
  };

  return (
    <div className="space-y-5" data-testid="preview-stage">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Preview</h2>
          <p className="text-sm text-muted-foreground">A small clickable mockup of the main flow for <span className="font-medium text-foreground">{chosen.title}</span>. 3-5 screens, fake data, nothing is built.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border p-0.5" role="group" aria-label="Preview width">
            <Button size="sm" variant={width === "desktop" ? "secondary" : "ghost"} aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")}><Monitor /> Desktop</Button>
            <Button size="sm" variant={width === "mobile" ? "secondary" : "ghost"} aria-pressed={width === "mobile"} onClick={() => setWidth("mobile")}><Smartphone /> Mobile</Button>
          </div>
          <Button onClick={() => generate(chosen.id)} disabled={!!runner.running} data-testid="generate-preview">
            <Sparkles /> {chosen.previewHtml ? "Regenerate" : "Generate preview"}
          </Button>
        </div>
      </div>

      {removed.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" data-testid="sanitizer-note">
          <ShieldCheck className="size-3.5" /> The sanitizer removed: {removed.join(", ")}.
        </p>
      )}

      <div className={cn("grid gap-4", compare && "lg:grid-cols-2")}>
        <div className="space-y-2">
          {compare && <Badge variant="secondary">Chosen: {chosen.title}</Badge>}
          <PreviewFrame direction={chosen} width={width} />
        </div>
        {compare && (
          <div className="space-y-2" data-testid="compare-pane">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Compare: {compare.title}</Badge>
              <Button size="sm" variant="ghost" onClick={() => update((c) => ({ ...c, compareDirectionId: null }))}><X /> Close</Button>
              <Button size="sm" variant="ghost" onClick={() => update((c) => ({ ...c, chosenDirectionId: compare.id, compareDirectionId: chosen.id }))}>Choose this one instead</Button>
            </div>
            <PreviewFrame direction={compare} width={width} />
          </div>
        )}
      </div>

      {chosen.previewHtml && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) generate(chosen.id, note.trim()); }}>
          <div className="min-w-60 flex-1 space-y-1">
            <Label htmlFor="preview-note">Regenerate with a note</Label>
            <Input id="preview-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="One line, e.g. “make it mobile-first” or “darker”" />
          </div>
          <Button type="submit" variant="outline" disabled={!note.trim() || !!runner.running}><MessageSquarePlus /> Apply note</Button>
        </form>
      )}

      {others.length > 0 && !compare && chosen.previewHtml && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Columns2 className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Compare side by side with:</span>
          {others.map((d) => <Button key={d.id} size="sm" variant="outline" onClick={() => startCompare(d.id)} disabled={!!runner.running}>{d.title}</Button>)}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onDone}>Next: Architecture <ArrowRight /></Button>
      </div>
    </div>
  );
}

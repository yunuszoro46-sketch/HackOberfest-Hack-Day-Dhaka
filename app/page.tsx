"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamMateWordmark } from "@/components/console/HexagonIdentity";
import { Crumb, TopBar } from "@/components/console/TopBar";
import { newIdeaCard } from "@/lib/schema/ideaCard";
import { exampleIdea } from "@/lib/seed/exampleIdea";
import { ideaStore } from "@/lib/store";
import type { IdeaSummary } from "@/lib/store/IdeaStore";
import { cn } from "@/lib/utils";

const STAGE_NAME = ["Idea", "Council", "Preview", "Architecture", "Prompt"];

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Home() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<IdeaSummary[] | null>(null);
  const [raw, setRaw] = useState("");
  const [composing, setComposing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const rawRef = useRef<HTMLTextAreaElement>(null);

  const refresh = () => ideaStore().list().then(setIdeas);
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (composing) rawRef.current?.focus();
  }, [composing]);

  const create = async () => {
    setCreating(true);
    const card = newIdeaCard(raw.trim());
    await ideaStore().save(card);
    router.push(`/idea/${card.id}`);
  };

  const loadExample = async () => {
    const card = exampleIdea();
    await ideaStore().save(card);
    router.push(`/idea/${card.id}`);
  };

  return (
    <>
      <TopBar crumbs={[<Crumb key="t">TeamMate</Crumb>, <Crumb key="i">Ideas</Crumb>]} />
      <main className="mx-auto w-full max-w-[1180px] space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <TeamMateWordmark size="sm" />
            <p className="eyebrow">Your ideas</p>
            <h1 className="stage-title max-w-[30ch]">TeamMate gets you to a prompt you trust. Not to code.</h1>
            <p className="measure text-fg-dim">
              Five stages: answer five questions, let a council try to break the idea, see a clickable preview, pick an architecture, then sign off and compile a build prompt for Claude Code, Cursor or Lovable. You can edit and lock everything it produces.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={loadExample} data-testid="load-example"><Sparkles /> Load example</Button>
            <Button variant="primary" onClick={() => setComposing(true)} data-testid="new-idea-top"><Plus /> New idea</Button>
          </div>
        </header>

        <section aria-labelledby="ideas-h" className="space-y-3">
          <h2 id="ideas-h" className="h2-console">Saved in this browser</h2>
          {ideas === null ? (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-40 rounded-[8px]" />)}
            </div>
          ) : (
            <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]" data-testid="idea-list">
              <li>
                {composing ? (
                  <form className="flex h-full min-h-40 flex-col gap-2 rounded-[8px] border border-dashed border-amber p-4" onSubmit={(e) => { e.preventDefault(); if (raw.trim()) create(); }}>
                    <label htmlFor="raw" className="label-mono uppercase tracking-[.1em]">Your idea, one paragraph</label>
                    <textarea id="raw" ref={rawRef} rows={5} maxLength={4000} className="field flex-1" value={raw} onChange={(e) => setRaw(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") setComposing(false); }}
                      placeholder="e.g. Students waste time walking around looking for a free study room. Show which rooms are free now and let them hold one." />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" disabled={!raw.trim() || creating} data-testid="new-idea">Start with this idea</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setComposing(false)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setComposing(true)} data-testid="start-paragraph"
                    className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-line-2 p-4 text-fg-dim hover:border-fg-dim hover:text-fg">
                    <Plus className="size-4" aria-hidden="true" /> Start from a paragraph
                    <span className="text-[12px] text-fg-faint">Rough is fine. Stage 1 asks the hard questions.</span>
                  </button>
                )}
              </li>
              {ideas.map((i) => (
                <li key={i.id} className="group panel relative flex min-h-40 flex-col gap-2 p-4 hover:border-fg-faint" data-idea={i.title}>
                  <h3 className="font-display text-[16px] font-semibold leading-snug">
                    <Link href={`/idea/${i.id}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{i.title}</Link>
                  </h3>
                  {i.problem && i.problem !== i.title && <p className="line-clamp-2 text-[14px] text-fg-dim">{i.problem}</p>}
                  <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                    <p className="font-mono text-[11px] text-fg-faint">Edited {ago(i.updatedAt)} · Stage {i.stage ?? 1} {STAGE_NAME[(i.stage ?? 1) - 1]}</p>
                    <p className="text-right">
                      <span className={cn("tabular font-mono text-[20px] leading-none", i.readiness > 0 ? "text-amber" : "text-fg-faint")}>{i.readiness}</span>
                      <span className="block font-mono text-[10px] uppercase text-fg-faint">ready</span>
                    </p>
                  </div>
                  {confirmDelete === i.id ? (
                    <div className="relative z-10 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-[13px]" role="alert">
                      <span className="flex-1">Delete from this browser?</span>
                      <Button size="sm" variant="danger" onClick={async () => { await ideaStore().remove(i.id); setConfirmDelete(null); refresh(); }}>Delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Keep</Button>
                    </div>
                  ) : (
                    <div className="relative z-10 flex gap-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                      <Button size="sm" variant="ghost" asChild><Link href={`/idea/${i.id}`}>Open</Link></Button>
                      <Button size="sm" variant="ghost" aria-label={`Duplicate ${i.title}`} onClick={async () => { await ideaStore().duplicate(i.id); refresh(); }}><Copy /> Duplicate</Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${i.title}`} onClick={() => setConfirmDelete(i.id)}><Trash2 /> Delete</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {ideas?.length === 0 && <p className="text-[13px] text-fg-faint">Ideas are stored in this browser only. Load the example to see every stage filled in.</p>}
        </section>
      </main>
    </>
  );
}

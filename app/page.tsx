"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileText, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newIdeaCard } from "@/lib/schema/ideaCard";
import { ideaStore } from "@/lib/store";
import type { IdeaSummary } from "@/lib/store/IdeaStore";

const STEPS = ["Answer five questions", "Let a council attack it", "See a clickable preview", "Pick an architecture", "Copy a build prompt"];

export default function Home() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<IdeaSummary[] | null>(null);
  const [raw, setRaw] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = () => ideaStore().list().then(setIdeas);
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    setCreating(true);
    const card = newIdeaCard(raw.trim());
    await ideaStore().save(card);
    router.push(`/idea/${card.id}`);
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:py-16">
      <header className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">TeamMate · for builders with an idea and no team</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">TeamMate gets you to a prompt you trust — not to code.</h1>
        <p className="max-w-2xl text-muted-foreground">
          It interrogates your idea, strengthens it against real competitors, shows a small clickable preview, helps you choose an architecture, and compiles a build prompt for Claude Code, Cursor, Lovable or your own hands. You can edit and lock everything it produces.
        </p>
        <ol className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
          {STEPS.map((s, i) => <li key={s} className="rounded-full border px-2.5 py-1">{i + 1}. {s}</li>)}
        </ol>
      </header>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>New idea</CardTitle>
          <CardDescription>Paste a paragraph. Rough is fine; the next step asks the hard questions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="raw" className="sr-only">Your idea</Label>
          <Textarea id="raw" rows={5} maxLength={4000} value={raw} onChange={(e) => setRaw(e.target.value)}
            placeholder="e.g. Students on my campus waste time walking around looking for a free study room. I want an app that shows which rooms are free right now and lets them book one…" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={create} disabled={!raw.trim() || creating} data-testid="new-idea"><Plus /> Start with this idea</Button>
          </div>
        </CardContent>
      </Card>

      <section className="mt-10" aria-labelledby="saved-h">
        <h2 id="saved-h" className="mb-3 text-lg font-semibold">Your ideas</h2>
        {ideas === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : ideas.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No saved ideas yet. They are stored in this browser.</p>
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="idea-list">
            {ideas.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <Link href={`/idea/${i.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{i.title}</Link>
                <Badge variant={i.readiness >= 75 ? "success" : i.readiness >= 40 ? "warning" : "secondary"} className="tabular-nums">Readiness {i.readiness}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">edited {new Date(i.updatedAt).toLocaleString()}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-label={`Duplicate ${i.title}`} onClick={async () => { await ideaStore().duplicate(i.id); refresh(); }}><Copy /> Duplicate</Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${i.title}`} onClick={async () => { if (confirm("Delete this idea from this browser?")) { await ideaStore().remove(i.id); refresh(); } }}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

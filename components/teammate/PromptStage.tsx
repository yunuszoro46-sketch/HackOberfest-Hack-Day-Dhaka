"use client";

import { useState } from "react";
import { Check, Copy, Download, FileArchive, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIdea } from "@/lib/client/IdeaContext";
import { bundleFiles } from "@/lib/export/bundle";
import { compilePrompt, projectName } from "@/lib/prompts/compile";
import { isStale, stamp } from "@/lib/stale";
import { PROMPT_TARGETS, type IdeaCard, type PromptTarget } from "@/lib/schema/ideaCard";

const TARGET_LABEL: Record<PromptTarget, string> = { "claude-code": "Claude Code", cursor: "Cursor", lovable: "Lovable", generic: "Generic" };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "teammate";

function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PromptStage() {
  const { card, update } = useIdea();
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  if (!card) return null;
  const target = card.prompt?.target ?? "claude-code";
  const compiled = compilePrompt(card, target);
  const markdown = card.prompt?.markdown ?? "";
  // A stale prompt differs because the card changed (the stale banner handles that), not because of hand edits.
  const edited = !!card.prompt && !isStale(card, "prompt") && card.prompt.markdown !== compiled;

  const compile = (t: PromptTarget, c: IdeaCard = card) => update((x) => stamp({ ...x, prompt: { target: t, markdown: compilePrompt(c, t) } }, "prompt"));
  const switchTarget = (t: PromptTarget) => {
    if (edited && !confirm("Switching target recompiles the prompt and replaces your manual edits. Continue?")) return;
    compile(t);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const bundle = async () => {
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const [name, content] of Object.entries(bundleFiles(card))) zip.file(name, content);
      download(`${slug(projectName(card))}-bundle.zip`, await zip.generateAsync({ type: "blob" }));
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="prompt-stage">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Build prompt</h2>
          <p className="text-sm text-muted-foreground">Compiled from your card by a fixed template, not written by a model. Targets change headings and tone, not content.</p>
        </div>
        <Tabs value={target} onValueChange={(v) => switchTarget(v as PromptTarget)}>
          <TabsList aria-label="Prompt target">
            {PROMPT_TARGETS.map((t) => <TabsTrigger key={t} value={t} data-target={t}>{TARGET_LABEL[t]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>

      {!card.prompt ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Compile the card into a prompt for {TARGET_LABEL[target]}.</p>
          <Button onClick={() => compile(target)} data-testid="compile">Compile prompt</Button>
        </div>
      ) : (
        <>
          {edited && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                You have edited the Markdown by hand. Recompiling replaces your edits.
                <Button size="sm" variant="outline" onClick={() => { if (confirm("Replace your edits with a fresh compile?")) compile(target); }}><RefreshCw /> Recompile</Button>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy} data-testid="copy-prompt">{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
            <Button variant="outline" onClick={() => download(`PROMPT-${target}.md`, new Blob([markdown], { type: "text/markdown;charset=utf-8" }))}><Download /> Download .md</Button>
            <Button variant="outline" onClick={bundle} disabled={zipping} data-testid="download-bundle"><FileArchive /> {zipping ? "Zipping…" : "Download bundle"}</Button>
            <span className="self-center text-xs text-muted-foreground">Bundle: PRD.md, ARCHITECTURE.md, PROMPT.md, preview.html, CLAUDE.md, idea-card.json</span>
          </div>
          <div className="space-y-1">
            <Label htmlFor="prompt-md">Markdown (editable)</Label>
            <Textarea id="prompt-md" rows={28} className="font-mono text-xs leading-relaxed" value={markdown}
              onChange={(e) => update((c) => ({ ...c, prompt: { target, markdown: e.target.value } }))} />
          </div>
        </>
      )}
    </div>
  );
}

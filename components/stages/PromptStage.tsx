"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, FileText, GitCompare, KeyRound, ShieldCheck, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Chip } from "@/components/console/Chip";
import { Panel, PanelBody, PanelHeader, StageHeading } from "@/components/console/Panel";
import { ProvenanceBadge } from "@/components/console/ProvenanceBadge";
import { EmptyState } from "@/components/console/StageStatus";
import { useToast } from "@/components/console/Toast";
import { useIdea } from "@/lib/client/IdeaContext";
import { voice } from "@/lib/client/speech";
import { bundleFiles } from "@/lib/export/bundle";
import { compilePrompt, projectName } from "@/lib/prompts/compile";
import { promptV2, type PromptDiff } from "@/lib/prompts/v2";
import { canSign, isSigned, sign, signoffDecisions } from "@/lib/signoff";
import { isStale, stamp } from "@/lib/stale";
import { PROMPT_TARGETS, type IdeaCard, type PromptTarget } from "@/lib/schema/ideaCard";
import { cn } from "@/lib/utils";
import type { Announce } from "./Workspace";

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

const kb = (s: string) => {
  const bytes = new Blob([s]).size;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One div per line; headings in amber. innerText of this structure gives the Markdown back. */
function toEditorHtml(md: string): string {
  return md.split("\n").map((line) => {
    if (!line) return "<div><br></div>";
    const cls = /^#{1,6}\s/.test(line) ? ' class="text-amber font-medium"' : "";
    return `<div${cls}>${escapeHtml(line)}</div>`;
  }).join("");
}

export function PromptStage({ announce }: { announce: Announce }) {
  const { card, update } = useIdea();
  const toast = useToast();
  const [signOpen, setSignOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<PromptTarget | null>(null);
  const [zipping, setZipping] = useState(false);
  const [notes, setNotes] = useState("");
  const [lastDiff, setLastDiff] = useState<PromptDiff | null>(null);
  const editor = useRef<HTMLDivElement>(null);

  const markdown = card?.prompt?.markdown ?? "";
  const target = card?.prompt?.target ?? "claude-code";
  const version = card?.prompt?.version ?? 1;

  // Re-render the editor only when the prompt changes from outside it (compile, target, v2), not on every keystroke.
  useEffect(() => {
    const el = editor.current;
    if (el && el.innerText.replace(/\n$/, "") !== markdown) el.innerHTML = toEditorHtml(markdown);
  }, [markdown]);

  const files = useMemo(() => (card?.prompt ? bundleFiles(card) : null), [card]);

  if (!card) return null;
  const signed = isSigned(card);
  const ready = canSign(card);
  const compiled = card.prompt ? compilePrompt(card, target) : "";
  const stale = !!card.prompt && isStale(card, "prompt");
  // Hand-edited: differs from a fresh compile while the card has not changed underneath it.
  const edited = !!card.prompt && !stale && version === 1 && card.prompt.markdown !== compiled;

  const compile = (c: IdeaCard, t: PromptTarget) => stamp({ ...c, prompt: { target: t, markdown: compilePrompt(c, t), version: 1 } }, "prompt");

  const signAndCompile = () => {
    update((c) => compile(sign(c), c.prompt?.target ?? "claude-code"));
    setSignOpen(false);
    announce("Specification signed. Prompt compiled.");
  };

  const switchTarget = (t: PromptTarget) => {
    if (t === target) return;
    if (edited || version > 1) {
      setPendingTarget(t);
      return;
    }
    update((c) => compile(c, t));
  };

  const saveEditor = () => {
    const text = editor.current?.innerText.replace(/\n$/, "") ?? "";
    if (card.prompt && text !== card.prompt.markdown) update((c) => (c.prompt ? { ...c, prompt: { ...c.prompt, markdown: text } } : c));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast("Prompt copied");
    } catch {
      // Fallback: select the text so Ctrl+C works.
      const el = editor.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      toast("Clipboard blocked. The prompt is selected; press Ctrl+C.", "crit");
    }
  };

  const bundle = async () => {
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const [name, content] of Object.entries(bundleFiles(card))) zip.file(name, content);
      download(`${slug(projectName(card))}-bundle.zip`, await zip.generateAsync({ type: "blob" }));
      toast("Bundle downloaded");
    } finally {
      setZipping(false);
    }
  };

  const makeV2 = () => {
    saveEditor();
    const prev = editor.current?.innerText.replace(/\n$/, "") ?? markdown;
    const { markdown: next, diff } = promptV2(card, target, prev, version, notes);
    update((c) => stamp({ ...c, prompt: { target, markdown: next, version: version + 1 } }, "prompt"));
    setLastDiff(diff);
    setNotes("");
    announce(`Prompt v${version + 1} written. ${diff.changed.length + diff.added.length} sections changed.`);
  };

  return (
    <div className="space-y-5" data-testid="prompt-stage">
      <StageHeading eyebrow="Stage 05 · Prompt" title="The blueprint, written for the tool that will build it."
        lead="Compiled from your card by a fixed template, not written by a model. Targets change headings and tone, not content." />

      <SignoffDialog card={card} open={signOpen} onOpenChange={setSignOpen} onSign={signAndCompile} />

      {!card.prompt ? (
        <EmptyState
          text={ready ? "Nothing is compiled until you sign the three decisions this plan rests on." : "Choose a direction and a stack first. Then sign the plan to compile the prompt."}
          action={<Button variant="primary" onClick={() => setSignOpen(true)} disabled={!ready} data-testid="compile"><KeyRound /> Review and sign</Button>} />
      ) : (
        <>
          {signed ? (
            <div className="lcd-display lcd-power-on flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[8px] px-4 py-3" data-testid="signed-readout">
              <ShieldCheck className="size-4 text-amber" aria-hidden="true" />
              <span className="font-mono text-[13px] font-medium uppercase tracking-[.14em] text-amber">Specification signed &amp; unlocked</span>
              <span className="tabular ml-auto font-mono text-[11px] text-fg-dim">v{version} · signed {new Date(card.signoff!.signedAt).toLocaleString()}</span>
            </div>
          ) : (
            <section className="panel border-warn" role="status" data-testid="resign-banner">
              <div className="pb flex flex-wrap items-center gap-3">
                <span className="text-warn" aria-hidden="true">!</span>
                <p className="min-w-0 flex-1 text-[14px]"><span className="font-medium">The plan changed after you signed it.</span> <span className="text-fg-dim">This prompt still describes the old plan. Sign again to recompile.</span></p>
                <Button size="sm" onClick={() => setSignOpen(true)}><KeyRound /> Sign again</Button>
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-[4px] border border-line-2 p-0.5" role="radiogroup" aria-label="Prompt target">
              {PROMPT_TARGETS.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={target === t} data-target={t} onClick={() => switchTarget(t)}
                  className={cn("h-[30px] rounded-[3px] px-3 font-mono text-[11px] uppercase tracking-[.06em]", target === t ? "bg-[var(--panel-2)] text-amber shadow-[inset_0_-2px_0_var(--amber)]" : "text-fg-dim hover:text-fg")}>
                  {TARGET_LABEL[t]}
                </button>
              ))}
            </div>
            <ProvenanceBadge kind="rules" />
            {version > 1 && <Chip tone="info" icon={<span aria-hidden="true">↻</span>}>v{version}</Chip>}
            {edited && <Chip tone="default" icon={<span aria-hidden="true">●</span>}>edited by you</Chip>}
          </div>
          {pendingTarget && (
            <div className="panel border-warn" role="alert" data-testid="target-confirm">
              <div className="pb flex flex-wrap items-center gap-2 text-[14px]">
                <span className="min-w-0 flex-1">Switching to {TARGET_LABEL[pendingTarget]} recompiles the prompt and replaces your edits.</span>
                <Button size="sm" onClick={() => { update((c) => compile(c, pendingTarget)); setPendingTarget(null); }}>Replace my edits</Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingTarget(null)}>Keep editing</Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel aria-labelledby="md-h">
              <PanelHeader id="md-h" title={`PROMPT.md · ${TARGET_LABEL[target]}`} right={<span className="font-mono text-[11px] text-fg-faint">editable</span>} />
              <div ref={editor} id="prompt-md" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-labelledby="md-h"
                spellCheck={false} onBlur={saveEditor} data-testid="prompt-editor"
                className="h-[560px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[12.5px] leading-relaxed outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--amber)]" />
            </Panel>

            <div className="min-w-0 space-y-4">
              <Panel aria-labelledby="export-h">
                <PanelHeader id="export-h" title="Export" />
                <PanelBody className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onClick={copy} data-testid="copy-prompt"><Copy /> Copy prompt</Button>
                    <Button onClick={bundle} disabled={zipping} data-testid="download-bundle"><Download /> {zipping ? "Zipping…" : "Download bundle"}</Button>
                    <Button variant="ghost" onClick={() => voice.read(markdown.replace(/[#*`|>_-]/g, " ").slice(0, 4000))}><Volume2 /> Read aloud</Button>
                  </div>
                  {files && (
                    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" data-testid="bundle-files">
                      {Object.entries(files).map(([name, content]) => (
                        <li key={name} className="min-w-0 rounded-[6px] border border-line px-2 py-1.5">
                          <p className="flex items-center gap-1 truncate font-mono text-[12px]"><FileText className="size-3 shrink-0 text-fg-faint" aria-hidden="true" />{name}</p>
                          <p className="tabular font-mono text-[11px] text-fg-faint">{kb(content)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </PanelBody>
              </Panel>

              <Panel aria-labelledby="v2-h">
                <PanelHeader id="v2-h" title="Prompt v2 loop" />
                <PanelBody className="space-y-2">
                  <p className="text-[13px] text-fg-dim">Builder came back with problems, or you changed the card? Note it here. TeamMate diffs the prompt against the card and writes the next version with a change list.</p>
                  <label htmlFor="v2-notes" className="label-mono uppercase tracking-[.1em]">What went wrong in the build</label>
                  <textarea id="v2-notes" rows={4} className="field" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. The agent skipped auth; the booking form needs a time zone." />
                  <Button size="sm" onClick={makeV2} disabled={!signed} title={signed ? undefined : "Sign the current plan first"} data-testid="prompt-v2"><GitCompare /> Diff against card → Prompt v{version + 1}</Button>
                  {lastDiff && (
                    <p className="font-mono text-[11px] text-fg-dim" data-testid="v2-diff">
                      {lastDiff.changed.length} updated · {lastDiff.added.length} added · {lastDiff.removed.length} removed
                      {lastDiff.changed.length > 0 && <> · {lastDiff.changed.slice(0, 4).join(", ")}</>}
                    </p>
                  )}
                </PanelBody>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SignoffDialog({ card, open, onOpenChange, onSign }: { card: IdeaCard; open: boolean; onOpenChange: (o: boolean) => void; onSign: () => void }) {
  const decisions = signoffDecisions(card);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="signoff-dialog" className="max-w-[560px]">
        <p className="eyebrow">Between Architecture and Prompt</p>
        <DialogTitle className="font-display text-[20px] font-semibold">Human Sign-Off Checkpoint</DialogTitle>
        <DialogDescription className="text-[14px] text-fg-dim">The prompt hands these three decisions to a coding agent. Read them. Signing compiles the prompt; changing any of them later voids the signature.</DialogDescription>
        <ol className="space-y-3">
          {decisions.map((d, i) => (
            <li key={d.question} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-[6px] border border-line p-3">
              <span className="tabular font-mono text-[13px] text-amber" aria-hidden="true">0{i + 1}</span>
              <div className="min-w-0">
                <p className="label-mono uppercase tracking-[.1em]">{d.question}</p>
                <p className="text-[14px]">{d.answer}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Not yet</Button></DialogClose>
          <Button variant="primary" onClick={onSign} data-testid="sign-and-compile"><KeyRound /> Sign and compile</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

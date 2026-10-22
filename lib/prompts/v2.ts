// The Prompt v2 loop: compare the prompt the builder has (possibly hand-edited) with a fresh compile of the card,
// and produce the next version with a "Changes since" section listing what moved and the builder's notes.
import type { IdeaCard, PromptTarget } from "../schema/ideaCard";
import { compilePrompt } from "./compile";

/** Splits Markdown into sections keyed by their "## " heading. */
export function sectionsOf(md: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = md.split(/^## /m);
  for (const p of parts.slice(1)) {
    const nl = p.indexOf("\n");
    const title = (nl < 0 ? p : p.slice(0, nl)).trim();
    out.set(title, (nl < 0 ? "" : p.slice(nl + 1)).trim());
  }
  return out;
}

export interface PromptDiff {
  changed: string[];
  added: string[];
  removed: string[];
}

export function diffPrompts(before: string, after: string): PromptDiff {
  const a = sectionsOf(before);
  const b = sectionsOf(after);
  const changed = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k));
  const added = [...b.keys()].filter((k) => !a.has(k));
  const removed = [...a.keys()].filter((k) => !b.has(k) && !k.startsWith("Changes since v"));
  return { changed, added, removed };
}

export function promptV2(card: IdeaCard, target: PromptTarget, previous: string, version: number, notes: string): { markdown: string; diff: PromptDiff } {
  const fresh = compilePrompt(card, target);
  const diff = diffPrompts(previous, fresh);
  const lines = [
    ...diff.changed.map((s) => `- Updated: ${s}`),
    ...diff.added.map((s) => `- Added: ${s}`),
    ...diff.removed.map((s) => `- Removed: ${s} (it was only in your hand edits)`),
  ];
  const notesBlock = notes.trim() ? `\n\nNotes from the builder:\n${notes.trim().split("\n").map((l) => `> ${l}`).join("\n")}` : "";
  const changes = `## Changes since v${version}\n\n${lines.length ? lines.join("\n") : "- No section changed; the card matches the previous prompt."}${notesBlock}\n`;
  return { markdown: `${fresh.trimEnd()}\n\n${changes}`, diff };
}

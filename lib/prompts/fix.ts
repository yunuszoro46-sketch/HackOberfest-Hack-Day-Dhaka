// After a build check: the next prompt version leads with what failed and what the report never confirmed,
// so the coding agent fixes only that, then reports again in the same format.
import type { BuildCheck, IdeaCard, PromptTarget } from "../schema/ideaCard";
import { promptV2, type PromptDiff } from "./v2";

export function fixSection(check: BuildCheck): string {
  const failed = check.results.filter((r) => r.status === "fail");
  const unknown = check.results.filter((r) => r.status === "unknown");
  const passed = check.results.filter((r) => r.status === "pass");
  const parts = [`## Fix these first (build check of prompt v${check.promptVersion})`, ""];
  if (failed.length) {
    parts.push("These acceptance criteria failed. Fix them, and change nothing else:", "");
    for (const r of failed) parts.push(`- **${r.acId}** ${r.criterion}${r.evidence ? `\n  - Report said: \`${r.evidence.replace(/`/g, "'")}\`` : ""}`);
    parts.push("");
  }
  if (unknown.length) {
    parts.push("The report did not confirm these. Run their tests in `tests/acceptance.spec.ts` and report them:", "");
    for (const r of unknown) parts.push(`- **${r.acId}** ${r.criterion}`);
    parts.push("");
  }
  if (passed.length) parts.push(`Already passing, keep them green: ${passed.map((r) => r.acId).join(", ")}.`, "");
  parts.push("When done, rerun `tests/acceptance.spec.ts` and report again: one line per criterion, `AC-01 PASS` or `AC-01 FAIL — reason`.");
  return parts.join("\n");
}

/** The next prompt: a fresh compile with the fix section after the intro, plus the usual "Changes since" list. */
export function fixPrompt(card: IdeaCard, target: PromptTarget, previous: string, version: number, check: BuildCheck): { markdown: string; diff: PromptDiff } {
  const notes = `Build check: ${check.results.filter((r) => r.status === "fail").length} failed, ${check.results.filter((r) => r.status === "unknown").length} unconfirmed.`;
  const { markdown, diff } = promptV2(card, target, previous, version, notes);
  const at = markdown.indexOf("\n## ");
  const body = at < 0 ? `${markdown}\n\n${fixSection(check)}\n` : `${markdown.slice(0, at)}\n\n${fixSection(check)}\n${markdown.slice(at)}`;
  return { markdown: body, diff };
}

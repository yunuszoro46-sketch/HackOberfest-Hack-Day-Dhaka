// Decision log: derived by comparing the card before and after each change, so every lock, pick, approval,
// sign-off, prompt version, build check and review is recorded without any screen having to remember to log it.
// Text edits are not logged (too noisy); the log is about decisions.
import { stageLabelOf } from "./stageNames";
import { chosenDirection, type IdeaCard, type LogEntry, type StageId } from "./schema/ideaCard";
import { councilVerdict } from "./verdict";
import { summarize } from "./verify";

const FIELD_LABEL: Record<string, string> = {
  problem: "Problem", targetUser: "Target user", coreAction: "Core action", whyNow: "Why now", outOfScope: "Out of scope",
  diagramMermaid: "Component diagram", dataModel: "Data model", apiSurface: "API surface", services: "Services", deployment: "Deployment", risks: "Risk register",
};
const TOP = ["problem", "targetUser", "coreAction", "whyNow", "outOfScope"] as const;
const ARCH = ["diagramMermaid", "dataModel", "apiSurface", "services", "deployment", "risks"] as const;
const TARGET: Record<string, string> = { "claude-code": "Claude Code", cursor: "Cursor", lovable: "Lovable", generic: "Generic" };

export function logChanges(prev: IdeaCard, next: IdeaCard, at = new Date().toISOString()): LogEntry[] {
  const out: LogEntry[] = [];
  const add = (kind: LogEntry["kind"], text: string) => out.push({ at, kind, text: text.slice(0, 300) });

  for (const k of TOP) {
    if (prev[k].locked !== next[k].locked) add(next[k].locked ? "lock" : "unlock", `${next[k].locked ? "Locked" : "Unlocked"} ${FIELD_LABEL[k]}`);
  }
  if (prev.architecture && next.architecture) {
    for (const k of ARCH) {
      if (prev.architecture[k].locked !== next.architecture[k].locked) add(next.architecture[k].locked ? "lock" : "unlock", `${next.architecture[k].locked ? "Locked" : "Unlocked"} ${FIELD_LABEL[k]}`);
    }
  }

  for (const s of Object.keys(next.stamps) as StageId[]) {
    if (s === "verify" || s === "prompt") continue;
    if (prev.stamps[s] === next.stamps[s]) continue;
    const kind = next.provenance[s === "interrogate" ? "interrogate" : s]?.kind;
    add("stage", `${prev.stamps[s] === undefined ? "Ran" : "Re-ran"} ${stageLabelOf(s)}${kind === "mock" ? " (mock replies)" : ""}`);
  }

  const vPrev = councilVerdict(prev)?.status;
  const v = councilVerdict(next);
  if (v && v.status !== vPrev) add("stage", `Council verdict: ${v.summary}`);

  if (next.chosenDirectionId && next.chosenDirectionId !== prev.chosenDirectionId) add("direction", `Picked direction: ${chosenDirection(next)?.title ?? next.chosenDirectionId}`);
  if (next.previewApprovedId && next.previewApprovedId !== prev.previewApprovedId) {
    add("approve", `Approved the preview of ${next.directions.find((d) => d.id === next.previewApprovedId)?.title ?? "the chosen direction"}`);
  }
  const stackId = next.architecture?.chosenId;
  if (stackId && stackId !== prev.architecture?.chosenId) add("stack", `Chose stack: ${next.architecture!.candidates.find((c) => c.id === stackId)?.name ?? stackId}`);

  if (next.signoff && next.signoff.signedAt !== prev.signoff?.signedAt) {
    const stack = next.architecture?.candidates.find((c) => c.id === next.architecture?.chosenId)?.name;
    add("sign", `Signed the plan: ${chosenDirection(next)?.title ?? "no direction"} on ${stack ?? "no stack"}`);
  }

  if (next.prompt && !prev.prompt) add("prompt", `Compiled prompt v${next.prompt.version} for ${TARGET[next.prompt.target]}`);
  else if (next.prompt && prev.prompt) {
    if (next.prompt.version > prev.prompt.version) add("prompt", `Wrote prompt v${next.prompt.version}`);
    else if (next.prompt.target !== prev.prompt.target) add("prompt", `Switched the prompt to ${TARGET[next.prompt.target]}`);
  }

  if (next.buildChecks.length && next.buildChecks.at(-1)?.id !== prev.buildChecks.at(-1)?.id) {
    const c = next.buildChecks.at(-1)!;
    const s = summarize(c.results);
    add("check", `Checked the build of prompt v${c.promptVersion}: ${s.pass} pass, ${s.fail} fail, ${s.unknown} not confirmed`);
  }

  for (const r of next.reviews.filter((r) => !prev.reviews.some((p) => p.id === r.id))) {
    add("review", `Review from ${r.reviewer || "a reviewer"}: ${r.verdict === "approve" ? "approved" : r.verdict === "changes" ? "asked for changes" : "rejected"}`);
  }
  return out;
}

export const withLog = (prev: IdeaCard, next: IdeaCard): IdeaCard => {
  const entries = logChanges(prev, next);
  return entries.length ? { ...next, log: [...next.log, ...entries].slice(-300) } : next;
};

export function decisionsMarkdown(card: IdeaCard): string {
  const rows = card.log.map((e) => `| ${e.at.replace("T", " ").slice(0, 16)} | ${e.kind} | ${e.text.replace(/\|/g, "/")} |`);
  const reviews = card.reviews.map((r) => {
    const d = r.decisions.map((x) => `  - ${x.stance === "agree" ? "Agrees" : "Questions"}: ${x.question}${x.comment ? ` — ${x.comment}` : ""}`).join("\n");
    return `- **${r.reviewer || "Reviewer"}** (${r.at.slice(0, 10)}): ${r.verdict}${r.note ? ` — ${r.note}` : ""}\n${d}`;
  });
  return `# Decision log

Every decision the builder made, in order. Generated by TeamMate.

| When (UTC) | Kind | Decision |
|---|---|---|
${rows.join("\n") || "| | | No decisions recorded yet. |"}

## Reviews

${reviews.join("\n") || "_No reviews yet._"}
`;
}

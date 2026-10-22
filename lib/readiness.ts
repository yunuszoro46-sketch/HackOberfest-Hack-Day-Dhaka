// Build-Readiness Score (0-100). Computed from the card; never produced by a model.
// Six contributors: lock 3+ fields 15, council run 20, direction picked 15, preview approved 20,
// stack chosen 15, prompt compiled 15. A stage that ran on older inputs (stale) counts half.
import type { IdeaCard, Lockable } from "./schema/ideaCard";
import { isStale } from "./stale";

export interface Contributor {
  label: string;
  max: number;
  got: number;
  done: boolean;
  /** What to do next to earn it, when not done. */
  hint: string;
}

export interface Readiness {
  score: number;
  contributors: Contributor[];
  /** Missing points, most valuable first. */
  improvements: { label: string; points: number }[];
}

/** Every lockable field on the card, for the locked-field count. */
export function lockables(card: IdeaCard): Lockable<unknown>[] {
  const list: Lockable<unknown>[] = [card.problem, card.targetUser, card.coreAction, card.whyNow, card.outOfScope];
  const a = card.architecture;
  if (a?.chosenId) list.push(a.diagramMermaid, a.dataModel, a.apiSurface, a.services, a.deployment, a.risks);
  return list;
}

export function computeReadiness(card: IdeaCard): Readiness {
  const half = (stage: Parameters<typeof isStale>[1]) => (isStale(card, stage) ? 0.5 : 1);
  const locked = lockables(card).filter((l) => l.locked).length;
  const live = card.competitors.some((c) => c.source === "tavily" || c.source === "google-search");
  const councilPts = ((card.council ? 10 : 0) + (live ? 10 : card.competitors.length ? 5 : 0)) * half("council");
  const approved = !!card.previewApprovedId && card.previewApprovedId === card.chosenDirectionId;
  const contributors: Contributor[] = [
    { label: `Lock 3+ fields (${Math.min(locked, 3)}/3)`, max: 15, got: Math.min(locked, 3) * 5, done: locked >= 3, hint: "Lock the fields you trust." },
    { label: "Council run", max: 20, got: Math.round(councilPts), done: councilPts >= 20, hint: card.council && !live ? "Re-run with live search (TAVILY_API_KEY) for full points." : "Run the council and competitor check." },
    { label: "Direction picked", max: 15, got: card.chosenDirectionId ? 15 : 0, done: !!card.chosenDirectionId, hint: "Pick a direction." },
    { label: "Preview approved", max: 20, got: approved ? 20 * half("preview") : 0, done: approved && !isStale(card, "preview"), hint: "Approve the preview of your direction." },
    { label: "Stack chosen", max: 15, got: card.architecture?.chosenId ? 15 * half("architecture") : 0, done: !!card.architecture?.chosenId && !isStale(card, "architecture"), hint: "Choose an architecture." },
    { label: "Prompt compiled", max: 15, got: card.prompt ? 15 * half("prompt") : 0, done: !!card.prompt && !isStale(card, "prompt"), hint: "Sign off and compile the prompt." },
  ];
  const score = Math.round(contributors.reduce((s, c) => s + c.got, 0));
  const improvements = contributors
    .filter((c) => c.got < c.max)
    .map((c) => ({ label: c.hint, points: Math.round(c.max - c.got) }))
    .sort((a, b) => b.points - a.points);
  return { score, contributors, improvements };
}

/** Returns the card with its readiness field refreshed. Call before every save. */
export function withReadiness(card: IdeaCard): IdeaCard {
  return { ...card, readiness: computeReadiness(card).score };
}

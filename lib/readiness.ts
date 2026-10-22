// Build-Readiness Score (0-100). Computed from the card; never produced by a model.
import type { IdeaCard, Lockable } from "./schema/ideaCard";
import { isStale } from "./stale";

export interface Readiness {
  score: number;
  /** What would raise the score, most valuable first. */
  improvements: { label: string; points: number }[];
}

const filled = (l: Lockable<string>) => l.value.trim().length > 0;

/** Every lockable field on the card, for the locked-field count. */
export function lockables(card: IdeaCard): Lockable<unknown>[] {
  const list: Lockable<unknown>[] = [card.problem, card.targetUser, card.coreAction, card.whyNow, card.outOfScope];
  const a = card.architecture;
  if (a?.chosenId) list.push(a.diagramMermaid, a.dataModel, a.apiSurface, a.services, a.deployment, a.risks);
  return list;
}

export function computeReadiness(card: IdeaCard): Readiness {
  const parts: { label: string; max: number; got: number }[] = [];
  const add = (label: string, max: number, got: number) => parts.push({ label, max, got: Math.max(0, Math.min(max, got)) });

  const core = [card.problem, card.targetUser, card.coreAction, card.whyNow];
  add("Fill problem, target user, core action and why now", 20, core.filter(filled).length * 5);

  const all = lockables(card);
  const locked = all.filter((l) => l.locked).length;
  add(`Lock the fields you trust (${locked}/${all.length} locked)`, 15, Math.round((locked / all.length) * 15));

  const fresh = (stage: Parameters<typeof isStale>[1]) => (isStale(card, stage) ? 0.5 : 1);
  add("Run the council critiques", 10, card.council ? 10 * fresh("council") : 0);
  const searched = card.competitors.length > 0 && card.competitors.some((c) => c.source === "tavily" || c.source === "google-search");
  add(searched ? "Competitor check is done" : card.competitors.length ? "Re-run the competitor check with live search" : "Run the competitor check", 10, searched ? 10 : card.competitors.length ? 5 : 0);
  add("Choose a direction", 15, card.chosenDirectionId ? 15 : 0);
  add("Choose an architecture", 15, card.architecture?.chosenId ? 15 * fresh("architecture") : card.architecture ? 5 : 0);
  add("Compile the build prompt", 15, card.prompt ? 15 * fresh("prompt") : 0);

  const score = Math.round(parts.reduce((s, p) => s + p.got, 0));
  const improvements = parts
    .filter((p) => p.got < p.max)
    .map((p) => ({ label: p.label, points: Math.round(p.max - p.got) }))
    .sort((a, b) => b.points - a.points);
  return { score, improvements };
}

/** Returns the card with its readiness field refreshed. Call before every save. */
export function withReadiness(card: IdeaCard): IdeaCard {
  return { ...card, readiness: computeReadiness(card).score };
}

import type { IdeaCard, Lockable } from "../schema/ideaCard";

const isLockable = (v: unknown): v is Lockable<unknown> => typeof v === "object" && v !== null && "locked" in v && "value" in v;

/**
 * Merges a stage's patch into the card. A locked field on the card is never overwritten, even if a patch carries
 * it (the server already leaves them out; this is the second guard).
 */
export function applyPatch(card: IdeaCard, patch: Partial<IdeaCard>): IdeaCard {
  const next = { ...card } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const current = (card as Record<string, unknown>)[k];
    if (isLockable(current) && current.locked) continue;
    next[k] = v;
  }
  return next as IdeaCard;
}

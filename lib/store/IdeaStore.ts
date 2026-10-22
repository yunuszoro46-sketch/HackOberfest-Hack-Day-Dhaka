import type { IdeaCard } from "../schema/ideaCard";

export interface IdeaSummary {
  id: string;
  title: string;
  readiness: number;
  updatedAt: string;
}

/** Where idea cards live. localStorage now; a Supabase implementation can replace it without touching the UI. */
export interface IdeaStore {
  list(): Promise<IdeaSummary[]>;
  get(id: string): Promise<IdeaCard | null>;
  save(card: IdeaCard): Promise<void>;
  remove(id: string): Promise<void>;
  /** Copies a card under a new id, e.g. to branch a different direction. */
  duplicate(id: string): Promise<IdeaCard>;
}

export const summaryTitle = (card: IdeaCard) =>
  (card.coreAction.value || card.problem.value || card.raw).trim().replace(/\s+/g, " ").slice(0, 90) || "Untitled idea";

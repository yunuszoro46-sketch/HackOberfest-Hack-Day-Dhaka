import type { IdeaCard } from "../schema/ideaCard";

export interface IdeaSummary {
  id: string;
  title: string;
  readiness: number;
  updatedAt: string;
  /** One line of the problem, for the home card. */
  problem?: string;
  /** 1-5: the furthest stage that has run (1 when nothing has). */
  stage?: number;
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

const STAGE_ORDER = ["interrogate", "council", "preview", "architecture", "prompt"] as const;

export function summarize(card: IdeaCard): IdeaSummary {
  const ran = STAGE_ORDER.filter((s) => card.stamps[s] !== undefined).length;
  return {
    id: card.id,
    title: summaryTitle(card),
    readiness: card.readiness,
    updatedAt: card.updatedAt,
    problem: (card.problem.value || card.raw).trim().replace(/\s+/g, " ").slice(0, 140),
    stage: Math.min(5, ran + 1),
  };
}

import type { IdeaCard } from "../schema/ideaCard";
import type { IdeaStore, IdeaSummary } from "./IdeaStore";

/**
 * Placeholder for cloud persistence. Not built for the MVP (no auth, no database); it exists so the
 * IdeaStore interface has a second shape to keep it honest.
 */
export class SupabaseIdeaStore implements IdeaStore {
  private fail(): never {
    throw new Error("SupabaseIdeaStore is not implemented yet; TeamMate stores ideas in this browser (localStorage).");
  }
  async list(): Promise<IdeaSummary[]> { return this.fail(); }
  async get(_id: string): Promise<IdeaCard | null> { return this.fail(); }
  async save(_card: IdeaCard): Promise<void> { return this.fail(); }
  async remove(_id: string): Promise<void> { return this.fail(); }
  async duplicate(_id: string): Promise<IdeaCard> { return this.fail(); }
}

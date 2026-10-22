import { IdeaCardSchema, type IdeaCard } from "../schema/ideaCard";
import { withReadiness } from "../readiness";
import { summarize, type IdeaStore, type IdeaSummary } from "./IdeaStore";

const PREFIX = "teammate:idea:";

/** Minimal Storage surface, so tests can pass an in-memory map. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export class LocalStorageIdeaStore implements IdeaStore {
  constructor(private readonly storage: StorageLike = globalThis.localStorage) {}

  private keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k?.startsWith(PREFIX)) out.push(k);
    }
    return out;
  }

  /** Corrupt or outdated entries are skipped rather than crashing the home page. */
  private read(key: string): IdeaCard | null {
    try {
      const parsed = IdeaCardSchema.safeParse(JSON.parse(this.storage.getItem(key) ?? "null"));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async list(): Promise<IdeaSummary[]> {
    return this.keys()
      .map((k) => this.read(k))
      .filter((c): c is IdeaCard => c !== null)
      .map(summarize)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<IdeaCard | null> {
    return this.read(PREFIX + id);
  }

  async save(card: IdeaCard): Promise<void> {
    const valid = IdeaCardSchema.parse(withReadiness(card));
    this.storage.setItem(PREFIX + valid.id, JSON.stringify(valid));
  }

  async remove(id: string): Promise<void> {
    this.storage.removeItem(PREFIX + id);
  }

  async duplicate(id: string): Promise<IdeaCard> {
    const card = await this.get(id);
    if (!card) throw new Error(`Idea ${id} not found`);
    const now = new Date().toISOString();
    const copy: IdeaCard = { ...structuredClone(card), id: crypto.randomUUID(), createdAt: now, updatedAt: now, version: 1 };
    await this.save(copy);
    return copy;
  }
}

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emptyArchitecture, IdeaCardSchema, newIdeaCard, type IdeaCard } from "@/lib/schema/ideaCard";
import { computeReadiness, withReadiness } from "@/lib/readiness";
import { isStale, stamp, staleStages } from "@/lib/stale";
import { LocalStorageIdeaStore, type StorageLike } from "@/lib/store/localStorageStore";
import { generate } from "@/lib/llm/adapter";
import { extractHtml, extractJson } from "@/lib/llm/json";
import { LlmError, type LlmProvider, type TextRequest } from "@/lib/llm/types";

const filledCard = (): IdeaCard => {
  const c = newIdeaCard("Students cannot find a free study room.", "2026-10-22T00:00:00.000Z");
  c.problem = { value: "Students waste 20 minutes hunting for free rooms", locked: false };
  c.targetUser = { value: "Undergraduates during exam weeks", locked: false };
  c.coreAction = { value: "Book a free study room in two taps", locked: true };
  c.whyNow = { value: "Room sensors were installed this term", locked: false };
  return c;
};

describe("IdeaCard schema", () => {
  it("a new card is valid and round-trips through JSON", () => {
    const c = newIdeaCard("An idea");
    expect(IdeaCardSchema.parse(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it("lockable fields default locked to false and reject bad shapes", () => {
    const raw = JSON.parse(JSON.stringify(newIdeaCard("x")));
    raw.problem = { value: "p" };
    expect(IdeaCardSchema.parse(raw).problem).toEqual({ value: "p", locked: false });
    expect(IdeaCardSchema.safeParse({ ...raw, problem: "p" }).success).toBe(false);
    expect(IdeaCardSchema.safeParse({ ...raw, directions: [1, 2, 3, 4] }).success).toBe(false);
  });

  it("caps directions at 3 and stack scores at 1-5", () => {
    const raw = JSON.parse(JSON.stringify(newIdeaCard("x")));
    const dir = { id: "d", title: "t", oneLiner: "o", rationale: "r", citations: [] };
    expect(IdeaCardSchema.safeParse({ ...raw, directions: [dir, dir, dir, dir] }).success).toBe(false);
    const cand = { id: "a", name: "A", stack: ["Next.js"], scores: { speed: 6, fit: 3, skills: 3, cost: 3, hackathon: 3 }, why: "w", whyNot: "n" };
    expect(IdeaCardSchema.safeParse({ ...raw, architecture: emptyArchitecture([cand as never]) }).success).toBe(false);
  });
});

describe("staleness", () => {
  it("editing an upstream field marks downstream stages stale; locks alone do not", () => {
    let c = filledCard();
    c = stamp(stamp(c, "council"), "architecture");
    expect(staleStages(c)).toEqual([]);
    c = { ...c, coreAction: { ...c.coreAction, locked: false } };
    expect(staleStages(c)).toEqual([]);
    c = { ...c, problem: { value: "A different problem", locked: false } };
    expect(isStale(c, "council")).toBe(true);
    expect(isStale(c, "architecture")).toBe(true);
    expect(isStale(c, "preview")).toBe(false); // never ran, so never stale
  });
});

describe("readiness", () => {
  it("is 0 for an empty card and lists what would raise it", () => {
    const r = computeReadiness(newIdeaCard("x"));
    expect(r.score).toBe(0);
    expect(r.improvements[0].label).toMatch(/Fill problem/);
    expect(r.improvements.map((i) => i.label)).toContain("Choose a direction");
  });

  it("counts filled and locked fields, and a stale stage only half", () => {
    let c = filledCard();
    const base = computeReadiness(c).score;
    expect(base).toBe(20 + 3); // four core fields + 1 of 5 lockables locked (15 * 1/5)
    c = stamp({ ...c, council: { investor: crit(), user: crit(), engineer: crit() } }, "council");
    expect(computeReadiness(c).score).toBe(base + 10);
    c = { ...c, whyNow: { value: "Changed", locked: false } };
    expect(computeReadiness(c).score).toBe(base + 5);
    expect(withReadiness(c).readiness).toBe(base + 5);
  });
});

const crit = () => ({ strongest_objection: "o", what_would_change_my_mind: "m", one_question: "q" });

class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe("LocalStorageIdeaStore", () => {
  it("saves with readiness, lists newest first, duplicates and skips corrupt entries", async () => {
    const storage = new MemoryStorage();
    const store = new LocalStorageIdeaStore(storage);
    const a = filledCard();
    await store.save(a);
    const b = { ...newIdeaCard("Second"), updatedAt: "2030-01-01T00:00:00.000Z" };
    await store.save(b);
    storage.setItem("teammate:idea:broken", "{not json");
    const list = await store.list();
    expect(list.map((s) => s.id)).toEqual([b.id, a.id]);
    expect(list[1]).toMatchObject({ title: "Book a free study room in two taps", readiness: 23 });
    const copy = await store.duplicate(a.id);
    expect(copy.id).not.toBe(a.id);
    expect(copy.coreAction).toEqual(a.coreAction);
    await store.remove(a.id);
    expect(await store.get(a.id)).toBeNull();
  });
});

describe("LLM adapter", () => {
  const Schema = z.object({ answer: z.string().min(1) });
  const provider = (replies: string[]): LlmProvider & { calls: TextRequest[] } => {
    const calls: TextRequest[] = [];
    return {
      name: "mock", model: "fake", configured: true, supportsSearch: false, calls,
      async generateText(req) { calls.push(req); return { text: replies.shift() ?? "" }; },
    };
  };

  it("parses fenced JSON", async () => {
    const p = provider(['Sure!\n```json\n{"answer":"yes"}\n```']);
    const r = await generate({ stage: "t", system: "s", user: "u", schema: Schema, provider: p });
    expect(r.data).toEqual({ answer: "yes" });
  });

  it("retries once with the validation error appended, then succeeds", async () => {
    const p = provider(['{"answer":""}', '{"answer":"fixed"}']);
    const r = await generate({ stage: "t", system: "s", user: "u", schema: Schema, provider: p });
    expect(r.data.answer).toBe("fixed");
    expect(p.calls[1].user).toMatch(/did not match the schema: answer: /);
  });

  it("fails with 422 and the raw text after the second bad reply", async () => {
    const p = provider(["not json", "still not json"]);
    const err = await generate({ stage: "t", system: "s", user: "u", schema: Schema, provider: p }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err).toMatchObject({ status: 422, raw: "still not json" });
  });

  it("extracts JSON and HTML from chatty replies", () => {
    expect(extractJson('Here: {"a": "b}"} trailing')).toEqual({ a: "b}" });
    expect(extractHtml("```html\n<!doctype html><html><body>x</body></html>\n```")).toBe("<!doctype html><html><body>x</body></html>");
  });
});

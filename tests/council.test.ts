import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as council } from "@/app/api/stage/council/route";
import { POST as competitors } from "@/app/api/stage/competitors/route";
import { POST as directions } from "@/app/api/stage/directions/route";
import { competitorQueries } from "@/lib/prompts/competitors";
import { newIdeaCard, type IdeaCard } from "@/lib/schema/ideaCard";
import { resetRateLimit } from "@/lib/server/rateLimit";

process.env.LLM_PROVIDER = "mock";

const card = (): IdeaCard => ({
  ...newIdeaCard("Students waste time finding free study rooms."),
  problem: { value: "Students waste 20 minutes finding a free study room", locked: false },
  targetUser: { value: "Undergraduates in exam weeks", locked: false },
  coreAction: { value: "Book a free study room in two taps", locked: true },
  whyNow: { value: "Rooms have sensors now", locked: false },
});
const req = (path: string, body: unknown) =>
  new NextRequest(`http://localhost/api/stage/${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("Stage 2 — Council, competitors, directions", () => {
  beforeEach(() => resetRateLimit());
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TAVILY_API_KEY;
  });

  it("council returns three persona critiques", async () => {
    const { patch } = await (await council(req("council", { card: card() }))).json();
    expect(Object.keys(patch.council)).toEqual(["investor", "user", "engineer"]);
    expect(patch.council.investor.strongest_objection).toContain("Book a free study room in two taps");
  });

  it("without search, competitors are model knowledge with no URLs and a warning", async () => {
    const res = await (await competitors(req("competitors", { card: card() }))).json();
    expect(res.patch.competitorSearch.mode).toBe("none");
    expect(res.patch.competitorSearch.queries).toHaveLength(3);
    expect(res.patch.competitors.every((c: { url: string; source: string }) => c.url === "" && c.source === "model-knowledge")).toBe(true);
    expect(res.warning).toMatch(/No live search is configured/);
  });

  it("with Tavily, URLs are copied from search results by index, never typed by the model", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { query } = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ results: [{ title: `RoomFinder - ${query.slice(0, 10)}`, url: `https://roomfinder.example/${encodeURIComponent(query.slice(0, 5))}`, content: "Find rooms." }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await (await competitors(req("competitors", { card: card() }))).json();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer test-key");
    expect(res.patch.competitorSearch.mode).toBe("tavily");
    expect(res.patch.competitors[0]).toMatchObject({ source: "tavily", url: expect.stringMatching(/^https:\/\/roomfinder\.example\//) });
    expect(res.warning).toBeNull();
  });

  it("a failing search falls back instead of crashing", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const res = await (await competitors(req("competitors", { card: card() }))).json();
    expect(res.patch.competitorSearch.mode).toBe("none");
    expect(res.warning).toMatch(/Live search failed: Tavily search failed \(HTTP 500\)/);
  });

  it("directions keep the builder's own and the chosen one, and drop untraceable citations", async () => {
    const c = card();
    c.directions = [{ id: "own", title: "Mine", oneLiner: "x", rationale: "y", citations: [], custom: true }];
    c.chosenDirectionId = "own";
    const { patch } = await (await directions(req("directions", { card: c }))).json();
    expect(patch.directions).toHaveLength(3);
    expect(patch.directions[0].id).toBe("own");
    expect(patch.chosenDirectionId).toBe("own");
    expect(patch.directions[1].citations).toEqual(["Target User"]);
  });

  it("derives three searches from the card", () => {
    const q = competitorQueries(card());
    expect(q[2]).toBe("Book a free study room in two taps app");
    expect(q[1]).toMatch(/^alternatives to apps that /);
  });
});

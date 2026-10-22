import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/stage/interrogate/route";
import { interrogatePrompt } from "@/lib/prompts/interrogate";
import { newIdeaCard, type IdeaCard } from "@/lib/schema/ideaCard";
import { resetRateLimit } from "@/lib/server/rateLimit";

process.env.LLM_PROVIDER = "mock";

const answered = (): IdeaCard => ({
  ...newIdeaCard("Students waste time finding free study rooms."),
  answers: [
    "Students book a free study room in two taps.",
    "Undergraduates in exam weeks; today they walk floor to floor.",
    "The library installed room sensors this term.",
    "Solo, 2 days, $0, I know React and TypeScript, avoid native mobile.",
    "Not a calendar, no payments",
  ],
});

const post = (body: unknown, ip = "1.1.1.1") =>
  POST(new NextRequest("http://localhost/api/stage/interrogate", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": ip } }));

describe("Stage 1 — Interrogator", () => {
  beforeEach(() => resetRateLimit());

  it("fills the card from the answers", async () => {
    const res = await post({ card: answered() });
    expect(res.status).toBe(200);
    const { patch, provider } = await res.json();
    expect(provider).toBe("mock");
    expect(patch.coreAction.value).toBe("Students book a free study room in two taps.");
    expect(patch.constraints).toMatchObject({ teamSize: 1, deadlineDays: 2, budgetUSD: 0, skills: ["React", "TypeScript"], mustAvoid: ["native mobile"] });
    expect(patch.outOfScope.value).toEqual(["Not a calendar", "no payments"]);
  });

  it("never returns a locked field, and tells the model it is fixed", async () => {
    const card = answered();
    card.coreAction = { value: "Find and hold a room for 15 minutes", locked: true };
    const { system, user } = interrogatePrompt(card);
    expect(system).toMatch(/JSON/);
    expect(user).toContain('- coreAction: "Find and hold a room for 15 minutes"');
    const { patch } = await (await post({ card })).json();
    expect(patch.coreAction).toBeUndefined();
    expect(patch.problem).toBeDefined();
  });

  it("regenerates only the requested field", async () => {
    const { patch } = await (await post({ card: answered(), fields: ["whyNow"] })).json();
    expect(Object.keys(patch)).toEqual(["whyNow"]);
  });

  it("rejects a malformed card with 400 and rate-limits per IP", async () => {
    expect((await post({ card: { id: 1 } })).status).toBe(400);
    for (let i = 0; i < 30; i++) await post({ card: { id: 1 } }, "9.9.9.9");
    const limited = await post({ card: answered() }, "9.9.9.9");
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toMatch(/Rate limit/);
  });
});

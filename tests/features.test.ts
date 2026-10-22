import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as verify } from "@/app/api/stage/verify/route";
import { decisionsMarkdown, logChanges } from "@/lib/log";
import { acceptanceItems } from "@/lib/prompts/compile";
import { fixPrompt } from "@/lib/prompts/fix";
import { exampleIdea } from "@/lib/seed/exampleIdea";
import { readReview, readSharedCard, reviewLink, shareLink, slimForShare, unpack } from "@/lib/share";
import { planFingerprint } from "@/lib/signoff";
import type { BuildCheck, IdeaCard, Review } from "@/lib/schema/ideaCard";
import { resetRateLimit } from "@/lib/server/rateLimit";
import { councilVerdict } from "@/lib/verdict";
import { buildVerified, mergeModel, parseReport, summarize } from "@/lib/verify";

process.env.LLM_PROVIDER = "mock";

const NOW = "2026-10-22T00:00:00.000Z";
const seed = () => exampleIdea(NOW);
const withPrompt = (c: IdeaCard): IdeaCard => ({ ...c, prompt: { target: "claude-code", markdown: "# Build prompt\n\nIntro.\n\n## Project\n\nx", version: 1 } });
const req = (body: unknown) => new NextRequest("http://localhost/api/stage/verify", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("Council verdict", () => {
  it("the example is approval-ready: the chosen direction answers the rejecting critic", () => {
    const v = councilVerdict(seed())!;
    expect(v.status).toBe("ready");
    expect(v.critics.find((c) => c.persona === "user")).toMatchObject({ verdict: "reject", answered: true, backs: true });
    expect(v.summary).toMatch(/^Approval-ready: 3 of 3/);
  });
  it("without a chosen direction, a reject blocks; low solidity keeps it conditional", () => {
    const c = { ...seed(), chosenDirectionId: null };
    expect(councilVerdict(c)!.status).toBe("blocked");
    expect(councilVerdict(c)!.summary).toContain("blocked by the Target User");
    const weak = { ...c, council: { ...c.council!, user: { ...c.council!.user, verdict: "conditional" as const, solidity: 1 }, engineer: { ...c.council!.engineer, solidity: 1 } } };
    expect(councilVerdict(weak)!.status).toBe("conditional");
    expect(councilVerdict({ ...c, council: null })).toBeNull();
  });
});

describe("Verify: reading a build report", () => {
  const items = acceptanceItems(seed());
  it("reads AC ids with PASS/FAIL words and runner symbols; the last mention wins; unnamed stay unknown", () => {
    const r = parseReport(["AC-01 PASS", "✘ 2 tests/acceptance.spec.ts › acceptance › AC-02 Screen (1.2s)", "ac 3 fail - 500 error", "AC-03 passed after fix", "random line"].join("\n"), items);
    expect(r.map((x) => x.status).slice(0, 4)).toEqual(["pass", "fail", "pass", "unknown"]);
    expect(r[1].evidence).toContain("AC-02");
    expect(r[0].by).toBe("rules");
  });
  it("model answers fill only unknowns, and only with a quote that is really in the report", () => {
    const report = "GET /api/rooms works fine";
    const rules = parseReport(report, items);
    const merged = mergeModel(rules, [
      { id: rules[0].acId, status: "pass", evidence: "GET /api/rooms works fine" },
      { id: rules[1].acId, status: "fail", evidence: "this line was invented" },
    ], report);
    expect(merged[0]).toMatchObject({ status: "pass", by: "model" });
    expect(merged[1].status).toBe("unknown");
  });
  beforeEach(() => resetRateLimit());
  it("the route uses rules first and the (mock) model for the rest", async () => {
    const card = withPrompt(seed());
    const it0 = acceptanceItems(card);
    const endpoint = it0.find((a) => a.endpoint)!;
    const report = `${it0[0].id} PASS\n${endpoint.endpoint!.method} ${endpoint.endpoint!.path} works and returns rooms`;
    const res = await verify(req({ card, report }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ status: "pass", by: "rules" });
    expect(body.results.find((r: { acId: string }) => r.acId === endpoint.id)).toMatchObject({ status: "pass", by: "model" });
    expect(body.provider).toBe("mock");
  });
  it("needs no model when every criterion is named", async () => {
    const card = withPrompt(seed());
    const report = acceptanceItems(card).map((a) => `${a.id} PASS`).join("\n");
    const body = await (await verify(req({ card, report }))).json();
    expect(body.provider).toBe("rules");
    expect(summarize(body.results)).toMatchObject({ pass: body.results.length, fail: 0 });
  });
});

describe("Fix prompt and build verified", () => {
  it("leads with the failures, lists unconfirmed ones, and adds a change list", () => {
    const card = withPrompt(seed());
    const results = parseReport("AC-01 FAIL — button does nothing\nAC-02 PASS", acceptanceItems(card));
    const check: BuildCheck = { id: "c1", at: NOW, promptVersion: 1, report: "", results };
    const { markdown } = fixPrompt(card, "claude-code", card.prompt!.markdown, 1, check);
    const fixAt = markdown.indexOf("## Fix these first");
    expect(fixAt).toBeGreaterThan(0);
    expect(fixAt).toBeLessThan(markdown.indexOf("## Project"));
    expect(markdown).toContain("**AC-01**");
    expect(markdown).toContain("Report said: `AC-01 FAIL — button does nothing`");
    expect(markdown).toContain("Already passing, keep them green: AC-02.");
    expect(markdown).toContain("## Changes since v1");
    expect(buildVerified({ ...card, buildChecks: [check] })).toBe(false);
    const allPass = { ...check, results: results.map((r) => ({ ...r, status: "pass" as const })) };
    expect(buildVerified({ ...card, buildChecks: [allPass] })).toBe(true);
    expect(buildVerified({ ...card, prompt: { ...card.prompt!, version: 2 }, buildChecks: [allPass] })).toBe(false);
  });
});

describe("Decision log", () => {
  it("records decisions, not text edits", () => {
    const a = seed();
    expect(logChanges(a, { ...a, problem: { ...a.problem, value: "edited" } })).toEqual([]);
    const b = { ...a, targetUser: { ...a.targetUser, locked: true }, chosenDirectionId: "dir-crowd", prompt: { target: "cursor" as const, markdown: "x", version: 1 } };
    const texts = logChanges(a, b).map((e) => e.text);
    expect(texts).toContain("Locked Target user");
    expect(texts).toContain("Picked direction: Crowd-confirmed rooms");
    expect(texts).toContain("Compiled prompt v1 for Cursor");
  });
  it("the example comes with its own log, and DECISIONS.md lists it", () => {
    const c = seed();
    expect(c.log.map((e) => e.text)).toEqual(expect.arrayContaining(["Locked Core action", "Picked direction: Walk-up hold", "Chose stack: Next.js + SQLite"]));
    expect(decisionsMarkdown(c)).toContain("| lock | Locked Core action |");
  });
});

describe("Share for review", () => {
  it("round-trips the card through the link fragment, keeping only the chosen preview", async () => {
    const c = seed();
    const link = await shareLink("https://tm.example", c);
    expect(link).toMatch(/^https:\/\/tm\.example\/review#card=v1\./);
    const back = await readSharedCard(new URL(link).hash);
    expect(back).toEqual(slimForShare(c));
    expect(back.directions.filter((d) => d.previewHtml)).toHaveLength(1);
  });
  it("round-trips a review and rejects damaged or foreign data", async () => {
    const c = seed();
    const review: Review = { id: "r1", at: NOW, reviewer: "Mentor", verdict: "changes", decisions: [{ question: "q", answer: "a", stance: "question", comment: "why?" }], note: "", planFingerprint: planFingerprint(c) };
    const link = await reviewLink("https://tm.example", c.id, review);
    expect(await readReview(new URL(link).hash)).toEqual(review);
    expect(await readReview("#nothing")).toBeNull();
    await expect(readReview(`#review=${new URL(link).hash.slice(8, -10)}`)).rejects.toThrow(/damaged|not valid/);
    await expect(unpack("x.abc")).rejects.toThrow(/not a TeamMate share link/);
    await expect(readSharedCard(`#card=${new URL(link).hash.slice(8)}`)).rejects.toThrow(/not valid/);
  });
});

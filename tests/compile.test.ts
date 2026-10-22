import { describe, expect, it } from "vitest";
import { bundleFiles } from "@/lib/export/bundle";
import { acceptanceCriteria, compilePrompt, envVarFor, workOrder } from "@/lib/prompts/compile";
import { sanitizePreview } from "@/lib/preview/sanitize";
import { emptyArchitecture, newIdeaCard, PROMPT_TARGETS, type IdeaCard } from "@/lib/schema/ideaCard";

function fullCard(): IdeaCard {
  const c = newIdeaCard("Study rooms", "2026-10-22T00:00:00.000Z");
  c.problem = { value: "Students waste 20 minutes finding a room", locked: true };
  c.targetUser = { value: "Undergraduates in exam weeks", locked: false };
  c.coreAction = { value: "Book a free study room in two taps", locked: true };
  c.whyNow = { value: "Sensors were installed", locked: false };
  c.outOfScope = { value: ["Payments", "A calendar"], locked: false };
  c.constraints = { teamSize: 1, deadlineDays: 2, budgetUSD: 0, skills: ["React"], mustUse: [], mustAvoid: ["native mobile"] };
  const preview = sanitizePreview(`<section data-screen="home" data-title="Home"></section><section data-screen="pick" data-title="Pick a time"></section><section data-screen="done" data-title="Booked"></section>`).html;
  c.directions = [{ id: "d1", title: "Narrow to one moment", oneLiner: "Open a link, book, done.", rationale: "Answers the Target User.", citations: [], previewHtml: preview }];
  c.chosenDirectionId = "d1";
  const a = emptyArchitecture([{ id: "s1", name: "Next.js + SQLite", stack: ["Next.js 15", "SQLite", "Vercel"], scores: { speed: 5, fit: 4, skills: 5, cost: 5, hackathon: 5 }, why: "One deploy", whyNot: "Polling" }]);
  a.chosenId = "s1";
  a.diagramMermaid = { value: "flowchart LR\n A-->B", locked: false };
  a.dataModel = { value: [{ name: "Booking", fields: [{ name: "id", type: "uuid", note: "" }], relations: [] }], locked: false };
  a.apiSurface = { value: [{ method: "GET", path: "/api/rooms", request: "", response: "Room[]", note: "" }, { method: "POST", path: "/api/bookings", request: "{roomId}", response: "Booking", note: "409 on overlap" }], locked: false };
  a.services = { value: [{ name: "Turso DB", reason: "Hosted SQLite", freeTier: "Yes" }], locked: false };
  a.deployment = { value: { target: "Vercel", estCostPerMonth: 0, estHoursToFirstDeploy: 1 }, locked: false };
  a.risks = { value: [{ risk: "Double booking", likelihood: "medium", mitigation: "Transaction" }], locked: false };
  c.architecture = a;
  return c;
}

const headings = (md: string) => [...md.matchAll(/^## (.*)$/gm)].map((m) => m[1]);

describe("Prompt compiler", () => {
  it("has the fixed sections in order (generic)", () => {
    expect(headings(compilePrompt(fullCard(), "generic"))).toEqual([
      "Project", "Problem & User", "Core Action", "Chosen Direction", "Out of Scope", "Stack", "Data Model", "API Surface", "Screens",
      "Services & Env Vars", "Deployment", "Acceptance Criteria", "Work Order", "Risks to Watch",
    ]);
  });

  it("is deterministic and copies locked values verbatim", () => {
    const card = fullCard();
    const md = compilePrompt(card, "generic");
    expect(compilePrompt(card, "generic")).toBe(md);
    expect(md).toContain("Students waste 20 minutes finding a room");
    expect(md).toContain("## Core Action\n\nBook a free study room in two taps");
  });

  it("targets reshape headings and tone, not content", () => {
    const card = fullCard();
    const strip = (md: string) => md.replace(/\n## CLAUDE\.md[\s\S]*$/, "").replace(/^#.*$/gm, "").split("\n\n").slice(2).join("\n\n").trim();
    const generic = strip(compilePrompt(card, "generic"));
    for (const t of PROMPT_TARGETS) expect(strip(compilePrompt(card, t))).toBe(generic);
    expect(headings(compilePrompt(card, "lovable"))[0]).toBe("What we're building");
    expect(headings(compilePrompt(card, "cursor"))).toContain("Never Implement");
  });

  it("claude-code adds a CLAUDE.md block and step-by-step verification", () => {
    const md = compilePrompt(fullCard(), "claude-code");
    expect(md).toMatch(/Work step by step through the Work Order\. After each step, run the build and tests, verify/);
    expect(md).toContain("## CLAUDE.md");
    expect(md).toContain("```markdown\n# CLAUDE.md — Narrow to one moment");
    expect(compilePrompt(fullCard(), "generic")).not.toContain("CLAUDE.md");
  });

  it("has one acceptance criterion per screen plus one per endpoint, and an ordered work order", () => {
    const card = fullCard();
    const ac = acceptanceCriteria(card);
    expect(ac).toHaveLength(3 + 2);
    expect(ac[0]).toMatch(/^Screen "Home"/);
    expect(ac[4]).toMatch(/^`POST \/api\/bookings` returns Booking \(409 on overlap\)/);
    const wo = workOrder(card);
    expect(wo[0]).toMatch(/^Scaffold the project with Next.js 15, SQLite, Vercel/);
    expect(wo.at(-1)).toMatch(/^Deploy to Vercel/);
    expect(compilePrompt(card, "generic")).toContain("```sql\ncreate table booking");
  });

  it("names env vars for services and degrades gracefully on an empty card", () => {
    expect(envVarFor({ name: "Turso DB", reason: "", freeTier: "" })).toBe("TURSO_DB_API_KEY");
    const md = compilePrompt(newIdeaCard("x"), "generic");
    expect(md).toContain("_No direction chosen._");
    expect(md).toContain("_No stack chosen._");
  });
});

describe("Export bundle", () => {
  it("contains the six files with the right content", () => {
    const card = fullCard();
    card.prompt = { target: "claude-code", markdown: "My edited prompt", version: 1 };
    const files = bundleFiles(card);
    expect(Object.keys(files)).toEqual(["PRD.md", "ARCHITECTURE.md", "PROMPT.md", "preview.html", "CLAUDE.md", "idea-card.json"]);
    expect(files["PROMPT.md"]).toBe("My edited prompt");
    expect(files["preview.html"]).toContain('data-screen="pick"');
    expect(files["ARCHITECTURE.md"]).toContain("```mermaid\nflowchart LR");
    expect(files["PRD.md"]).toContain("## Out of scope\n- Payments\n- A calendar");
    expect(JSON.parse(files["idea-card.json"]).id).toBe(card.id);
  });
});

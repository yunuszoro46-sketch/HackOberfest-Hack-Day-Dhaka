import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/stage/architecture/route";
import { toSql } from "@/lib/architecture/sql";
import { DetailsOutputSchema } from "@/lib/prompts/architecture";
import { newIdeaCard, type IdeaCard } from "@/lib/schema/ideaCard";
import { resetRateLimit } from "@/lib/server/rateLimit";

process.env.LLM_PROVIDER = "mock";

const card = (): IdeaCard => ({
  ...newIdeaCard("Study rooms"),
  coreAction: { value: "Book a free study room in two taps", locked: true },
  directions: [{ id: "d1", title: "Narrow", oneLiner: "x", rationale: "y", citations: [] }],
  chosenDirectionId: "d1",
});
const post = async (body: unknown) => {
  const res = await POST(new NextRequest("http://localhost/api/stage/architecture", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  return { status: res.status, body: await res.json() };
};

describe("Stage 4 — Architecture", () => {
  beforeEach(() => resetRateLimit());

  it("scores three candidates and puts the recommended (highest total) first", async () => {
    const { body } = await post({ card: card(), part: "candidates" });
    const names = body.patch.architecture.candidates.map((c: { name: string }) => c.name);
    expect(names).toEqual(["Next.js + SQLite", "Supabase + Vue", "Express API + React SPA"]);
    expect(body.patch.architecture.chosenId).toBeNull();
  });

  it("designs every block for the chosen stack, but never overwrites a locked block", async () => {
    const c = card();
    c.architecture = (await post({ card: c, part: "candidates" })).body.patch.architecture;
    c.architecture!.chosenId = c.architecture!.candidates[0].id;
    c.architecture!.risks = { value: [{ risk: "My own risk", likelihood: "low", mitigation: "Mine" }], locked: true };
    const { body } = await post({ card: c, part: "details" });
    const a = body.patch.architecture;
    expect(a.diagramMermaid.value).toMatch(/^flowchart LR/);
    expect(a.dataModel.value.map((e: { name: string }) => e.name)).toEqual(["Room", "Booking"]);
    expect(a.apiSurface.value).toHaveLength(3);
    expect(a.deployment.value).toEqual({ target: "Vercel", estCostPerMonth: 0, estHoursToFirstDeploy: 1 });
    expect(a.risks).toEqual({ value: [{ risk: "My own risk", likelihood: "low", mitigation: "Mine" }], locked: true });
  });

  it("regenerates a single block on request", async () => {
    const c = card();
    c.architecture = (await post({ card: c, part: "candidates" })).body.patch.architecture;
    c.architecture!.chosenId = c.architecture!.candidates[0].id;
    const { body } = await post({ card: c, part: "details", blocks: ["services"] });
    expect(body.patch.architecture.services.value[0].name).toBe("Turso");
    expect(body.patch.architecture.dataModel.value).toEqual([]);
  });

  it("refuses details before a stack is chosen, and candidates before a direction", async () => {
    const c = card();
    expect((await post({ card: c, part: "details" })).status).toBe(400);
    expect((await post({ card: { ...c, chosenDirectionId: null }, part: "candidates" })).status).toBe(400);
  });

  it("normalises model quirks: fenced mermaid, lowercase methods, capitalised likelihoods", () => {
    const parsed = DetailsOutputSchema.parse({
      diagramMermaid: "```mermaid\nflowchart TD\n A-->B\n```",
      dataModel: [{ name: "A", fields: [{ name: "id", type: "uuid" }] }],
      apiSurface: [{ method: "get", path: "/a" }],
      services: [],
      deployment: { target: "Vercel", estCostPerMonth: "0", estHoursToFirstDeploy: "2" },
      risks: [{ risk: "r", likelihood: "High", mitigation: "m" }, { risk: "r2", likelihood: "low", mitigation: "m" }, { risk: "r3", likelihood: "MEDIUM", mitigation: "m" }],
    });
    expect(parsed.diagramMermaid).toBe("flowchart TD\n A-->B");
    expect(parsed.apiSurface[0].method).toBe("GET");
    expect(parsed.risks.map((r) => r.likelihood)).toEqual(["high", "low", "medium"]);
    expect(() => DetailsOutputSchema.parse({ ...parsed, diagramMermaid: "sequenceDiagram\nA->>B: hi" })).toThrow(/flowchart/);
  });
});

describe("SQL from the data model", () => {
  it("maps types, snake_cases names, makes id the primary key and adds foreign keys from relations", () => {
    const sql = toSql([
      { name: "Room", fields: [{ name: "id", type: "uuid", note: "" }, { name: "capacity", type: "int", note: "seats" }], relations: [] },
      { name: "Booking", fields: [{ name: "id", type: "uuid", note: "" }, { name: "roomId", type: "uuid", note: "" }, { name: "startsAt", type: "timestamp", note: "" }], relations: ["Booking.roomId -> Room.id", "Ghost.x -> Nope.id"] },
    ]);
    expect(sql).toBe(`create table room (
  id uuid primary key,
  capacity integer -- seats
);

create table booking (
  id uuid primary key,
  room_id uuid,
  starts_at timestamptz,
  foreign key (room_id) references room (id)
);`);
  });
});

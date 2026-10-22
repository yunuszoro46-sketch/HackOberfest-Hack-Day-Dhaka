import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { generate } from "@/lib/llm/adapter";
import { MockProvider, registerMock } from "@/lib/llm/mock";
import { createGemma } from "@/lib/llm/gemma";
import { runStage } from "@/lib/server/stage";
import { resetRateLimit } from "@/lib/server/rateLimit";

const req = () => new NextRequest("http://localhost/api/stage/x", { method: "POST", body: JSON.stringify({ n: 1 }), headers: { "content-type": "application/json" } });

describe("error path", () => {
  it("a model that keeps replying garbage becomes a 422 with the raw text for the UI", async () => {
    resetRateLimit();
    let calls = 0;
    registerMock("broken", () => `Sorry, I can't do JSON today (attempt ${++calls})`);
    const res = await runStage(req(), z.object({ n: z.number() }), () =>
      generate({ stage: "broken", system: "s", user: "u", schema: z.object({ ok: z.boolean() }), provider: new MockProvider() }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/did not match the expected shape after a retry/);
    expect(body.raw).toBe("Sorry, I can't do JSON today (attempt 2)");
    expect(body.detail).toMatch(/not valid JSON/);
  });

  it("a missing key is a 503 with a clear message, before any network call", async () => {
    resetRateLimit();
    const gemma = createGemma({ GEMINI_API_KEY: "" });
    expect(gemma.configured).toBe(false);
    const res = await runStage(req(), z.object({ n: z.number() }), () =>
      generate({ stage: "x", system: "s", user: "u", schema: z.object({}), provider: gemma }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/GEMINI_API_KEY/);
  });

  it("unexpected exceptions become a 500 with a message, not a crash", async () => {
    resetRateLimit();
    const res = await runStage(req(), z.object({ n: z.number() }), async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Unexpected server error: boom");
  });
});

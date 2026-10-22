import type { NextRequest } from "next/server";
import { z } from "zod";
import { generate } from "@/lib/llm/adapter";
import "@/lib/llm/mockReplies";
import { CandidatesOutputSchema, candidatesPrompt, DETAIL_BLOCKS, detailsPrompt, DetailsOutputSchema } from "@/lib/prompts/architecture";
import { LlmError } from "@/lib/llm/types";
import { emptyArchitecture, IdeaCardSchema, type Architecture, type StackCandidate } from "@/lib/schema/ideaCard";
import { generated, runStage } from "@/lib/server/stage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  card: IdeaCardSchema,
  part: z.enum(["candidates", "details"]),
  /** Regenerate only these detail blocks. */
  blocks: z.array(z.enum(DETAIL_BLOCKS)).optional(),
});

const total = (c: StackCandidate) => Object.values(c.scores).reduce((a, b) => a + b, 0);

/** Stage 4: candidates (scored, recommended first), or the full design for the chosen candidate. */
export async function POST(req: NextRequest) {
  return runStage(req, Body, async ({ card, part, blocks }, signal) => {
    if (!card.chosenDirectionId) throw new LlmError("Pick a direction before choosing an architecture.", 400);

    if (part === "candidates") {
      const { system, user } = candidatesPrompt(card);
      const out = await generate({ stage: "architecture-candidates", system, user, schema: CandidatesOutputSchema, signal, temperature: 0.5 });
      const stamp = Date.now().toString(36);
      const candidates: StackCandidate[] = out.data.candidates
        .map((c, i) => ({ id: `stack-${stamp}-${i + 1}`, ...c }))
        .sort((a, b) => total(b) - total(a));
      // Existing detail blocks (locked ones especially) survive new candidates; the choice is reset.
      const architecture: Architecture = card.architecture ? { ...card.architecture, candidates, chosenId: null } : emptyArchitecture(candidates);
      return { patch: { architecture }, provider: out.provider, model: out.model };
    }

    const a = card.architecture;
    const candidate = a?.candidates.find((c) => c.id === a.chosenId);
    if (!a || !candidate) throw new LlmError("Choose a stack candidate first.", 400);
    const { system, user } = detailsPrompt(card, candidate, blocks);
    const out = await generate({ stage: "architecture-details", system, user, schema: DetailsOutputSchema, signal, temperature: 0.4 });
    const want = new Set(blocks ?? DETAIL_BLOCKS);
    const next: Architecture = { ...a };
    for (const b of DETAIL_BLOCKS) {
      if (!want.has(b) || a[b].locked) continue;
      (next as Record<string, unknown>)[b] = generated(out.data[b]);
    }
    return { patch: { architecture: next }, provider: out.provider, model: out.model };
  });
}

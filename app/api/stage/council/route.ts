import type { NextRequest } from "next/server";
import { z } from "zod";
import { generate } from "@/lib/llm/adapter";
import "@/lib/llm/mockReplies";
import { councilPrompt, CouncilOutputSchema } from "@/lib/prompts/council";
import { IdeaCardSchema } from "@/lib/schema/ideaCard";
import { runStage } from "@/lib/server/stage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Stage 2A: three persona critiques. */
export async function POST(req: NextRequest) {
  return runStage(req, z.object({ card: IdeaCardSchema }), async ({ card }, signal) => {
    const { system, user } = councilPrompt(card);
    const out = await generate({ stage: "council", system, user, schema: CouncilOutputSchema, signal, temperature: 0.6 });
    return { patch: { council: out.data }, provider: out.provider, model: out.model };
  });
}

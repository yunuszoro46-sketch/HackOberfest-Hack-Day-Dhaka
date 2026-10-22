import type { NextRequest } from "next/server";
import { z } from "zod";
import { generate } from "@/lib/llm/adapter";
import "@/lib/llm/mockReplies";
import { INTERROGATE_FIELDS, interrogatePrompt, InterrogateOutputSchema } from "@/lib/prompts/interrogate";
import { IdeaCardSchema, type IdeaCard } from "@/lib/schema/ideaCard";
import { generated, runStage } from "@/lib/server/stage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ card: IdeaCardSchema, fields: z.array(z.enum(INTERROGATE_FIELDS)).optional() });

/** Fills problem, target user, core action, why now, constraints and out-of-scope. Locked fields are never in the patch. */
export async function POST(req: NextRequest) {
  return runStage(req, Body, async ({ card, fields }, signal) => {
    const { system, user } = interrogatePrompt(card, fields);
    const out = await generate({ stage: "interrogate", system, user, schema: InterrogateOutputSchema, signal });
    const want = new Set(fields ?? INTERROGATE_FIELDS);
    const patch: Partial<IdeaCard> = {};
    for (const k of ["problem", "targetUser", "coreAction", "whyNow"] as const) if (want.has(k) && !card[k].locked) patch[k] = generated(out.data[k]);
    if (want.has("outOfScope") && !card.outOfScope.locked) patch.outOfScope = generated(out.data.outOfScope);
    if (want.has("constraints")) patch.constraints = out.data.constraints;
    return { patch, provider: out.provider, model: out.model };
  });
}

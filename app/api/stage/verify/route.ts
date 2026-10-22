import type { NextRequest } from "next/server";
import { z } from "zod";
import { generate } from "@/lib/llm/adapter";
import "@/lib/llm/mockReplies";
import { LlmError } from "@/lib/llm/types";
import { verifyPrompt, VerifyOutputSchema } from "@/lib/prompts/verify";
import { IdeaCardSchema } from "@/lib/schema/ideaCard";
import { runStage } from "@/lib/server/stage";
import { checkItems, mergeModel, parseReport } from "@/lib/verify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Stage 6: judge a build report. Lines naming an AC id decide first; the model is asked only about the rest. If the
 * model is unavailable, the rule results come back with a warning instead of an error.
 */
export async function POST(req: NextRequest) {
  return runStage(req, z.object({ card: IdeaCardSchema, report: z.string().trim().min(1).max(20_000) }), async ({ card, report }, signal) => {
    const rules = parseReport(report, checkItems(card));
    const unknown = rules.filter((r) => r.status === "unknown");
    if (!unknown.length) return { results: rules, provider: "rules", model: null, warning: null };
    try {
      const { system, user } = verifyPrompt(unknown, report);
      const out = await generate({ stage: "verify", system, user, schema: VerifyOutputSchema, signal, temperature: 0 });
      return { results: mergeModel(rules, out.data.results, report), provider: out.provider, model: out.model, warning: null };
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      return { results: rules, provider: "rules", model: null, warning: `The model could not be asked (${err.message}). Criteria the report never names by id stay unknown; set them by hand.` };
    }
  });
}

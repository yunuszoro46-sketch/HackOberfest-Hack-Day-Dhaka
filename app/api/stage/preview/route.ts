import type { NextRequest } from "next/server";
import { z } from "zod";
import { generateHtml } from "@/lib/llm/adapter";
import "@/lib/llm/mockReplies";
import { archetypeById } from "@/lib/archetypes";
import { previewPrompt } from "@/lib/prompts/preview";
import { previewProblem, sanitizePreview } from "@/lib/preview/sanitize";
import { IdeaCardSchema } from "@/lib/schema/ideaCard";
import { LlmError } from "@/lib/llm/types";
import { runStage } from "@/lib/server/stage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  card: IdeaCardSchema,
  /** Defaults to the chosen direction; another id previews it for side-by-side comparison. */
  directionId: z.string().optional(),
  /** "Regenerate with note": one line of feedback applied to the previous preview. */
  note: z.string().trim().max(200).optional(),
});

/** Stage 3: a sanitized, self-contained HTML preview of 3-5 screens for one direction. */
export async function POST(req: NextRequest) {
  return runStage(req, Body, async ({ card, directionId, note }, signal) => {
    const id = directionId ?? card.chosenDirectionId;
    const direction = card.directions.find((d) => d.id === id);
    if (!direction) throw new LlmError("Pick a direction before generating a preview.", 400);
    const previousHtml = note && direction.previewHtml ? direction.previewHtml : undefined;
    const { system, user } = previewPrompt(card, direction, { note, previousHtml, archetype: archetypeById(card.archetypeId) });
    const out = await generateHtml({ stage: "preview", system, user, signal, validate: previewProblem, temperature: 0.5 });
    const clean = sanitizePreview(out.html);
    return { directionId: direction.id, previewHtml: clean.html, screens: clean.screens, removed: clean.removed, provider: out.provider, model: out.model };
  });
}

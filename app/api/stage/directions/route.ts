import type { NextRequest } from "next/server";
import { z } from "zod";
import { generate } from "@/lib/llm/adapter";
import "@/lib/llm/mockReplies";
import { directionsPrompt, DirectionsOutputSchema } from "@/lib/prompts/directions";
import { IdeaCardSchema, type Direction } from "@/lib/schema/ideaCard";
import { runStage } from "@/lib/server/stage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PERSONA_NAMES = ["Skeptical Investor", "Target User", "Senior Engineer"];

/** Stage 2C: 2-3 directions. The builder's own directions and the chosen one are kept; citations must point at real inputs. */
export async function POST(req: NextRequest) {
  return runStage(req, z.object({ card: IdeaCardSchema }), async ({ card }, signal) => {
    const kept = card.directions.filter((d) => d.custom || d.id === card.chosenDirectionId);
    const count = Math.max(0, Math.min(3, 3 - kept.length));
    if (count === 0) return { patch: {} };
    const { system, user } = directionsPrompt(card, count, kept);
    const out = await generate({ stage: "directions", system, user, schema: DirectionsOutputSchema, signal, temperature: 0.7 });
    const urls = new Set(card.competitors.map((c) => c.url).filter(Boolean));
    const stamp = Date.now().toString(36);
    const generated: Direction[] = out.data.directions.slice(0, count).map((d, i) => ({
      id: `dir-${stamp}-${i + 1}`,
      title: d.title,
      oneLiner: d.oneLiner,
      rationale: d.rationale,
      // Keep only citations we can trace: a competitor URL we found, or a council persona.
      citations: d.citations.filter((c) => urls.has(c) || PERSONA_NAMES.some((p) => c.toLowerCase().includes(p.toLowerCase()))),
    }));
    const directions = [...kept, ...generated];
    const chosenDirectionId = directions.some((d) => d.id === card.chosenDirectionId) ? card.chosenDirectionId : null;
    return { patch: { directions, chosenDirectionId, compareDirectionId: null }, provider: out.provider, model: out.model };
  });
}

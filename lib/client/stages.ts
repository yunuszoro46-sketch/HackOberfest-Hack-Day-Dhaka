"use client";

// One function per stage: takes the current card, returns the patch to apply. Used by the stage panels and by
// "Regenerate stale", which re-runs every stale stage in order.
import type { InterrogateField } from "../prompts/interrogate";
import type { IdeaCard, StageId } from "../schema/ideaCard";
import { callStage } from "./api";

export type StagePatch = { patch: Partial<IdeaCard>; provider?: string; model?: string };

export const STAGE_STEPS: { id: StageId; label: string }[] = [
  { id: "interrogate", label: "Idea" },
  { id: "council", label: "Council & Directions" },
  { id: "preview", label: "Preview" },
  { id: "architecture", label: "Architecture" },
  { id: "prompt", label: "Prompt" },
];

export const stageLabel = (s: StageId) => STAGE_STEPS.find((x) => x.id === s)!.label;

/** Whether a stage can be opened yet, and if not, why. */
export function stageGate(card: IdeaCard, stage: StageId): string | null {
  switch (stage) {
    case "interrogate":
      return null;
    case "council":
      return card.coreAction.value.trim() ? null : "Answer the five questions first.";
    case "preview":
    case "architecture":
      return card.chosenDirectionId ? null : "Pick a direction in Council & Directions first.";
    case "prompt":
      return card.architecture?.chosenId ? null : "Choose an architecture first.";
  }
}

export const runInterrogate = (card: IdeaCard, fields?: InterrogateField[], signal?: AbortSignal) =>
  callStage<StagePatch>("interrogate", { card, fields }, signal);

/** Runners for "Regenerate stale"; filled in as stages are added. */
export const STALE_RUNNERS: Partial<Record<StageId, (card: IdeaCard) => Promise<Partial<IdeaCard>>>> = {};

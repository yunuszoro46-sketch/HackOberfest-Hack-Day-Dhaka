"use client";

// One function per stage: takes the current card, returns the patch to apply. Used by the stage panels and by
// "Regenerate stale", which re-runs every stale stage in order.
import type { DetailBlock } from "../prompts/architecture";
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

export type CouncilPart = "council" | "competitors" | "directions";
export const COUNCIL_PART_LABEL: Record<CouncilPart, string> = {
  council: "Council: three critics are reading your card",
  competitors: "Competitors: searching the web and summarising",
  directions: "Directions: proposing different product bets",
};

/**
 * Stage 2 runs three calls in order; each sees the card as updated by the previous one. `onPart` reports progress
 * and receives each patch as it lands, so the UI fills in step by step.
 */
export async function runCouncilStage(
  card: IdeaCard,
  onPart: (part: CouncilPart, patch?: Partial<IdeaCard>, warning?: string | null) => void,
  parts: CouncilPart[] = ["council", "competitors", "directions"],
): Promise<Partial<IdeaCard>> {
  let current = card;
  let all: Partial<IdeaCard> = {};
  for (const part of parts) {
    onPart(part);
    const res = await callStage<StagePatch & { warning?: string | null }>(part, { card: current });
    current = { ...current, ...res.patch };
    all = { ...all, ...res.patch };
    onPart(part, res.patch, res.warning);
  }
  return all;
}

export interface PreviewResult {
  directionId: string;
  previewHtml: string;
  screens: { id: string; title: string }[];
  removed: string[];
  provider?: string;
}

export const runPreview = (card: IdeaCard, opts: { directionId?: string; note?: string } = {}) =>
  callStage<PreviewResult>("preview", { card, ...opts });

/** Puts a generated preview on its direction. */
export const withPreview = (card: IdeaCard, r: PreviewResult): IdeaCard => ({
  ...card,
  directions: card.directions.map((d) => (d.id === r.directionId ? { ...d, previewHtml: r.previewHtml } : d)),
});

export const runArchitecture = (card: IdeaCard, part: "candidates" | "details", blocks?: DetailBlock[]) =>
  callStage<StagePatch>("architecture", { card, part, blocks });

/** Runners for "Regenerate stale"; filled in as stages are added. */
export const STALE_RUNNERS: Partial<Record<StageId, (card: IdeaCard) => Promise<Partial<IdeaCard>>>> = {
  council: (card) => runCouncilStage(card, () => {}),
  preview: async (card) => ({ directions: withPreview(card, await runPreview(card)).directions }),
  // With a stack chosen, re-run its design (locked blocks stay); otherwise re-suggest stacks.
  architecture: async (card) => (await runArchitecture(card, card.architecture?.chosenId ? "details" : "candidates")).patch,
};

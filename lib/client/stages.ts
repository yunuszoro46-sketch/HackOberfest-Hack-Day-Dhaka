"use client";

// One function per stage: takes the current card, returns the patch to apply plus who produced it. Used by the
// stage screens and by "Regenerate stale", which re-runs every stale model stage in order.
import type { DetailBlock } from "../prompts/architecture";
import type { InterrogateField } from "../prompts/interrogate";
import type { IdeaCard, Provenance, StageId } from "../schema/ideaCard";
import { callStage } from "./api";
import { applyPatch } from "./patch";

export type StagePatch = { patch: Partial<IdeaCard>; provider?: string; model?: string; warning?: string | null };

export const STAGE_STEPS: { id: StageId; label: string }[] = [
  { id: "interrogate", label: "Idea" },
  { id: "council", label: "Council" },
  { id: "preview", label: "Preview" },
  { id: "architecture", label: "Architecture" },
  { id: "prompt", label: "Prompt" },
  { id: "verify", label: "Verify" },
];

export const stageLabel = (s: StageId) => STAGE_STEPS.find((x) => x.id === s)!.label;

/** Whether a stage can be opened yet, and if not, why. */
export function stageGate(card: IdeaCard, stage: StageId): string | null {
  switch (stage) {
    case "interrogate":
      return null;
    case "council":
      return card.stamps.interrogate !== undefined ? null : "Answer the five questions first.";
    case "preview":
    case "architecture":
      return card.chosenDirectionId ? null : "Pick a direction in the Council stage first.";
    case "prompt":
      return card.architecture?.chosenId ? null : "Choose a stack in Architecture first.";
    case "verify":
      return card.prompt ? null : "Sign off and compile the prompt first.";
  }
}

/** Provenance from a stage reply: a mock, a model, or a search-backed result. */
export function provenanceOf(res: { provider?: string; model?: string }, sources?: number): Provenance {
  const at = new Date().toISOString();
  if (res.provider === "mock") return { kind: "mock", model: res.model, at };
  if (sources !== undefined) return sources > 0 ? { kind: "search", model: res.model, sources, at } : { kind: "rules", model: res.model, at };
  return { kind: "model", model: res.model, at };
}

/** Applies a stage patch and records who produced the block, against the latest card. */
export const applyStage = (c: IdeaCard, patch: Partial<IdeaCard>, block: string, prov: Provenance): IdeaCard => ({
  ...applyPatch(c, patch),
  provenance: { ...c.provenance, [block]: prov },
});

export const runInterrogate = (card: IdeaCard, fields?: InterrogateField[], signal?: AbortSignal) =>
  callStage<StagePatch>("interrogate", { card, fields }, signal);

export type CouncilPart = "council" | "competitors" | "directions";
export const COUNCIL_PART_LABEL: Record<CouncilPart, string> = {
  council: "Council · three critics reading the card",
  competitors: "Council · searching for competitors",
  directions: "Council · proposing directions",
};

/** Provenance for a competitor-search reply: source-verified when live search found anything, else rules. */
export const competitorProvenance = (res: StagePatch) => {
  const comps = res.patch.competitors ?? [];
  const live = comps.filter((c) => c.source === "tavily" || c.source === "google-search").length;
  return res.provider === "mock" ? provenanceOf(res) : provenanceOf(res, live);
};

/**
 * Stage 2 runs three calls in order; each sees the card as updated by the previous one. `onPart` reports progress
 * and receives each reply as it lands, so the screen fills in step by step.
 */
export async function runCouncilStage(
  card: IdeaCard,
  onPart: (part: CouncilPart, res?: StagePatch) => void,
  parts: CouncilPart[] = ["council", "competitors", "directions"],
): Promise<IdeaCard> {
  let current = card;
  for (const part of parts) {
    onPart(part);
    const res = await callStage<StagePatch>(part, { card: current });
    current = applyStage(current, res.patch, part, part === "competitors" ? competitorProvenance(res) : provenanceOf(res));
    onPart(part, res);
  }
  return current;
}

export interface PreviewResult {
  directionId: string;
  previewHtml: string;
  screens: { id: string; title: string }[];
  removed: string[];
  provider?: string;
  model?: string;
}

export const runPreview = (card: IdeaCard, opts: { directionId?: string; note?: string } = {}) =>
  callStage<PreviewResult>("preview", { card, ...opts });

/** Puts a generated preview on its direction and records its provenance. */
export const withPreview = (card: IdeaCard, r: PreviewResult): IdeaCard => ({
  ...card,
  directions: card.directions.map((d) => (d.id === r.directionId ? { ...d, previewHtml: r.previewHtml } : d)),
  provenance: { ...card.provenance, [`preview:${r.directionId}`]: provenanceOf(r) },
});

export const runArchitecture = (card: IdeaCard, part: "candidates" | "details", blocks?: DetailBlock[]) =>
  callStage<StagePatch>("architecture", { card, part, blocks });

/** Model stages "Regenerate stale" can re-run. The prompt is not here: it is only compiled after a human sign-off. */
export const STALE_RUNNERS: Partial<Record<StageId, (card: IdeaCard) => Promise<IdeaCard>>> = {
  council: (card) => runCouncilStage(card, () => {}),
  preview: async (card) => withPreview(card, await runPreview(card)),
  // With a stack chosen, re-run its design (locked blocks stay); otherwise re-suggest stacks.
  architecture: async (card) => {
    const part = card.architecture?.chosenId ? "details" : "candidates";
    const res = await runArchitecture(card, part);
    return applyStage(card, res.patch, part === "details" ? "architecture-details" : "architecture", provenanceOf(res));
  },
};

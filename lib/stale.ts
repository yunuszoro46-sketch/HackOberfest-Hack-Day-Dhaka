// Staleness without propagation bugs: each stage stores a fingerprint of the upstream inputs it ran on.
// Editing an upstream field changes the fingerprint, so every downstream stage reports stale automatically.
import { outOfScopeOf } from "./prompts/common";
import { chosenDirection, type IdeaCard, type StageId } from "./schema/ideaCard";

/** The upstream inputs each stage depends on. Only values, never lock flags or timestamps. */
export function upstreamOf(card: IdeaCard, stage: StageId): unknown {
  const brief = {
    problem: card.problem.value,
    targetUser: card.targetUser.value,
    coreAction: card.coreAction.value,
    whyNow: card.whyNow.value,
    constraints: card.constraints,
    outOfScope: outOfScopeOf(card),
  };
  const dir = chosenDirection(card);
  const direction = dir ? { id: dir.id, title: dir.title, oneLiner: dir.oneLiner, rationale: dir.rationale } : null;
  switch (stage) {
    case "interrogate":
      return { raw: card.raw, answers: card.answers };
    case "council":
      return brief;
    case "preview":
      return { brief, direction, archetypeId: card.archetypeId };
    case "architecture":
      return { brief, direction };
    case "prompt": {
      const { prompt: _prompt, stamps: _stamps, readiness: _readiness, updatedAt: _u, version: _v, signoff: _s, compareDirectionId: _c, ...rest } = card;
      return rest;
    }
  }
}

/** Small, stable string hash (FNV-1a) — enough to detect change, not for security. */
export function fingerprint(value: unknown): string {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Records that `stage` just ran on the card's current inputs. */
export function stamp(card: IdeaCard, stage: StageId): IdeaCard {
  return { ...card, stamps: { ...card.stamps, [stage]: fingerprint(upstreamOf(card, stage)) } };
}

export function isStale(card: IdeaCard, stage: StageId): boolean {
  const s = card.stamps[stage];
  return s !== undefined && s !== fingerprint(upstreamOf(card, stage));
}

export function staleStages(card: IdeaCard): StageId[] {
  return (["council", "preview", "architecture", "prompt"] as const).filter((s) => isStale(card, s));
}

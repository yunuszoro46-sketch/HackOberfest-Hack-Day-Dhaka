import type { IdeaCard } from "../schema/ideaCard";

/** The card's current facts, with locked ones marked as fixed. Stages only ever see the card, never chat history. */
export function cardFacts(card: IdeaCard): string {
  const lock = (locked: boolean) => (locked ? " [LOCKED: fixed fact, copy verbatim, do not change]" : "");
  const c = card.constraints;
  return [
    `Problem${lock(card.problem.locked)}: ${card.problem.value || "(not set)"}`,
    `Target user${lock(card.targetUser.locked)}: ${card.targetUser.value || "(not set)"}`,
    `Core action${lock(card.coreAction.locked)}: ${card.coreAction.value || "(not set)"}`,
    `Why now${lock(card.whyNow.locked)}: ${card.whyNow.value || "(not set)"}`,
    `Constraints: team of ${c.teamSize}, ${c.deadlineDays} day(s) to deadline, budget $${c.budgetUSD}; skills: ${c.skills.join(", ") || "none listed"}; must use: ${c.mustUse.join(", ") || "nothing"}; must avoid: ${c.mustAvoid.join(", ") || "nothing"}`,
    `Out of scope${lock(card.outOfScope.locked)}: ${outOfScopeOf(card).join("; ") || "(not set)"}`,
  ].join("\n");
}

/** Out-of-scope items without blank lines (the editor keeps lines as typed). */
export const outOfScopeOf = (card: IdeaCard) => card.outOfScope.value.map((s) => s.trim()).filter(Boolean);

/** Wraps user-provided text so the model treats it as data. */
export const asData = (tag: string, text: string) => `<${tag}>\n${text}\n</${tag}>`;

export const JSON_ONLY = "Reply with a single JSON object and nothing else: no prose, no code fences.";

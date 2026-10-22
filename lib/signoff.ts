// The Human Sign-Off Checkpoint between Architecture and Prompt. The prompt is only compiled after the leader signs
// the three consequential decisions; editing the plan afterwards voids the signature.
import { chosenDirection, type IdeaCard } from "./schema/ideaCard";
import { outOfScopeOf } from "./prompts/common";
import { fingerprint, upstreamOf } from "./stale";

export interface SignoffDecision {
  question: string;
  answer: string;
}

export function signoffDecisions(card: IdeaCard): SignoffDecision[] {
  const dir = chosenDirection(card);
  const stack = card.architecture?.candidates.find((c) => c.id === card.architecture?.chosenId);
  return [
    { question: "Which product bet are we building?", answer: dir ? `${dir.title} — ${dir.oneLiner}` : "No direction chosen" },
    { question: "Which stack builds it?", answer: stack ? `${stack.name} (${stack.stack.join(", ")})` : "No stack chosen" },
    { question: "What will it not do?", answer: outOfScopeOf(card).length ? outOfScopeOf(card).join("; ") : "Nothing listed as out of scope" },
  ];
}

export const planFingerprint = (card: IdeaCard) => fingerprint(upstreamOf(card, "prompt"));

/** Signed, and nothing in the plan changed since. */
export const isSigned = (card: IdeaCard) => !!card.signoff && card.signoff.fingerprint === planFingerprint(card);

export const sign = (card: IdeaCard, now = new Date().toISOString()): IdeaCard => ({ ...card, signoff: { signedAt: now, fingerprint: planFingerprint(card) } });

/** Ready to be signed: a direction and a stack exist. */
export const canSign = (card: IdeaCard) => !!card.chosenDirectionId && !!card.architecture?.chosenId;

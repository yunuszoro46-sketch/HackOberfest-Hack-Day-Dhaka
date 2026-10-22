// The council's overall verdict, computed from the three critics (never asked of a model). A direction that cites a
// critic answers that critic's objection, which turns their verdict into an approval.
import { chosenDirection, PERSONAS, type IdeaCard, type Persona, type Verdict } from "./schema/ideaCard";
import { PERSONA_BRIEFS } from "./prompts/council";

export interface CriticStatus {
  persona: Persona;
  title: string;
  verdict: Verdict;
  solidity: number;
  /** The chosen direction cites this critic, so it answers their objection. */
  answered: boolean;
  /** Counts as backing the idea: approved, or answered by the chosen direction. */
  backs: boolean;
}

export interface CouncilVerdict {
  status: "ready" | "conditional" | "blocked";
  critics: CriticStatus[];
  approvals: number;
  /** Average solidity, one decimal. */
  solidity: number;
  blockers: CriticStatus[];
  /** One line for the screen and the sign-off. */
  summary: string;
}

const cites = (citations: string[], persona: Persona) => {
  const title = PERSONA_BRIEFS[persona].title.toLowerCase();
  return citations.some((c) => {
    const x = c.toLowerCase();
    return x.includes(title) || x === persona;
  });
};

export function councilVerdict(card: IdeaCard): CouncilVerdict | null {
  if (!card.council) return null;
  const dir = chosenDirection(card);
  const critics = PERSONAS.map((p): CriticStatus => {
    const c = card.council![p];
    const answered = !!dir && cites(dir.citations, p);
    return { persona: p, title: PERSONA_BRIEFS[p].title, verdict: c.verdict, solidity: c.solidity, answered, backs: c.verdict === "approve" || answered };
  });
  const approvals = critics.filter((c) => c.backs).length;
  const solidity = Math.round((critics.reduce((s, c) => s + c.solidity, 0) / critics.length) * 10) / 10;
  const blockers = critics.filter((c) => c.verdict === "reject" && !c.answered);
  const open = critics.filter((c) => !c.backs && c.verdict === "conditional");
  const names = (l: CriticStatus[]) => l.map((c) => c.title).join(" and ");
  let status: CouncilVerdict["status"];
  let summary: string;
  if (blockers.length) {
    status = "blocked";
    summary = `Not approval-ready: blocked by the ${names(blockers)}. Pick or write a direction that answers ${blockers.length > 1 ? "their objections" : "that objection"}.`;
  } else if (approvals >= 2 && solidity >= 3) {
    status = "ready";
    summary = `Approval-ready: ${approvals} of 3 critics back it, solidity ${solidity}/5.${open.length ? ` Open condition: ${names(open)}.` : ""}`;
  } else {
    status = "conditional";
    summary = `Not yet: ${approvals} of 3 critics back it, solidity ${solidity}/5.${open.length ? ` Answer the ${names(open)}.` : " Raise solidity to 3 or more."}`;
  }
  return { status, critics, approvals, solidity, blockers, summary };
}

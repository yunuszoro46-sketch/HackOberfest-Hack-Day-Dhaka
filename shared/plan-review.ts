// Plan review council: a few agents try to break a hackathon plan, list pros and cons, score how solid it is and
// say whether it is ready for the human to approve. Shared between the server and the planning workspace.
import type { IdeaInput } from './idea-report';

export const REVIEW_AGENT_IDS = ['breaker', 'skeptic', 'builder', 'user'] as const;
export type ReviewAgentId = (typeof REVIEW_AGENT_IDS)[number];

export const REVIEW_AGENTS: Record<ReviewAgentId, { title: string; brief: string }> = {
  breaker: {
    title: 'Red-team engineer',
    brief: 'Try to break the plan: the inputs, edge cases, dependencies and demo-day failures that make it fall over. For each attack, say whether the plan as written already survives it.',
  },
  skeptic: {
    title: 'Skeptical judge',
    brief: 'Argue why this would not win: existing alternatives, weak originality, unclear value for the target user, and poor fit with the theme or judges.',
  },
  builder: {
    title: 'Lead builder',
    brief: 'Check whether the selected features can really be built with this stack and these team skills in the hours left. Name the scope that must be cut and the riskiest dependency.',
  },
  user: {
    title: 'User advocate',
    brief: 'Walk the main flow as the target user. Does it solve their problem on the first try, and what would make them stop using it?',
  },
};

export const DEFAULT_REVIEW_AGENTS: ReviewAgentId[] = ['breaker', 'skeptic', 'builder'];

export type ReviewVerdict = 'approval-ready' | 'needs-changes' | 'not-ready';
export type Severity = 'high' | 'medium' | 'low';

export interface PlanFeature {
  title: string;
  priority: 'P0' | 'P1' | 'P2';
}

/** Everything the leader has decided so far, as sent to the council. */
export interface PlanSpec {
  idea: IdeaInput;
  ideaCard?: { problem: string; targetUser: string; solution: string };
  /** Score from the assessment step, if any. */
  assessmentScore?: number;
  visualDirection?: string;
  techStack: Record<string, string>;
  /** Selected features only. */
  features: PlanFeature[];
  constraints: string[];
  nonGoals: string[];
  decisions: { question: string; answer: string }[];
  knownRisks?: string[];
}

export interface BreakAttempt {
  agent: ReviewAgentId;
  attack: string;
  severity: Severity;
  /** True when the plan as written already survives this attack. */
  holds: boolean;
  mitigation: string;
}

export interface AgentOpinion {
  stance: 'support' | 'concerned' | 'oppose';
  solidity: number;
  pros: string[];
  cons: string[];
  attacks: Omit<BreakAttempt, 'agent'>[];
}

export interface PlanReviewResult {
  /** 0-100: how well the plan survives the council. */
  solidity: number;
  verdict: ReviewVerdict;
  summary: string;
  pros: string[];
  cons: string[];
  breakAttempts: BreakAttempt[];
  /** Must be fixed before approval. */
  blockers: string[];
  requiredChanges: string[];
  method: 'council' | 'rule-based';
  /** Why the council could not use models, e.g. NOT_CONFIGURED. */
  fallback: string | null;
  /** Adjustments made on top of the chair, e.g. a verdict downgraded by an unresolved high-severity attack. */
  notes: string[];
}

export interface PlanReviewTurn {
  seq: number;
  agent: ReviewAgentId | 'chair';
  status: 'ok' | 'failed' | 'skipped';
  provider: string | null;
  model: string | null;
  reason: string | null;
  output: AgentOpinion | null;
  durationMs: number;
}

export type PlanReviewStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface PlanReview {
  id: string;
  status: PlanReviewStatus;
  agents: ReviewAgentId[];
  focus: string | null;
  spec: PlanSpec;
  /** Model requests allowed: one per agent plus the chair. */
  maxCalls: number;
  providers: string[];
  turns: PlanReviewTurn[];
  result: PlanReviewResult | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** The verdict rules, applied to model and rule-based reviews alike. */
export function verdictFor(solidity: number, unresolvedHigh: number): ReviewVerdict {
  if (solidity >= 70 && unresolvedHigh === 0) return 'approval-ready';
  if (solidity >= 45) return 'needs-changes';
  return 'not-ready';
}

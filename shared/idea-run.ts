import type { IdeaInput, IdeaReport } from './idea-report';

/** AWAITING_APPROVAL → RUNNING → COMPLETED | FAILED; CANCELLED from either open state. */
export const IDEA_RUN_STATUSES = ['AWAITING_APPROVAL', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED'] as const;
export type IdeaRunStatus = (typeof IDEA_RUN_STATUSES)[number];

export interface IdeaRun {
  id: string;
  status: IdeaRunStatus;
  input: IdeaInput;
  /** Provider request budget for the council (retries included). */
  maxCalls: number;
  /** Set once the run completes (council or rule-based fallback). */
  report: IdeaReport | null;
  /** Why the council fell back to the rule-based report, e.g. NOT_CONFIGURED. */
  fallback: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface IdeaRunTurn {
  seq: number;
  round: 'draft' | 'critique' | 'synthesis';
  role: string;
  status: 'ok' | 'failed' | 'skipped';
  provider: string | null;
  model: string | null;
  reason: string | null;
  attempts: { provider: string; model: string; reason: string }[];
  output: unknown;
  usage: { inputTokens?: number; outputTokens?: number } | null;
  startedAt: string;
  durationMs: number;
}

export interface IdeaRunDetail extends IdeaRun {
  turns: IdeaRunTurn[];
  /** Providers the council would use right now; empty means the rule-based report. */
  providers: string[];
}

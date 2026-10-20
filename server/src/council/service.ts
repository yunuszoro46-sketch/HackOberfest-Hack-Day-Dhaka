import type { IdeaInput } from '../../../shared/idea-report';
import type { IdeaRun, IdeaRunDetail } from '../../../shared/idea-run';
import type { IdeaRunRepo } from '../db/idea-runs';
import { ApiErr, notFound } from '../http/errors';
import { LlmError } from '../llm/types';
import { DEFAULT_COUNCIL_CALLS, runCouncil, type JsonGenerator } from './runner';

/**
 * Approval-gated idea council runs. Creating a run makes no LLM calls; only `approve` starts the council, in the
 * background, one run at a time (free-tier friendly). Every turn is persisted as it happens.
 */
export class CouncilService {
  private readonly active = new Map<string, { controller: AbortController; done: Promise<void> }>();

  constructor(private readonly repo: IdeaRunRepo, private readonly llm: JsonGenerator) {}

  /** Marks runs interrupted by a restart as FAILED. */
  boot(): string[] {
    return this.repo.recoverInterrupted();
  }

  create(input: IdeaInput, maxCalls = DEFAULT_COUNCIL_CALLS): IdeaRun {
    return this.repo.create(input, maxCalls);
  }

  list(limit?: number): IdeaRun[] {
    return this.repo.list(limit);
  }

  detail(id: string): IdeaRunDetail {
    return { ...this.must(id), turns: this.repo.listTurns(id), providers: this.llm.providers };
  }

  approve(id: string): IdeaRun {
    const run = this.must(id);
    if (run.status !== 'AWAITING_APPROVAL') throw new ApiErr('INVALID_TRANSITION', `Only a run awaiting approval can be approved (run is ${run.status})`);
    const [busy] = this.active.keys();
    if (busy) throw new ApiErr('RUN_ACTIVE', 'Another idea council run is in progress. Wait for it or cancel it first.', { runId: busy });
    if (!this.repo.transition(id, 'AWAITING_APPROVAL', 'RUNNING')) throw new ApiErr('STALE', 'The run changed; reload and try again');
    const controller = new AbortController();
    const done = this.execute(run, controller.signal).finally(() => this.active.delete(id));
    this.active.set(id, { controller, done });
    return this.must(id);
  }

  cancel(id: string): IdeaRun {
    const run = this.must(id);
    if (run.status !== 'AWAITING_APPROVAL' && run.status !== 'RUNNING') throw new ApiErr('INVALID_TRANSITION', `Only an open run can be cancelled (run is ${run.status})`);
    if (this.repo.transition(id, run.status, 'CANCELLED')) this.active.get(id)?.controller.abort();
    return this.must(id);
  }

  /** Resolves when the run's background work (if any) has finished. For tests and shutdown. */
  async idle(id: string): Promise<void> {
    await this.active.get(id)?.done;
  }

  private async execute(run: IdeaRun, signal: AbortSignal): Promise<void> {
    try {
      const out = await runCouncil(this.llm, run.input, {
        signal,
        maxCalls: run.maxCalls,
        onTurn: (t) => this.repo.addTurn(run.id, t),
      });
      this.repo.transition(run.id, 'RUNNING', 'COMPLETED', { report: out.report, fallback: out.fallback });
    } catch (err) {
      if (err instanceof LlmError && err.reason === 'ABORTED') return; // cancel() already set CANCELLED
      console.error(err);
      this.repo.transition(run.id, 'RUNNING', 'FAILED', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private must(id: string): IdeaRun {
    return this.repo.get(id) ?? (() => { throw notFound('Idea run'); })();
  }
}

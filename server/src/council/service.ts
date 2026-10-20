import { randomUUID } from 'node:crypto';
import type { IdeaInput } from '../../../shared/idea-report';
import type { IdeaRun, IdeaRunDetail } from '../../../shared/idea-run';
import type { IdeaRunRepo } from '../db/idea-runs';
import { ApiErr, notFound } from '../http/errors';
import { LlmError } from '../llm/types';
import { DEFAULT_COUNCIL_CALLS, runCouncil, type JsonGenerator } from './runner';

export const DEFAULT_COUNCIL_LEASE_MS = 30_000;

export interface CouncilServiceOptions {
  /** A RUNNING run whose owner hasn't heartbeated for this long is treated as abandoned. Heartbeats run at a third of it. */
  leaseMs?: number;
}

/**
 * Approval-gated idea council runs. Creating a run makes no LLM calls; only `approve` starts the council, in the
 * background, one run at a time across every server process sharing the database (free-tier friendly). Every turn is
 * persisted as it happens. The process that approved a run owns it: it heartbeats a lease in the database and stops
 * as soon as the run is cancelled or failed by any process.
 */
export class CouncilService {
  readonly owner = randomUUID();
  private readonly leaseMs: number;
  private readonly active = new Map<string, { controller: AbortController; done: Promise<void> }>();

  constructor(private readonly repo: IdeaRunRepo, private readonly llm: JsonGenerator, opts: CouncilServiceOptions = {}) {
    this.leaseMs = opts.leaseMs ?? DEFAULT_COUNCIL_LEASE_MS;
  }

  /** Marks runs abandoned by a stopped server as FAILED. Runs another live process is still heartbeating are left alone. */
  boot(): string[] {
    return this.sweep();
  }

  /** Graceful shutdown: fails this process's running councils immediately rather than waiting for the lease to expire. */
  stop(): string[] {
    const ids = this.repo.releaseOwned(this.owner, 'Interrupted by a server shutdown before the council finished.');
    for (const { controller } of this.active.values()) controller.abort();
    return ids;
  }

  create(input: IdeaInput, maxCalls = DEFAULT_COUNCIL_CALLS): IdeaRun {
    return this.repo.create(input, maxCalls);
  }

  list(limit?: number): IdeaRun[] {
    this.sweep();
    return this.repo.list(limit);
  }

  detail(id: string): IdeaRunDetail {
    this.sweep();
    return { ...this.must(id), turns: this.repo.listTurns(id), providers: this.llm.providers };
  }

  approve(id: string): IdeaRun {
    const run = this.must(id);
    if (run.status !== 'AWAITING_APPROVAL') throw new ApiErr('INVALID_TRANSITION', `Only a run awaiting approval can be approved (run is ${run.status})`);
    if (!this.repo.claim(id, this.owner, this.staleBefore())) {
      if (this.must(id).status !== 'AWAITING_APPROVAL') throw new ApiErr('STALE', 'The run changed; reload and try again');
      throw new ApiErr('RUN_ACTIVE', 'Another idea council run is in progress. Wait for it or cancel it first.', { runId: this.repo.activeRunId() });
    }
    const controller = new AbortController();
    const done = this.execute(run, controller).finally(() => this.active.delete(id));
    this.active.set(id, { controller, done });
    return this.must(id);
  }

  /** Works from any process: the owner notices on its next heartbeat, provider call, or turn and stops. */
  cancel(id: string): IdeaRun {
    const run = this.must(id);
    if (run.status !== 'AWAITING_APPROVAL' && run.status !== 'RUNNING') throw new ApiErr('INVALID_TRANSITION', `Only an open run can be cancelled (run is ${run.status})`);
    if (this.repo.transition(id, run.status, 'CANCELLED')) this.active.get(id)?.controller.abort();
    return this.must(id);
  }

  /** Resolves when the run's background work (if any) in this process has finished. For tests and shutdown. */
  async idle(id: string): Promise<void> {
    await this.active.get(id)?.done;
  }

  private async execute(run: IdeaRun, controller: AbortController): Promise<void> {
    const { signal } = controller;
    const stopped = () => new LlmError('council', 'ABORTED', 'the run is no longer running in this process');
    const heartbeat = setInterval(() => {
      if (!this.repo.heartbeat(run.id, this.owner)) controller.abort();
    }, Math.max(1, Math.floor(this.leaseMs / 3)));
    heartbeat.unref();
    const guarded: JsonGenerator = {
      providers: this.llm.providers,
      generateJson: (req, opts) => {
        if (!this.repo.ownsRunning(run.id, this.owner)) controller.abort();
        if (signal.aborted) return Promise.reject(stopped());
        return this.llm.generateJson(req, opts);
      },
    };
    try {
      const out = await runCouncil(guarded, run.input, {
        signal,
        maxCalls: run.maxCalls,
        onTurn: (t) => {
          if (this.repo.addTurn(run.id, t, this.owner)) return;
          controller.abort();
          throw stopped();
        },
      });
      this.repo.transition(run.id, 'RUNNING', 'COMPLETED', { report: out.report, fallback: out.fallback }, this.owner);
    } catch (err) {
      if (err instanceof LlmError && err.reason === 'ABORTED') return; // whoever stopped the run already set its status
      console.error(err);
      this.repo.transition(run.id, 'RUNNING', 'FAILED', { error: err instanceof Error ? err.message : String(err) }, this.owner);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private sweep(): string[] {
    return this.repo.recoverStale(this.staleBefore());
  }

  private staleBefore(): string {
    return new Date(Date.now() - this.leaseMs).toISOString();
  }

  private must(id: string): IdeaRun {
    return this.repo.get(id) ?? (() => { throw notFound('Idea run'); })();
  }
}

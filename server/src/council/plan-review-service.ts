import { randomUUID } from 'node:crypto';
import type { PlanReview, PlanSpec, ReviewAgentId } from '../../../shared/plan-review';
import { ApiErr, notFound } from '../http/errors';
import { LlmError } from '../llm/types';
import { runPlanReview } from './plan-review';
import type { JsonGenerator } from './runner';

const KEEP = 50;

/**
 * Plan reviews run in the background and are kept in memory (the latest 50). Starting one is the leader's
 * explicit action in the planning workspace, which shows the agents and model-call budget first.
 */
export class PlanReviewService {
  private readonly reviews = new Map<string, PlanReview>();
  private readonly active = new Map<string, { controller: AbortController; done: Promise<void> }>();

  constructor(private readonly llm: JsonGenerator) {}

  start(spec: PlanSpec, agents: ReviewAgentId[], focus: string | null): PlanReview {
    const review: PlanReview = {
      id: randomUUID(), status: 'RUNNING', agents, focus, spec, maxCalls: agents.length + 1, providers: [...this.llm.providers],
      turns: [], result: null, error: null, createdAt: new Date().toISOString(), finishedAt: null,
    };
    this.reviews.set(review.id, review);
    for (const id of [...this.reviews.keys()].slice(0, Math.max(0, this.reviews.size - KEEP))) if (!this.active.has(id)) this.reviews.delete(id);
    const controller = new AbortController();
    const done = runPlanReview(this.llm, spec, agents, focus, { signal: controller.signal, onTurn: (t) => review.turns.push(t) })
      .then((out) => {
        if (review.status !== 'RUNNING') return;
        Object.assign(review, { status: 'COMPLETED', result: out.result, finishedAt: new Date().toISOString() });
      })
      .catch((err) => {
        if (review.status !== 'RUNNING') return;
        if (err instanceof LlmError && err.reason === 'ABORTED') return;
        console.error(err);
        Object.assign(review, { status: 'FAILED', error: err instanceof Error ? err.message : String(err), finishedAt: new Date().toISOString() });
      })
      .finally(() => this.active.delete(review.id));
    this.active.set(review.id, { controller, done });
    return review;
  }

  get(id: string): PlanReview {
    return this.reviews.get(id) ?? (() => { throw notFound('Plan review'); })();
  }

  cancel(id: string): PlanReview {
    const review = this.get(id);
    if (review.status !== 'RUNNING') throw new ApiErr('INVALID_TRANSITION', `Only a running review can be cancelled (review is ${review.status})`);
    Object.assign(review, { status: 'CANCELLED', finishedAt: new Date().toISOString() });
    this.active.get(id)?.controller.abort();
    return review;
  }

  /** Resolves when the review's background work has finished. For tests. */
  async idle(id: string): Promise<void> {
    await this.active.get(id)?.done;
  }
}

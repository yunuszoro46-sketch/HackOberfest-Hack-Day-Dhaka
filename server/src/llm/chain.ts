import { BudgetTracker, type BudgetLimits, type BudgetUsage } from './budget';
import { LlmError, type JsonRequest, type JsonResult, type LlmClient, type LlmFailure } from './types';

export interface ChainMember {
  client: LlmClient;
  limits?: BudgetLimits;
}

export interface ChainAttempt {
  provider: string;
  model: string;
  reason: LlmFailure;
}

export interface ChainResult<T> extends JsonResult<T> {
  /** Providers tried and skipped/failed before the one that answered. */
  attempts: ChainAttempt[];
}

/** A per-run cap on real provider requests (retries included), shared across calls; `used` is incremented in place. */
export interface RunBudget {
  limit: number;
  used: number;
}

export interface ChainMemberStatus {
  provider: string;
  model: string;
  limits: BudgetLimits;
  usage: BudgetUsage;
  /** ISO time until which the provider is skipped after a rate limit or hard failure. */
  coolingDownUntil: string | null;
}

export class LlmChainError extends Error {
  readonly attempts: ChainAttempt[];
  constructor(attempts: ChainAttempt[]) {
    super(attempts.length ? `all providers failed: ${attempts.map((a) => `${a.provider} ${a.reason}`).join(', ')}` : 'no LLM providers are configured');
    this.attempts = attempts;
  }
}

/** How long a provider is skipped after each failure (ms). Retry-After, when sent, wins for RATE_LIMIT/QUOTA. */
export const DEFAULT_COOLDOWN_MS: Partial<Record<LlmFailure, number>> = {
  RATE_LIMIT: 60_000,
  QUOTA: 15 * 60_000,
  AUTH: 10 * 60_000,
  MODEL_NOT_FOUND: 10 * 60_000,
  NETWORK: 15_000,
  UPSTREAM: 15_000,
  TIMEOUT: 15_000,
};

export interface FallbackChainOptions {
  budget?: BudgetTracker;
  now?: () => number;
  cooldownMs?: Partial<Record<LlmFailure, number>>;
}

/**
 * Tries providers in order until one returns a schema-valid reply. Skips providers that are over their
 * RPM/RPD budget or cooling down after a rate limit / hard failure. A caller abort stops the chain.
 */
export class FallbackChain {
  private readonly budget: BudgetTracker;
  private readonly now: () => number;
  private readonly cooldownMs: Partial<Record<LlmFailure, number>>;
  private readonly coolUntil = new Map<string, { until: number; reason: LlmFailure }>();

  constructor(private readonly members: ChainMember[], opts: FallbackChainOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.budget = opts.budget ?? new BudgetTracker(this.now);
    this.cooldownMs = { ...DEFAULT_COOLDOWN_MS, ...opts.cooldownMs };
  }

  get providers(): string[] {
    return this.members.map((m) => m.client.id);
  }

  /**
   * `prefer` moves that provider to the front (e.g. to spread council members across providers). `run` caps real
   * requests across calls; once it is spent the chain stops with a BUDGET attempt instead of trying more providers.
   */
  async generateJson<T>(req: JsonRequest<T>, opts: { prefer?: string; run?: RunBudget } = {}): Promise<ChainResult<T>> {
    const attempts: ChainAttempt[] = [];
    for (const { client, limits = {} } of this.ordered(opts.prefer)) {
      const base = { provider: client.id, model: client.model };
      const cooling = this.coolUntil.get(client.id);
      if (cooling && cooling.until > this.now()) {
        attempts.push({ ...base, reason: cooling.reason });
        continue;
      }
      if (!this.budget.check(client.id, limits).ok) {
        attempts.push({ ...base, reason: 'BUDGET' });
        continue;
      }
      if (opts.run && opts.run.used >= opts.run.limit) {
        attempts.push({ ...base, reason: 'BUDGET' });
        break;
      }
      if (opts.run) opts.run.used += 1;
      const unrecord = this.budget.record(client.id, limits);
      try {
        const result = await client.generateJson(req);
        return { ...result, attempts };
      } catch (err) {
        if (!(err instanceof LlmError)) throw err;
        if (err.reason === 'ABORTED' || req.signal?.aborted) throw err;
        // NOT_CONFIGURED is raised before any HTTP request, so it must not spend the run or provider budgets.
        if (err.reason === 'NOT_CONFIGURED') {
          unrecord();
          if (opts.run) opts.run.used -= 1;
        }
        attempts.push({ ...base, reason: err.reason });
        const wait = (err.reason === 'RATE_LIMIT' || err.reason === 'QUOTA') && err.retryAfterSec !== undefined ? err.retryAfterSec * 1000 : this.cooldownMs[err.reason];
        if (wait) this.coolUntil.set(client.id, { until: this.now() + wait, reason: err.reason });
      }
    }
    throw new LlmChainError(attempts);
  }

  status(): ChainMemberStatus[] {
    return this.members.map(({ client, limits = {} }) => {
      const until = this.coolUntil.get(client.id)?.until ?? 0;
      return {
        provider: client.id,
        model: client.model,
        limits,
        usage: this.budget.usage(client.id, limits),
        coolingDownUntil: until > this.now() ? new Date(until).toISOString() : null,
      };
    });
  }

  private ordered(prefer?: string): ChainMember[] {
    const first = this.members.filter((m) => m.client.id === prefer);
    return [...first, ...this.members.filter((m) => m.client.id !== prefer)];
  }
}

export interface BudgetLimits {
  /** Requests per minute (sliding 60s window). */
  rpm?: number;
  /** Requests per day; the day rolls over at midnight in dayTimeZone. */
  rpd?: number;
  /** IANA zone for the daily reset, e.g. "UTC" or "America/Los_Angeles". Defaults to UTC. */
  dayTimeZone?: string;
}

export interface BudgetUsage {
  lastMinute: number;
  today: number;
}

export type BudgetVerdict = { ok: true } | { ok: false; limit: 'rpm' | 'rpd' };

const dayKey = (now: number, timeZone = 'UTC') =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** In-memory request counters per provider. Counts requests sent, including ones that fail upstream. */
export class BudgetTracker {
  private readonly minute = new Map<string, number[]>();
  private readonly day = new Map<string, { key: string; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  check(id: string, limits: BudgetLimits = {}): BudgetVerdict {
    const u = this.usage(id, limits);
    if (limits.rpd !== undefined && u.today >= limits.rpd) return { ok: false, limit: 'rpd' };
    if (limits.rpm !== undefined && u.lastMinute >= limits.rpm) return { ok: false, limit: 'rpm' };
    return { ok: true };
  }

  record(id: string, limits: BudgetLimits = {}): void {
    const t = this.now();
    this.minute.set(id, [...this.recent(id, t), t]);
    const key = dayKey(t, limits.dayTimeZone);
    const d = this.day.get(id);
    this.day.set(id, { key, count: d?.key === key ? d.count + 1 : 1 });
  }

  usage(id: string, limits: BudgetLimits = {}): BudgetUsage {
    const t = this.now();
    const d = this.day.get(id);
    return { lastMinute: this.recent(id, t).length, today: d?.key === dayKey(t, limits.dayTimeZone) ? d.count : 0 };
  }

  private recent(id: string, t: number): number[] {
    return (this.minute.get(id) ?? []).filter((ts) => t - ts < 60_000);
  }
}

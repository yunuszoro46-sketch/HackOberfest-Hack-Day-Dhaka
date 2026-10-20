import { randomUUID } from 'node:crypto';
import type { IdeaInput, IdeaReport } from '../../../shared/idea-report';
import type { IdeaRun, IdeaRunStatus, IdeaRunTurn } from '../../../shared/idea-run';
import type { DB } from './db';

type Row = Record<string, any>;
const now = () => new Date().toISOString();
const json = <T>(s: string | null): T | null => (s == null ? null : (JSON.parse(s) as T));

const toRun = (r: Row): IdeaRun => ({
  id: r.id, status: r.status, input: JSON.parse(r.input), maxCalls: r.max_calls, report: json<IdeaReport>(r.report),
  fallback: r.fallback, error: r.error, createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
});
const toTurn = (r: Row): IdeaRunTurn => ({
  seq: r.seq, round: r.round, role: r.role, status: r.status, provider: r.provider, model: r.model, reason: r.reason,
  attempts: JSON.parse(r.attempts), output: json(r.output), usage: json(r.usage), startedAt: r.started_at, durationMs: r.duration_ms,
});

/**
 * Persistence for idea council runs and their turn transcript. Status changes are compare-and-set on the old status.
 * A RUNNING run is leased by one server process (`owner`), which refreshes `heartbeat_at` while it works, so several
 * processes can share the database without stealing, duplicating, or orphaning each other's runs.
 */
export class IdeaRunRepo {
  constructor(private readonly db: DB) {}

  create(input: IdeaInput, maxCalls: number): IdeaRun {
    const id = randomUUID();
    this.db.prepare('INSERT INTO idea_runs (id, status, input, max_calls, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'AWAITING_APPROVAL', JSON.stringify(input), maxCalls, now());
    return this.get(id)!;
  }

  get(id: string): IdeaRun | null {
    const r = this.db.prepare('SELECT * FROM idea_runs WHERE id = ?').get(id) as Row | undefined;
    return r ? toRun(r) : null;
  }

  list(limit = 20): IdeaRun[] {
    return (this.db.prepare('SELECT * FROM idea_runs ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit) as Row[]).map(toRun);
  }

  /**
   * Moves the run from `from` to `to`; returns false if it was no longer in `from` (lost a race), or, when `owner` is
   * given, if another process owns it.
   */
  transition(
    id: string, from: IdeaRunStatus, to: IdeaRunStatus,
    fields: { report?: IdeaReport; fallback?: string | null; error?: string } = {}, owner?: string,
  ): boolean {
    const t = now();
    const info = this.db.prepare(
      `UPDATE idea_runs SET status = ?, report = COALESCE(?, report), fallback = COALESCE(?, fallback), error = COALESCE(?, error),
         started_at = CASE WHEN ? = 'RUNNING' THEN ? ELSE started_at END,
         finished_at = CASE WHEN ? IN ('COMPLETED', 'CANCELLED', 'FAILED') THEN ? ELSE finished_at END
       WHERE id = ? AND status = ? AND (? IS NULL OR owner = ?)`,
    ).run(to, fields.report ? JSON.stringify(fields.report) : null, fields.fallback ?? null, fields.error ?? null, to, t, to, t, id, from,
      owner ?? null, owner ?? null);
    return info.changes === 1;
  }

  /**
   * Atomically moves an AWAITING_APPROVAL run to RUNNING under `owner`, only if no other run is RUNNING anywhere.
   * Runs whose owner stopped heartbeating before `staleBefore` are failed first so they don't hold the slot.
   */
  claim(id: string, owner: string, staleBefore: string): boolean {
    return this.db.transaction(() => {
      this.recoverStale(staleBefore);
      const t = now();
      return this.db.prepare(
        `UPDATE idea_runs SET status = 'RUNNING', owner = ?, heartbeat_at = ?, started_at = ?
         WHERE id = ? AND status = 'AWAITING_APPROVAL' AND NOT EXISTS (SELECT 1 FROM idea_runs WHERE status = 'RUNNING')`,
      ).run(owner, t, t, id).changes === 1;
    }).immediate();
  }

  /** Refreshes the lease; false means the run is no longer RUNNING under `owner` (cancelled or failed elsewhere). */
  heartbeat(id: string, owner: string): boolean {
    return this.db.prepare("UPDATE idea_runs SET heartbeat_at = ? WHERE id = ? AND owner = ? AND status = 'RUNNING'")
      .run(now(), id, owner).changes === 1;
  }

  ownsRunning(id: string, owner: string): boolean {
    return this.db.prepare("SELECT 1 FROM idea_runs WHERE id = ? AND owner = ? AND status = 'RUNNING'").get(id, owner) !== undefined;
  }

  activeRunId(): string | null {
    return (this.db.prepare("SELECT id FROM idea_runs WHERE status = 'RUNNING' LIMIT 1").pluck().get() as string | undefined) ?? null;
  }

  /** Appends a turn; when `owner` is given, only while the run is still RUNNING under that owner. Returns whether it was stored. */
  addTurn(runId: string, turn: Omit<IdeaRunTurn, 'seq'>, owner?: string): boolean {
    return this.db.prepare(
      `INSERT INTO idea_run_turns (run_id, seq, round, role, status, provider, model, reason, attempts, output, usage, started_at, duration_ms)
       SELECT ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM idea_run_turns WHERE run_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ? IS NULL OR EXISTS (SELECT 1 FROM idea_runs WHERE id = ? AND owner = ? AND status = 'RUNNING')`,
    ).run(runId, runId, turn.round, turn.role, turn.status, turn.provider, turn.model, turn.reason, JSON.stringify(turn.attempts),
      turn.output == null ? null : JSON.stringify(turn.output), turn.usage == null ? null : JSON.stringify(turn.usage), turn.startedAt, turn.durationMs,
      owner ?? null, runId, owner ?? null).changes === 1;
  }

  listTurns(runId: string): IdeaRunTurn[] {
    return (this.db.prepare('SELECT * FROM idea_run_turns WHERE run_id = ? ORDER BY seq').all(runId) as Row[]).map(toTurn);
  }

  /** Fails RUNNING runs whose owner stopped heartbeating before `staleBefore` (crashed or restarted). Returns their ids. */
  recoverStale(staleBefore: string): string[] {
    const ids = this.db.prepare("SELECT id FROM idea_runs WHERE status = 'RUNNING' AND (heartbeat_at IS NULL OR heartbeat_at < ?)")
      .pluck().all(staleBefore) as string[];
    for (const id of ids) {
      this.transition(id, 'RUNNING', 'FAILED', { error: 'Interrupted: the server running this council stopped before it finished (server restart or crash).' });
    }
    return ids;
  }

  /** Fails every run still RUNNING under `owner` (graceful shutdown of that process). Returns their ids. */
  releaseOwned(owner: string, error: string): string[] {
    const ids = this.db.prepare("SELECT id FROM idea_runs WHERE status = 'RUNNING' AND owner = ?").pluck().all(owner) as string[];
    for (const id of ids) this.transition(id, 'RUNNING', 'FAILED', { error }, owner);
    return ids;
  }
}

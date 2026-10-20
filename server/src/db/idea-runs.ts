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

/** Persistence for idea council runs and their turn transcript. Status changes are compare-and-set on the old status. */
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

  /** Moves the run from `from` to `to`; returns false if it was no longer in `from` (lost a race). */
  transition(id: string, from: IdeaRunStatus, to: IdeaRunStatus, fields: { report?: IdeaReport; fallback?: string | null; error?: string } = {}): boolean {
    const t = now();
    const info = this.db.prepare(
      `UPDATE idea_runs SET status = ?, report = COALESCE(?, report), fallback = COALESCE(?, fallback), error = COALESCE(?, error),
         started_at = CASE WHEN ? = 'RUNNING' THEN ? ELSE started_at END,
         finished_at = CASE WHEN ? IN ('COMPLETED', 'CANCELLED', 'FAILED') THEN ? ELSE finished_at END
       WHERE id = ? AND status = ?`,
    ).run(to, fields.report ? JSON.stringify(fields.report) : null, fields.fallback ?? null, fields.error ?? null, to, t, to, t, id, from);
    return info.changes === 1;
  }

  addTurn(runId: string, turn: Omit<IdeaRunTurn, 'seq'>): void {
    this.db.prepare(
      `INSERT INTO idea_run_turns (run_id, seq, round, role, status, provider, model, reason, attempts, output, usage, started_at, duration_ms)
       VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM idea_run_turns WHERE run_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(runId, runId, turn.round, turn.role, turn.status, turn.provider, turn.model, turn.reason, JSON.stringify(turn.attempts),
      turn.output == null ? null : JSON.stringify(turn.output), turn.usage == null ? null : JSON.stringify(turn.usage), turn.startedAt, turn.durationMs);
  }

  listTurns(runId: string): IdeaRunTurn[] {
    return (this.db.prepare('SELECT * FROM idea_run_turns WHERE run_id = ? ORDER BY seq').all(runId) as Row[]).map(toTurn);
  }

  /** Runs left RUNNING by a previous process can never finish; mark them FAILED. Returns their ids. */
  recoverInterrupted(): string[] {
    const ids = this.db.prepare("SELECT id FROM idea_runs WHERE status = 'RUNNING'").pluck().all() as string[];
    for (const id of ids) this.transition(id, 'RUNNING', 'FAILED', { error: 'Interrupted by a server restart before the council finished.' });
    return ids;
  }
}

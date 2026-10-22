import { randomUUID } from 'node:crypto';
import type { DB } from './db';
import {
  canTransition,
  type ActivityEvent,
  type ActivityType,
  type AgentRole,
  type AgentRun,
  type Artifact,
  type ArtifactKind,
  type Command,
  type Decision,
  type Message,
  type Project,
  type ProjectAgent,
  type AgentRunStatus,
  type DecisionAction,
  type PendingDecision,
  type Run,
  type RunStatus,
  type Task,
  type TaskStatus,
} from '../../../shared/types';

const now = () => new Date().toISOString();
const id = () => randomUUID();

type Row = Record<string, any>;

const toProject = (r: Row): Project => ({
  id: r.id, name: r.name, goal: r.goal, constraints: r.constraints, createdAt: r.created_at,
});
const toAgent = (r: Row): ProjectAgent => ({ id: r.id, projectId: r.project_id, role: r.role, createdAt: r.created_at });
const toCommand = (r: Row): Command => ({
  id: r.id, projectId: r.project_id, text: r.text, plannerProvider: r.planner_provider,
  plannerNote: r.planner_note, createdAt: r.created_at,
});
const toTask = (r: Row): Task => ({
  id: r.id, projectId: r.project_id, commandId: r.command_id, role: r.role, title: r.title,
  description: r.description, status: r.status, position: r.position, attempts: r.attempts,
  blockedReason: r.blocked_reason, lastError: r.last_error, summary: r.summary,
  createdAt: r.created_at, updatedAt: r.updated_at, runId: r.run_id ?? null,
});
const toSupRun = (r: Row): Run => ({
  id: r.id, projectId: r.project_id, commandId: r.command_id, status: r.status, maxTasks: r.max_tasks,
  maxRuntimeMs: r.max_runtime_ms, plannerProvider: r.planner_provider, provider: r.provider, startedAt: r.started_at,
  lastProgressAt: r.last_progress_at, finishedAt: r.finished_at, summary: r.summary, createdAt: r.created_at,
});
const toPending = (r: Row): PendingDecision => ({
  id: r.id, projectId: r.project_id, runId: r.run_id, taskId: r.task_id, question: r.question, context: r.context,
  proposed: r.proposed, alternatives: JSON.parse(r.alternatives || '[]'), status: r.status, provider: r.provider,
  resolvedBy: r.resolved_by, resolution: r.resolution, instructions: r.instructions, createdAt: r.created_at, resolvedAt: r.resolved_at,
});
const toRun = (r: Row): AgentRun => ({
  id: r.id, taskId: r.task_id, projectId: r.project_id, role: r.role, provider: r.provider,
  attempt: r.attempt, status: r.status, summary: r.summary, error: r.error,
  startedAt: r.started_at, finishedAt: r.finished_at,
});
const toMessage = (r: Row): Message => ({
  id: r.id, projectId: r.project_id, taskId: r.task_id, author: r.author, body: r.body, createdAt: r.created_at,
  kind: r.kind ?? 'note', toRole: r.to_role ?? null, provider: r.provider ?? null,
});
const toDecision = (r: Row): Decision => ({
  id: r.id, projectId: r.project_id, title: r.title, rationale: r.rationale, madeBy: r.made_by, createdAt: r.created_at,
});
const toArtifact = (r: Row, withContent = false): Artifact => ({
  id: r.id, projectId: r.project_id, taskId: r.task_id, runId: r.run_id, path: r.path, kind: r.kind,
  size: r.size, createdAt: r.created_at, ...(withContent ? { content: r.content } : {}),
});
const toEvent = (r: Row): ActivityEvent => ({
  id: r.id, projectId: r.project_id, taskId: r.task_id, type: r.type, actor: r.actor, message: r.message,
  data: r.data ? JSON.parse(r.data) : null, createdAt: r.created_at,
});

export interface TransitionPatch {
  blockedReason?: string | null;
  lastError?: string | null;
  summary?: string | null;
  incrementAttempts?: boolean;
}

export class Repo {
  readonly db: DB;
  constructor(db: DB) {
    this.db = db;
  }

  // ---------- projects ----------
  createProject(input: { name: string; goal: string; constraints: string }): Project {
    const p = { id: id(), ...input, created_at: now() };
    this.db.prepare('INSERT INTO projects (id, name, goal, constraints, created_at) VALUES (@id, @name, @goal, @constraints, @created_at)').run(p);
    this.logActivity(p.id, null, 'project_created', 'leader', `Project "${p.name}" created`);
    return toProject(p);
  }

  getProject(projectId: string): Project | null {
    const r = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Row | undefined;
    return r ? toProject(r) : null;
  }

  listProjects(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Row[];
    return rows.map((r) => ({ ...toProject(r), agents: this.listAgents(r.id), taskCounts: this.taskCounts(r.id) }));
  }

  taskCounts(projectId: string): Partial<Record<TaskStatus, number>> {
    const rows = this.db.prepare('SELECT status, COUNT(*) n FROM tasks WHERE project_id = ? GROUP BY status').all(projectId) as Row[];
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }

  // ---------- agents ----------
  listAgents(projectId: string): ProjectAgent[] {
    return (this.db.prepare('SELECT * FROM project_agents WHERE project_id = ? ORDER BY created_at, role').all(projectId) as Row[]).map(toAgent);
  }

  /** Replaces the team, keeping existing rows (and their createdAt) for roles that stay. */
  setAgents(projectId: string, roles: AgentRole[]): ProjectAgent[] {
    this.db.transaction(() => {
      const existing = new Set(this.listAgents(projectId).map((a) => a.role));
      const wanted = new Set(roles);
      for (const r of existing) if (!wanted.has(r)) this.db.prepare('DELETE FROM project_agents WHERE project_id = ? AND role = ?').run(projectId, r);
      for (const r of roles) {
        if (!existing.has(r)) {
          this.db.prepare('INSERT INTO project_agents (id, project_id, role, created_at) VALUES (?, ?, ?, ?)').run(id(), projectId, r, now());
        }
      }
    })();
    this.logActivity(projectId, null, 'agents_updated', 'leader', `Team updated: ${roles.join(', ') || '(empty)'}`, { roles });
    return this.listAgents(projectId);
  }

  // ---------- commands ----------
  createCommand(projectId: string, text: string, plannerProvider: string, plannerNote: string): Command {
    const c = { id: id(), project_id: projectId, text, planner_provider: plannerProvider, planner_note: plannerNote, created_at: now() };
    this.db.prepare('INSERT INTO commands (id, project_id, text, planner_provider, planner_note, created_at) VALUES (@id, @project_id, @text, @planner_provider, @planner_note, @created_at)').run(c);
    return toCommand(c);
  }

  listCommands(projectId: string): Command[] {
    return (this.db.prepare('SELECT * FROM commands WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Row[]).map(toCommand);
  }

  // ---------- tasks ----------
  createTask(input: {
    projectId: string; commandId: string | null; role: AgentRole; title: string; description: string;
    status: 'QUEUED' | 'BLOCKED'; blockedReason?: string | null; runId?: string | null;
    /** Insert at this position, shifting later tasks down (callers wrap this in a transaction). Default: last. */
    position?: number;
  }): Task {
    let pos: number;
    if (input.position !== undefined) {
      this.db.prepare('UPDATE tasks SET position = position + 1 WHERE project_id = ? AND position >= ?').run(input.projectId, input.position);
      pos = input.position;
    } else {
      pos = this.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?').pluck().get(input.projectId) as number;
    }
    const t = {
      id: id(), project_id: input.projectId, command_id: input.commandId, role: input.role, title: input.title,
      description: input.description, status: input.status, position: pos, blocked_reason: input.blockedReason ?? null,
      created_at: now(), updated_at: now(), run_id: input.runId ?? null,
    };
    this.db.prepare(`INSERT INTO tasks (id, project_id, command_id, role, title, description, status, position, blocked_reason, created_at, updated_at, run_id)
      VALUES (@id, @project_id, @command_id, @role, @title, @description, @status, @position, @blocked_reason, @created_at, @updated_at, @run_id)`).run(t);
    return this.getTask(t.id)!;
  }

  getTask(taskId: string): Task | null {
    const r = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Row | undefined;
    return r ? toTask(r) : null;
  }

  listTasks(projectId: string): Task[] {
    return (this.db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY position').all(projectId) as Row[]).map(toTask);
  }

  /**
   * The only way a task's status changes (D6 + D7). Compare-and-swap on the current status:
   * returns the updated task, or null if the task was no longer in `from` (someone else moved it).
   * Throws if the transition itself is illegal.
   */
  transition(taskId: string, from: TaskStatus, to: TaskStatus, patch: TransitionPatch = {}): Task | null {
    if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
    const sets = ['status = @to', 'updated_at = @now'];
    const params: Row = { id: taskId, from, to, now: now() };
    if (patch.blockedReason !== undefined) { sets.push('blocked_reason = @blockedReason'); params.blockedReason = patch.blockedReason; }
    if (patch.lastError !== undefined) { sets.push('last_error = @lastError'); params.lastError = patch.lastError; }
    if (patch.summary !== undefined) { sets.push('summary = @summary'); params.summary = patch.summary; }
    if (patch.incrementAttempts) sets.push('attempts = attempts + 1');
    const res = this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id AND status = @from`).run(params);
    if (res.changes === 0) return null;
    return this.getTask(taskId);
  }

  /** Atomically claims the next QUEUED task of a project (planner order). */
  claimNextQueued(projectId: string, filter?: string): Task | null {
    for (;;) {
      // Tasks of a supervised run are only claimable while that run is RUNNING.
      const next = this.db.prepare(`SELECT t.id FROM tasks t LEFT JOIN runs r ON r.id = t.run_id
        WHERE t.project_id = ? AND t.status = 'QUEUED' AND (t.run_id IS NULL OR r.status = 'RUNNING')
        ${filter ? 'AND t.id = ?' : ''} ORDER BY t.position LIMIT 1`).pluck().get(...(filter ? [projectId, filter] : [projectId])) as string | undefined;
      if (!next) return null;
      const claimed = this.transition(next, 'QUEUED', 'IN_PROGRESS', { incrementAttempts: true, lastError: null, blockedReason: null });
      if (claimed) return claimed;
      // Lost the race for this task; look again.
    }
  }

  /** Boot recovery: anything left IN_PROGRESS was interrupted by a restart. */
  recoverInterrupted(): Task[] {
    const rows = (this.db.prepare("SELECT * FROM tasks WHERE status = 'IN_PROGRESS'").all() as Row[]).map(toTask);
    const out: Task[] = [];
    for (const t of rows) {
      const updated = this.transition(t.id, 'IN_PROGRESS', 'FAILED', { lastError: 'Interrupted by restart' });
      this.db.prepare("UPDATE agent_runs SET status = 'failed', error = 'Interrupted by restart', finished_at = ? WHERE task_id = ? AND status = 'running'").run(now(), t.id);
      if (updated) {
        out.push(updated);
        this.logActivity(t.projectId, t.id, 'task_status', 'system', `"${t.title}" marked FAILED: interrupted by restart`, { from: 'IN_PROGRESS', to: 'FAILED' });
      }
    }
    return out;
  }

  // ---------- runs ----------
  createRun(task: Task, provider: string): AgentRun {
    const r = { id: id(), task_id: task.id, project_id: task.projectId, role: task.role, provider, attempt: task.attempts, status: 'running', started_at: now() };
    this.db.prepare('INSERT INTO agent_runs (id, task_id, project_id, role, provider, attempt, status, started_at) VALUES (@id, @task_id, @project_id, @role, @provider, @attempt, @status, @started_at)').run(r);
    return this.getRun(r.id)!;
  }

  /** `provider` replaces the runner name recorded at start with who actually did the work (e.g. the model that answered). */
  finishRun(runId: string, status: Exclude<AgentRunStatus, 'running'>, summary: string | null, error: string | null, provider?: string): void {
    this.db.prepare('UPDATE agent_runs SET status = ?, summary = ?, error = ?, finished_at = ?, provider = COALESCE(?, provider) WHERE id = ?')
      .run(status, summary, error, now(), provider ?? null, runId);
  }

  getRun(runId: string): AgentRun | null {
    const r = this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId) as Row | undefined;
    return r ? toRun(r) : null;
  }

  listRunsForTask(taskId: string): AgentRun[] {
    return (this.db.prepare('SELECT * FROM agent_runs WHERE task_id = ? ORDER BY started_at, attempt').all(taskId) as Row[]).map(toRun);
  }

  listRunsForProject(projectId: string): AgentRun[] {
    return (this.db.prepare('SELECT * FROM agent_runs WHERE project_id = ? ORDER BY started_at').all(projectId) as Row[]).map(toRun);
  }

  // ---------- messages ----------
  addMessage(projectId: string, taskId: string | null, author: string, body: string, extra: { kind?: 'note' | 'handoff'; toRole?: AgentRole | null; provider?: string | null } = {}): Message {
    const m = { id: id(), project_id: projectId, task_id: taskId, author, body, created_at: now(), kind: extra.kind ?? 'note', to_role: extra.toRole ?? null, provider: extra.provider ?? null };
    this.db.prepare('INSERT INTO messages (id, project_id, task_id, author, body, created_at, kind, to_role, provider) VALUES (@id, @project_id, @task_id, @author, @body, @created_at, @kind, @to_role, @provider)').run(m);
    return toMessage(m);
  }

  listHandoffs(projectId: string): Message[] {
    return (this.db.prepare("SELECT * FROM messages WHERE project_id = ? AND kind = 'handoff' ORDER BY created_at").all(projectId) as Row[]).map(toMessage);
  }

  setTaskNote(taskId: string, blockedReason: string | null): void {
    this.db.prepare('UPDATE tasks SET blocked_reason = ?, updated_at = ? WHERE id = ?').run(blockedReason, now(), taskId);
  }

  // ---------- supervised runs ----------
  createSupRun(input: { projectId: string; commandId: string; maxTasks: number; maxRuntimeMs: number; plannerProvider: string; provider: string }): Run {
    const r = {
      id: id(), project_id: input.projectId, command_id: input.commandId, status: 'AWAITING_APPROVAL', max_tasks: input.maxTasks,
      max_runtime_ms: input.maxRuntimeMs, planner_provider: input.plannerProvider, provider: input.provider, created_at: now(),
    };
    this.db.prepare(`INSERT INTO runs (id, project_id, command_id, status, max_tasks, max_runtime_ms, planner_provider, provider, created_at)
      VALUES (@id, @project_id, @command_id, @status, @max_tasks, @max_runtime_ms, @planner_provider, @provider, @created_at)`).run(r);
    return this.getSupRun(r.id)!;
  }

  getSupRun(runId: string): Run | null {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as Row | undefined;
    return r ? { ...toSupRun(r), executed: this.runExecutions(runId) } : null;
  }

  latestSupRun(projectId: string): Run | null {
    const r = this.db.prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(projectId) as Row | undefined;
    return r ? { ...toSupRun(r), executed: this.runExecutions(r.id) } : null;
  }

  activeSupRun(projectId: string): Run | null {
    const r = this.db.prepare("SELECT * FROM runs WHERE project_id = ? AND status IN ('AWAITING_APPROVAL','RUNNING','PAUSED') ORDER BY created_at DESC LIMIT 1").get(projectId) as Row | undefined;
    return r ? toSupRun(r) : null;
  }

  listSupRunsByStatus(status: RunStatus): Run[] {
    return (this.db.prepare('SELECT * FROM runs WHERE status = ?').all(status) as Row[]).map(toSupRun);
  }

  /** Task executions (agent runs) that count against the run's max_tasks. */
  runExecutions(runId: string): number {
    return this.db.prepare('SELECT COUNT(*) FROM agent_runs a JOIN tasks t ON t.id = a.task_id WHERE t.run_id = ?').pluck().get(runId) as number;
  }

  /** Compare-and-swap on run status, like task transitions. */
  setRunStatus(runId: string, from: RunStatus[], to: RunStatus, patch: { summary?: string | null; startedAt?: boolean; finished?: boolean; reopen?: boolean } = {}): Run | null {
    const sets = ['status = @to'];
    if (patch.summary !== undefined) sets.push('summary = @summary');
    if (patch.startedAt) sets.push('started_at = @now, last_progress_at = @now');
    if (patch.finished) sets.push('finished_at = @now');
    if (patch.reopen) sets.push('finished_at = NULL');
    const res = this.db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = @id AND status IN (${from.map((_, i) => '@f' + i).join(',')})`)
      .run({ id: runId, to, now: now(), summary: patch.summary ?? null, ...Object.fromEntries(from.map((f, i) => ['f' + i, f])) });
    return res.changes ? this.getSupRun(runId) : null;
  }

  touchRun(runId: string): void {
    this.db.prepare('UPDATE runs SET last_progress_at = ? WHERE id = ?').run(now(), runId);
  }

  // ---------- pending decisions ----------
  createPending(input: { projectId: string; runId: string; taskId: string; question: string; context: string; proposed: string; alternatives: string[]; provider: string }): PendingDecision {
    const d = { id: id(), project_id: input.projectId, run_id: input.runId, task_id: input.taskId, question: input.question, context: input.context,
      proposed: input.proposed, alternatives: JSON.stringify(input.alternatives), status: 'PENDING', provider: input.provider, created_at: now() };
    this.db.prepare(`INSERT INTO decisions_pending (id, project_id, run_id, task_id, question, context, proposed, alternatives, status, provider, created_at)
      VALUES (@id, @project_id, @run_id, @task_id, @question, @context, @proposed, @alternatives, @status, @provider, @created_at)`).run(d);
    return this.getPending(d.id)!;
  }

  getPending(decisionId: string): PendingDecision | null {
    const r = this.db.prepare('SELECT * FROM decisions_pending WHERE id = ?').get(decisionId) as Row | undefined;
    return r ? toPending(r) : null;
  }

  listPending(projectId: string, onlyOpen = true): PendingDecision[] {
    return (this.db.prepare(`SELECT * FROM decisions_pending WHERE project_id = ? ${onlyOpen ? "AND status = 'PENDING'" : ''} ORDER BY created_at`).all(projectId) as Row[]).map(toPending);
  }

  openDecisionsForRun(runId: string): number {
    return this.db.prepare("SELECT COUNT(*) FROM decisions_pending WHERE run_id = ? AND status = 'PENDING'").pluck().get(runId) as number;
  }

  /** CAS: only resolves a PENDING decision. */
  resolvePending(decisionId: string, action: DecisionAction, by: string, instructions: string | null): PendingDecision | null {
    const res = this.db.prepare("UPDATE decisions_pending SET status = 'RESOLVED', resolution = ?, resolved_by = ?, instructions = ?, resolved_at = ? WHERE id = ? AND status = 'PENDING'")
      .run(action, by, instructions, now(), decisionId);
    return res.changes ? this.getPending(decisionId) : null;
  }

  listMessagesForTask(taskId: string): Message[] {
    return (this.db.prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY created_at').all(taskId) as Row[]).map(toMessage);
  }

  // ---------- decisions ----------
  addDecision(projectId: string, title: string, rationale: string, madeBy: string): Decision {
    const d = { id: id(), project_id: projectId, title, rationale, made_by: madeBy, created_at: now() };
    this.db.prepare('INSERT INTO decisions (id, project_id, title, rationale, made_by, created_at) VALUES (@id, @project_id, @title, @rationale, @made_by, @created_at)').run(d);
    this.logActivity(projectId, null, 'decision_added', madeBy, `Decision recorded: ${title}`);
    return toDecision(d);
  }

  listDecisions(projectId: string): Decision[] {
    return (this.db.prepare('SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at').all(projectId) as Row[]).map(toDecision);
  }

  // ---------- artifacts ----------
  addArtifact(input: { projectId: string; taskId: string; runId: string; path: string; kind: ArtifactKind; content: string }): Artifact {
    const a = {
      id: id(), project_id: input.projectId, task_id: input.taskId, run_id: input.runId, path: input.path,
      kind: input.kind, size: Buffer.byteLength(input.content), content: input.content, created_at: now(),
    };
    this.db.prepare('INSERT INTO artifacts (id, project_id, task_id, run_id, path, kind, size, content, created_at) VALUES (@id, @project_id, @task_id, @run_id, @path, @kind, @size, @content, @created_at)').run(a);
    return toArtifact(a);
  }

  getArtifact(artifactId: string): Artifact | null {
    const r = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifactId) as Row | undefined;
    return r ? toArtifact(r, true) : null;
  }

  listArtifacts(projectId: string): Artifact[] {
    return (this.db.prepare('SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at').all(projectId) as Row[]).map((r) => toArtifact(r));
  }

  listArtifactsForTask(taskId: string): Artifact[] {
    return (this.db.prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at').all(taskId) as Row[]).map((r) => toArtifact(r));
  }

  /** Latest artifacts (with content) for a set of runs — used to pass prior results between agents. */
  artifactsForRun(runId: string): Artifact[] {
    return (this.db.prepare('SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at').all(runId) as Row[]).map((r) => toArtifact(r, true));
  }

  // ---------- activity ----------
  logActivity(projectId: string, taskId: string | null, type: ActivityType, actor: string, message: string, data?: Record<string, unknown>): void {
    this.db.prepare('INSERT INTO activity_events (project_id, task_id, type, actor, message, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, taskId, type, actor, message, data ? JSON.stringify(data) : null, now());
  }

  /** Handoffs and leader decisions, oldest first: the supervision trail, unaffected by tool-call volume. */
  listTrail(projectId: string, limit = 80): ActivityEvent[] {
    return (this.db.prepare(`SELECT * FROM (SELECT * FROM activity_events WHERE project_id = ? AND type IN ('agent.handoff', 'decision.requested', 'decision.resolved')
      ORDER BY id DESC LIMIT ?) ORDER BY id`).all(projectId, limit) as Row[]).map(toEvent);
  }

  listActivity(projectId: string, limit = 100): ActivityEvent[] {
    return (this.db.prepare('SELECT * FROM activity_events WHERE project_id = ? ORDER BY id DESC LIMIT ?').all(projectId, limit) as Row[]).map(toEvent);
  }

  recentActivity(limit = 30): (ActivityEvent & { projectName: string })[] {
    return (this.db.prepare('SELECT e.*, p.name AS project_name FROM activity_events e JOIN projects p ON p.id = e.project_id ORDER BY e.id DESC LIMIT ?').all(limit) as Row[])
      .map((r) => ({ ...toEvent(r), projectName: r.project_name }));
  }
}

export class IllegalTransitionError extends Error {
  readonly from: TaskStatus;
  readonly to: TaskStatus;
  constructor(from: TaskStatus, to: TaskStatus) {
    super(`Cannot move a task from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}

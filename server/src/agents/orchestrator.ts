import fs from 'node:fs';
import path from 'node:path';
import {
  LEADER_SETTABLE,
  canTransition,
  type AgentRole,
  type ArtifactKind,
  type CommandResponse,
  type Task,
  type TaskStatus,
} from '../../../shared/types';
import type { Repo } from '../db/repo';
import { ApiErr, notFound } from '../http/errors';
import type { Providers } from '../providers';
import type { PriorResult, RunResult } from '../providers/types';
import { ToolBox } from '../tools/toolbox';
import { rulePlan, type Plan } from './planner';
import { ROLES } from './roles';

export const RUN_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_TASKS = 12;
export const DEFAULT_MAX_RUNTIME_MS = 2 * 60 * 60 * 1000;
export const AWAITING_APPROVAL_REASON = 'Awaiting plan approval';
const PRIOR_ARTIFACT_LIMIT = 4096;

const kindFromPath = (p: string): ArtifactKind =>
  /\.test\.m?[jt]s$/.test(p) ? 'test' : p.startsWith('reports/') ? 'report' : p.startsWith('docs/') ? 'doc' : p.endsWith('.md') ? 'note' : 'code';

export class Orchestrator {
  private readonly repo: Repo;
  private readonly providers: Providers;
  private readonly workspaceRoot: string;
  private readonly runTimeoutMs: number;
  /** One execution loop per project (D7, in-process half). */
  private readonly loops = new Map<string, Promise<void>>();

  constructor(repo: Repo, providers: Providers, workspaceRoot: string, opts: { runTimeoutMs?: number } = {}) {
    this.repo = repo;
    this.providers = providers;
    this.workspaceRoot = workspaceRoot;
    this.runTimeoutMs = opts.runTimeoutMs ?? RUN_TIMEOUT_MS;
  }

  workspaceFor(projectId: string): string {
    return path.join(this.workspaceRoot, projectId);
  }

  isBusy(projectId: string): boolean {
    return this.loops.has(projectId);
  }

  /** Boot: fail anything interrupted mid-run, then resume queued work. */
  boot(): Task[] {
    const recovered = this.repo.recoverInterrupted();
    // Resume eligible queued work: legacy tasks, and every RUNNING supervised run.
    const queued = this.repo.db.prepare("SELECT DISTINCT project_id FROM tasks WHERE status = 'QUEUED'").pluck().all() as string[];
    const running = this.repo.listSupRunsByStatus('RUNNING').map((r) => r.projectId);
    for (const pid of new Set([...queued, ...running])) void this.kick(pid);
    return recovered;
  }

  async submitCommand(projectId: string, text: string, limits: { maxTasks?: number; maxRuntimeMs?: number } = {}): Promise<CommandResponse> {
    const project = this.repo.getProject(projectId);
    if (!project) throw notFound('Project');
    const team = this.repo.listAgents(projectId).map((a) => a.role);
    if (team.length === 0) throw new ApiErr('NO_AGENTS', 'Add at least one AI teammate before sending a command');
    const active = this.repo.activeSupRun(projectId);
    if (active) throw new ApiErr('RUN_ACTIVE', `A run is ${active.status === 'AWAITING_APPROVAL' ? 'waiting for plan approval' : active.status.toLowerCase()}. Finish, cancel or discard it before sending a new command.`, { runId: active.id, status: active.status });
    const decisions = this.repo.listDecisions(projectId);

    const { planner } = this.providers;
    let plan: Plan;
    let plannerProvider: string;
    if (planner.name === 'mock') {
      plan = rulePlan(text, team);
      plannerProvider = 'rules';
    } else {
      try {
        plan = await planner.plan({ project, decisions, team, command: text });
        plannerProvider = planner.name;
      } catch (err) {
        plan = rulePlan(text, team);
        plannerProvider = `rules (fallback: ${planner.name} — ${(err as Error).message})`;
      }
    }
    if (plan.tasks.length === 0) throw new ApiErr('EMPTY_PLAN', 'Could not find any work in that command. Try describing what to build, test or document.');

    const plannerLabel = plannerProvider === 'gemma' ? 'Gemma planner' : plannerProvider === 'rules' ? 'Rule planner' : 'Rule planner (fallback)';
    const { command, tasks, run } = this.repo.db.transaction(() => {
      const command = this.repo.createCommand(projectId, text, plannerProvider, plan.note);
      this.repo.logActivity(projectId, null, 'command_received', 'leader', `Command: "${text}"`, { commandId: command.id });
      const run = this.repo.createSupRun({
        projectId, commandId: command.id, maxTasks: limits.maxTasks ?? DEFAULT_MAX_TASKS, maxRuntimeMs: limits.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS,
        plannerProvider, provider: this.providers.runner.name,
      });
      // Nothing executes until the leader approves the plan.
      const tasks = plan.tasks.map((p) => {
        const onTeam = team.includes(p.role);
        const t = this.repo.createTask({
          projectId, commandId: command.id, role: p.role, title: p.title, description: p.description, runId: run.id,
          status: 'BLOCKED',
          blockedReason: onTeam ? AWAITING_APPROVAL_REASON : `No ${ROLES[p.role].title} on the team`,
        });
        this.repo.logActivity(projectId, t.id, 'task_created', plannerLabel, `Planned: "${t.title}" → ${ROLES[t.role].title} (${t.blockedReason})`, { role: t.role, status: t.status, runId: run.id });
        return t;
      });
      this.repo.logActivity(projectId, null, 'plan_created', plannerLabel, `${plannerLabel} created ${tasks.length} task(s). ${plan.note}`.trim(), { plannerProvider, runId: run.id });
      this.repo.logActivity(projectId, null, 'run.status', 'system', `Run created — awaiting plan approval (limits: ${run.maxTasks} task runs, ${Math.round(run.maxRuntimeMs / 60000)} min)`, { runId: run.id, to: 'AWAITING_APPROVAL', provider: run.provider });
      return { command, tasks, run };
    })();

    return {
      commandId: command.id, taskIds: tasks.map((t) => t.id), tasks, plannerProvider, plannerNote: plan.note, run,
      plan: tasks.map((t) => ({ taskId: t.id, position: t.position, role: t.role, title: t.title, blockedReason: t.blockedReason === AWAITING_APPROVAL_REASON ? null : t.blockedReason })),
    };
  }

  /** Starts the project's loop if it isn't running. Returns the running loop. */
  kick(projectId: string): Promise<void> {
    const running = this.loops.get(projectId);
    if (running) return running;
    const p = this.loop(projectId).finally(() => this.loops.delete(projectId));
    this.loops.set(projectId, p);
    return p;
  }

  /** Resolves once the project has no running loop. */
  async idle(projectId: string): Promise<void> {
    for (let p = this.loops.get(projectId); p; p = this.loops.get(projectId)) await p.catch(() => {});
  }

  private async loop(projectId: string): Promise<void> {
    // Sequential, planner order (D8). claimNextQueued is a DB compare-and-swap (D7).
    for (;;) {
      const task = this.claimWithinBudget(projectId);
      if (!task) break;
      try {
        await this.execute(task);
      } catch (err) {
        // execute() handles its own failures; this is a last-resort guard so the loop never dies silently.
        this.repo.logActivity(projectId, task.id, 'system', 'system', `Orchestrator error: ${(err as Error).message}`);
        this.repo.transition(task.id, 'IN_PROGRESS', 'FAILED', { lastError: (err as Error).message });
      }
      if (task.runId) this.afterRunTask(task.id);
    }
    this.settleRuns(projectId);
  }

  /** Re-reads the run before every claim: only RUNNING runs within their task and time budget may claim. */
  private claimWithinBudget(projectId: string): Task | null {
    for (;;) {
      const next = this.repo.db.prepare(`SELECT t.id, t.run_id FROM tasks t LEFT JOIN runs r ON r.id = t.run_id
        WHERE t.project_id = ? AND t.status = 'QUEUED' AND (t.run_id IS NULL OR r.status = 'RUNNING') ORDER BY t.position LIMIT 1`).get(projectId) as { id: string; run_id: string | null } | undefined;
      if (!next) return null;
      if (next.run_id) {
        const run = this.repo.getSupRun(next.run_id)!;
        const elapsed = Date.now() - new Date(run.startedAt ?? run.createdAt).getTime();
        const why = (run.executed ?? 0) >= run.maxTasks ? `${run.executed}/${run.maxTasks} task runs used`
          : elapsed >= run.maxRuntimeMs ? `${Math.round(elapsed / 1000)}s elapsed of ${Math.round(run.maxRuntimeMs / 1000)}s` : null;
        if (why) {
          this.stopRun(run.id, 'FAILED', `Budget exhausted: ${why}`, 'Run stopped: budget exhausted');
          continue;
        }
      }
      const claimed = this.repo.claimNextQueued(projectId, next.id);
      if (claimed) return claimed;
    }
  }

  /** Moves a run to a terminal state and parks its queued tasks with a visible reason. */
  private stopRun(runId: string, to: 'FAILED' | 'CANCELLED', summary: string, taskReason: string): boolean {
    const run = this.repo.getSupRun(runId);
    if (!run) return false;
    const moved = this.repo.setRunStatus(runId, to === 'CANCELLED' ? ['AWAITING_APPROVAL', 'RUNNING', 'PAUSED'] : ['RUNNING'], to, { summary, finished: true });
    if (!moved) return false;
    for (const t of this.repo.listTasks(run.projectId).filter((t) => t.runId === runId)) {
      if (t.status === 'QUEUED') this.repo.transition(t.id, 'QUEUED', 'BLOCKED', { blockedReason: taskReason });
      else if (t.status === 'BLOCKED' && t.blockedReason === AWAITING_APPROVAL_REASON) this.repo.setTaskNote(t.id, taskReason);
    }
    this.repo.logActivity(run.projectId, null, 'run.status', to === 'CANCELLED' ? 'leader' : 'system', `Run ${to}: ${summary}`, { runId, to, provider: run.provider });
    return true;
  }

  /** After each task of a run: record progress; a failure pauses the run and asks the leader. */
  private afterRunTask(taskId: string): void {
    const task = this.repo.getTask(taskId)!;
    const run = this.repo.getSupRun(task.runId!)!;
    this.repo.touchRun(run.id);
    if (task.status === 'FAILED' && run.status === 'RUNNING') {
      this.repo.setRunStatus(run.id, ['RUNNING'], 'PAUSED', { summary: `Paused: "${task.title}" failed` });
      const d = this.repo.createPending({
        projectId: task.projectId, runId: run.id, taskId: task.id,
        question: `Task "${task.title}" failed: ${task.lastError ?? 'unknown error'}. Retry or skip?`,
        context: `${ROLES[task.role].title}, attempt ${task.attempts}`, proposed: 'retry', alternatives: ['skip'],
        provider: run.provider,
      });
      this.repo.logActivity(task.projectId, task.id, 'run.status', 'system', 'Run PAUSED: waiting for a leader decision', { runId: run.id, to: 'PAUSED' });
      this.repo.logActivity(task.projectId, task.id, 'decision.requested', 'system', d.question, { decisionId: d.id, runId: run.id, provider: d.provider });
    }
  }

  /** RUNNING runs with nothing left to claim or finish are COMPLETED. */
  private settleRuns(projectId: string): void {
    for (const r of this.repo.listSupRunsByStatus('RUNNING').filter((x) => x.projectId === projectId)) {
      const tasks = this.repo.listTasks(projectId).filter((t) => t.runId === r.id);
      if (tasks.some((t) => t.status === 'QUEUED' || t.status === 'IN_PROGRESS')) continue;
      const count = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;
      const summary = `${tasks.length} task(s): ${count('REVIEW') + count('COMPLETED')} done, ${count('FAILED')} failed, ${count('BLOCKED')} blocked`;
      if (this.repo.setRunStatus(r.id, ['RUNNING'], 'COMPLETED', { summary, finished: true })) {
        this.repo.logActivity(projectId, null, 'run.status', 'system', `Run COMPLETED — ${summary}`, { runId: r.id, to: 'COMPLETED', provider: r.provider });
      }
    }
  }

  // ---------- run controls (leader) ----------

  approveRun(runId: string) {
    const run = this.repo.getSupRun(runId);
    if (!run) throw notFound('Run');
    if (run.status !== 'AWAITING_APPROVAL') throw new ApiErr('INVALID_TRANSITION', `Only a run awaiting approval can be approved (run is ${run.status})`);
    const moved = this.repo.db.transaction(() => {
      const m = this.repo.setRunStatus(runId, ['AWAITING_APPROVAL'], 'RUNNING', { startedAt: true });
      if (!m) return null;
      for (const t of this.repo.listTasks(run.projectId).filter((t) => t.runId === runId && t.status === 'BLOCKED' && t.blockedReason === AWAITING_APPROVAL_REASON)) {
        this.repo.transition(t.id, 'BLOCKED', 'QUEUED', { blockedReason: null });
      }
      return m;
    })();
    if (!moved) throw new ApiErr('STALE', 'Run changed meanwhile; refresh and try again');
    this.repo.logActivity(run.projectId, null, 'run.status', 'leader', 'Plan approved — run RUNNING', { runId, to: 'RUNNING', provider: run.provider });
    void this.kick(run.projectId);
    return this.repo.getSupRun(runId)!;
  }

  pauseRun(runId: string) {
    const run = this.repo.getSupRun(runId);
    if (!run) throw notFound('Run');
    if (run.status !== 'RUNNING') throw new ApiErr('INVALID_TRANSITION', `Only a RUNNING run can be paused (run is ${run.status})`);
    if (!this.repo.setRunStatus(runId, ['RUNNING'], 'PAUSED', { summary: 'Paused by the leader' })) throw new ApiErr('STALE', 'Run changed meanwhile; refresh and try again');
    this.repo.logActivity(run.projectId, null, 'run.status', 'leader', 'Run PAUSED by the leader (the current task, if any, finishes first)', { runId, to: 'PAUSED' });
    return this.repo.getSupRun(runId)!;
  }

  resumeRun(runId: string) {
    const run = this.repo.getSupRun(runId);
    if (!run) throw notFound('Run');
    if (run.status !== 'PAUSED') throw new ApiErr('INVALID_TRANSITION', `Only a PAUSED run can be resumed (run is ${run.status})`);
    if (this.repo.openDecisionsForRun(runId) > 0) throw new ApiErr('INVALID_TRANSITION', 'Resolve the pending decision first');
    if (!this.repo.setRunStatus(runId, ['PAUSED'], 'RUNNING', { summary: null })) throw new ApiErr('STALE', 'Run changed meanwhile; refresh and try again');
    this.repo.logActivity(run.projectId, null, 'run.status', 'leader', 'Run resumed', { runId, to: 'RUNNING' });
    void this.kick(run.projectId);
    return this.repo.getSupRun(runId)!;
  }

  cancelRun(runId: string) {
    const run = this.repo.getSupRun(runId);
    if (!run) throw notFound('Run');
    if (!['AWAITING_APPROVAL', 'RUNNING', 'PAUSED'].includes(run.status)) throw new ApiErr('INVALID_TRANSITION', `A ${run.status} run cannot be cancelled`);
    const label = run.status === 'AWAITING_APPROVAL' ? 'Plan discarded by the leader' : 'Cancelled by the leader';
    if (!this.stopRun(runId, 'CANCELLED', label, 'Run cancelled')) throw new ApiErr('STALE', 'Run changed meanwhile; refresh and try again');
    for (const d of this.repo.listPending(run.projectId).filter((d) => d.runId === runId)) this.repo.resolvePending(d.id, 'reject', 'system', 'Run cancelled');
    return this.repo.getSupRun(runId)!;
  }

  /** Leader answers a failure decision: approve = retry the task, reject = skip it. Either way the run continues. */
  resolveDecision(decisionId: string, action: 'approve' | 'reject', instructions?: string) {
    const d = this.repo.getPending(decisionId);
    if (!d) throw notFound('Decision');
    if (d.status !== 'PENDING') throw new ApiErr('INVALID_TRANSITION', 'This decision was already resolved');
    const task = this.repo.getTask(d.taskId)!;
    const note = instructions?.trim() || null;
    const out = this.repo.db.transaction(() => {
      const resolved = this.repo.resolvePending(decisionId, action, 'leader', note);
      if (!resolved) return null;
      if (note) this.repo.addMessage(task.projectId, task.id, 'leader', note);
      if (action === 'approve') {
        this.repo.transition(task.id, 'FAILED', 'QUEUED', { lastError: null });
      } else {
        this.repo.setTaskNote(task.id, 'Skipped by leader');
        this.repo.addMessage(task.projectId, task.id, 'leader', 'Skipped by leader');
      }
      this.repo.addDecision(task.projectId, `${action === 'approve' ? 'Retry' : 'Skip'} "${task.title}" after failure`, note ?? (action === 'approve' ? 'Leader chose to retry' : 'Leader chose to skip'), 'leader');
      this.repo.setRunStatus(d.runId, ['PAUSED'], 'RUNNING', { summary: null });
      this.repo.logActivity(task.projectId, task.id, 'decision.resolved', 'leader', `${action === 'approve' ? 'Approved retry of' : 'Rejected (skipped)'} "${task.title}"${note ? ` — note: ${note}` : ''}`, { decisionId, action, runId: d.runId, provider: d.provider });
      return resolved;
    })();
    if (!out) throw new ApiErr('STALE', 'Decision changed meanwhile; refresh and try again');
    void this.kick(task.projectId);
    return out;
  }

  /** Leader actions on a task re-check its run: gated while awaiting approval or cancelled, reopen a finished run. */
  private reopenRunFor(task: Task): void {
    if (!task.runId) return;
    const run = this.repo.getSupRun(task.runId)!;
    if (run.status === 'AWAITING_APPROVAL') throw new ApiErr('INVALID_TRANSITION', 'Approve the plan first');
    if (run.status === 'CANCELLED') throw new ApiErr('INVALID_TRANSITION', 'This task belongs to a cancelled run');
    if (run.status === 'COMPLETED' || run.status === 'FAILED') {
      if (this.repo.setRunStatus(run.id, [run.status], 'RUNNING', { reopen: true, summary: null })) {
        this.repo.logActivity(run.projectId, task.id, 'run.status', 'leader', `Run reopened for "${task.title}"`, { runId: run.id, to: 'RUNNING' });
      }
    }
  }

  private async execute(task: Task): Promise<void> {
    const project = this.repo.getProject(task.projectId)!;
    const role = ROLES[task.role];
    const { runner } = this.providers;
    const run = this.repo.createRun(task, runner.name);
    this.repo.logActivity(task.projectId, task.id, 'task_status', role.title, `"${task.title}" → IN_PROGRESS (attempt ${task.attempts})`, { from: 'QUEUED', to: 'IN_PROGRESS' });
    this.repo.logActivity(task.projectId, task.id, 'run_started', role.title, `${role.title} started "${task.title}" (provider: ${runner.name})`, { runId: run.id, provider: runner.name });

    this.restoreWorkspace(task.projectId);
    const tools = new ToolBox(this.workspaceFor(task.projectId), role.tools, (tool, summary, data) =>
      this.repo.logActivity(task.projectId, task.id, 'tool_call', role.title, summary, { tool, runId: run.id, ...data }),
    );

    const ac = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    let result: RunResult;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ac.abort();
          reject(new Error(`Run timed out after ${Math.round(this.runTimeoutMs / 1000)}s`));
        }, this.runTimeoutMs);
      });
      result = await Promise.race([
        runner.run(
          {
            project, decisions: this.repo.listDecisions(task.projectId), team: this.repo.listAgents(task.projectId).map((a) => a.role),
            task, role, attempt: task.attempts, priorResults: this.priorResults(task), signal: ac.signal,
            leaderNotes: this.repo.listMessagesForTask(task.id).filter((m) => m.author === 'leader').map((m) => m.body),
          },
          tools,
        ),
        timeout,
      ]);
    } catch (err) {
      result = { ok: false, summary: 'Run failed', error: (err as Error).message };
    } finally {
      clearTimeout(timer);
    }

    // Record every file the agent wrote. The DB copy is what the viewer serves (D10).
    for (const rel of [...new Set(tools.written)]) {
      const full = tools.resolve(rel);
      if (!fs.existsSync(full)) continue;
      const a = this.repo.addArtifact({
        projectId: task.projectId, taskId: task.id, runId: run.id, path: rel,
        kind: result.kinds?.[rel] ?? kindFromPath(rel), content: fs.readFileSync(full, 'utf8'),
      });
      this.repo.logActivity(task.projectId, task.id, 'artifact_created', role.title, `Deliverable: ${rel}`, { artifactId: a.id, path: rel });
    }

    this.repo.finishRun(run.id, result.ok ? 'succeeded' : 'failed', result.summary, result.ok ? null : result.error ?? 'failed');
    this.repo.addMessage(task.projectId, task.id, role.title, result.ok ? result.summary : `${result.summary}: ${result.error ?? ''}`);

    const to: TaskStatus = result.ok ? 'REVIEW' : 'FAILED';
    const moved = this.repo.transition(task.id, 'IN_PROGRESS', to, result.ok ? { summary: result.summary, lastError: null } : { lastError: result.error ?? 'failed' });
    if (moved) {
      this.repo.logActivity(task.projectId, task.id, 'task_status', role.title, `"${task.title}" → ${to}${result.ok ? '' : `: ${result.error}`}`, { from: 'IN_PROGRESS', to });
    } else {
      this.repo.logActivity(task.projectId, task.id, 'system', 'system', `Run finished but "${task.title}" was moved by the leader meanwhile; result kept, status unchanged.`);
    }
    this.repo.logActivity(task.projectId, task.id, 'run_finished', role.title, `${role.title} ${result.ok ? 'finished' : 'failed'} "${task.title}"`, { runId: run.id, ok: result.ok });
  }

  /** The DB is the source of truth: re-create any workspace file that went missing (latest version per path). */
  restoreWorkspace(projectId: string): number {
    const root = this.workspaceFor(projectId);
    const rows = this.repo.db
      .prepare('SELECT path, content FROM artifacts WHERE project_id = ? ORDER BY created_at, rowid')
      .all(projectId) as { path: string; content: string }[];
    const latest = new Map(rows.map((r) => [r.path, r.content]));
    let restored = 0;
    for (const [rel, content] of latest) {
      const full = path.resolve(root, rel);
      if (!full.startsWith(path.resolve(root) + path.sep) || fs.existsSync(full)) continue;
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      restored++;
    }
    if (restored) this.repo.logActivity(projectId, null, 'system', 'system', `Restored ${restored} workspace file(s) from the database`);
    return restored;
  }

  /** Summaries + artifact contents of finished teammates' work, passed to the next agent (D8). */
  priorResults(task: Task): PriorResult[] {
    return this.repo
      .listTasks(task.projectId)
      .filter((t) => t.id !== task.id && (t.status === 'REVIEW' || t.status === 'COMPLETED'))
      .map((t) => {
        const run = this.repo.listRunsForTask(t.id).filter((r) => r.status === 'succeeded').at(-1);
        const artifacts = run
          ? this.repo.artifactsForRun(run.id).map((a) => ({
              path: a.path, kind: a.kind,
              content: (a.content ?? '').slice(0, PRIOR_ARTIFACT_LIMIT),
              truncated: (a.content ?? '').length > PRIOR_ARTIFACT_LIMIT,
            }))
          : [];
        return { taskId: t.id, role: t.role, title: t.title, status: t.status, summary: t.summary, artifacts };
      });
  }

  // ---------- leader actions ----------

  retry(taskId: string): Task {
    const task = this.repo.getTask(taskId);
    if (!task) throw notFound('Task');
    if (task.status !== 'FAILED') throw new ApiErr('INVALID_TRANSITION', `Only FAILED tasks can be retried (task is ${task.status})`);
    if (task.runId && this.repo.listPending(task.projectId).some((d) => d.taskId === task.id)) throw new ApiErr('INVALID_TRANSITION', 'This failure has a pending decision — approve or reject it there');
    this.reopenRunFor(task);
    const moved = this.repo.transition(taskId, 'FAILED', 'QUEUED', { lastError: null });
    if (!moved) throw new ApiErr('STALE', 'Task changed meanwhile; refresh and try again');
    this.repo.logActivity(task.projectId, taskId, 'leader_action', 'leader', `Retry requested for "${task.title}"`, { from: 'FAILED', to: 'QUEUED' });
    void this.kick(task.projectId);
    return moved;
  }

  updateTask(taskId: string, patch: { status?: TaskStatus; blockedReason?: string; note?: string }): Task {
    const task = this.repo.getTask(taskId);
    if (!task) throw notFound('Task');
    let result = task;
    if (patch.status && patch.status !== task.status) {
      const to = patch.status;
      if (!LEADER_SETTABLE.includes(to)) throw new ApiErr('INVALID_TRANSITION', `The leader cannot set a task to ${to}`);
      if (!canTransition(task.status, to)) throw new ApiErr('INVALID_TRANSITION', `Cannot move a task from ${task.status} to ${to}`, { from: task.status, to });
      if (task.status === 'BLOCKED' && to === 'QUEUED') {
        const team = this.repo.listAgents(task.projectId).map((a) => a.role as AgentRole);
        if (!team.includes(task.role)) throw new ApiErr('NO_AGENTS', `Add a ${ROLES[task.role].title} to the team before unblocking this task`);
        this.reopenRunFor(task);
      }
      const moved = this.repo.transition(taskId, task.status, to, {
        blockedReason: to === 'BLOCKED' ? patch.blockedReason?.trim() || 'Blocked by the team leader' : null,
      });
      if (!moved) throw new ApiErr('STALE', 'Task changed meanwhile; refresh and try again');
      const verb = to === 'COMPLETED' ? 'Approved' : to === 'QUEUED' ? 'Unblocked' : 'Blocked';
      this.repo.logActivity(task.projectId, taskId, 'leader_action', 'leader', `${verb} "${task.title}" (${task.status} → ${to})`, { from: task.status, to });
      result = moved;
      if (to === 'QUEUED') void this.kick(task.projectId);
    }
    if (patch.note?.trim()) this.repo.addMessage(task.projectId, taskId, 'leader', patch.note.trim());
    return result;
  }
}

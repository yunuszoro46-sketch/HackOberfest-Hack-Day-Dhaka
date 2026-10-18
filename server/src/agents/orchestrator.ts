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
    const queued = this.repo.db.prepare("SELECT DISTINCT project_id FROM tasks WHERE status = 'QUEUED'").pluck().all() as string[];
    for (const pid of queued) void this.kick(pid);
    return recovered;
  }

  async submitCommand(projectId: string, text: string): Promise<CommandResponse> {
    const project = this.repo.getProject(projectId);
    if (!project) throw notFound('Project');
    const team = this.repo.listAgents(projectId).map((a) => a.role);
    if (team.length === 0) throw new ApiErr('NO_AGENTS', 'Add at least one AI teammate before sending a command');
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
    const { command, tasks } = this.repo.db.transaction(() => {
      const command = this.repo.createCommand(projectId, text, plannerProvider, plan.note);
      this.repo.logActivity(projectId, null, 'command_received', 'leader', `Command: "${text}"`, { commandId: command.id });
      const tasks = plan.tasks.map((p) => {
        const onTeam = team.includes(p.role);
        const t = this.repo.createTask({
          projectId, commandId: command.id, role: p.role, title: p.title, description: p.description,
          status: onTeam ? 'QUEUED' : 'BLOCKED',
          blockedReason: onTeam ? null : `No ${ROLES[p.role].title} on the team`,
        });
        this.repo.logActivity(projectId, t.id, 'task_created', plannerLabel, `${t.status === 'BLOCKED' ? 'Blocked' : 'Queued'}: "${t.title}" → ${ROLES[t.role].title}${t.blockedReason ? ` (${t.blockedReason})` : ''}`, { role: t.role, status: t.status });
        return t;
      });
      this.repo.logActivity(projectId, null, 'plan_created', plannerLabel, `${plannerLabel} created ${tasks.length} task(s). ${plan.note}`.trim(), { plannerProvider });
      return { command, tasks };
    })();

    void this.kick(projectId);
    return { commandId: command.id, taskIds: tasks.map((t) => t.id), tasks, plannerProvider, plannerNote: plan.note };
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
    for (let task = this.repo.claimNextQueued(projectId); task; task = this.repo.claimNextQueued(projectId)) {
      try {
        await this.execute(task);
      } catch (err) {
        // execute() handles its own failures; this is a last-resort guard so the loop never dies silently.
        this.repo.logActivity(projectId, task.id, 'system', 'system', `Orchestrator error: ${(err as Error).message}`);
        this.repo.transition(task.id, 'IN_PROGRESS', 'FAILED', { lastError: (err as Error).message });
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

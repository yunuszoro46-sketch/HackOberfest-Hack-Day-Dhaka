import type { AgentRole, ArtifactKind, Decision, Project, RoleDefinition, Task } from '../../../shared/types';
import type { Plan } from '../agents/planner';
import type { ToolBox } from '../tools/toolbox';

export interface PlanContext {
  project: Project;
  decisions: Decision[];
  team: AgentRole[];
  command: string;
  signal?: AbortSignal;
}

export interface PriorResult {
  taskId: string;
  role: AgentRole;
  title: string;
  status: string;
  summary: string | null;
  artifacts: { path: string; kind: ArtifactKind; content: string; truncated: boolean }[];
}

export interface RunContext {
  project: Project;
  decisions: Decision[];
  team: AgentRole[];
  task: Task;
  role: RoleDefinition;
  attempt: number;
  priorResults: PriorResult[];
  /** Notes the leader attached to this task (e.g. decision instructions). */
  leaderNotes: string[];
  /** Why this task's previous attempt failed, if it did. */
  previousError: string | null;
  signal: AbortSignal;
}

export interface RunResult {
  ok: boolean;
  summary: string;
  /** Why the run failed (ok=false). */
  error?: string;
  /** Kind for each file the agent wrote; files not listed default by extension. */
  kinds?: Record<string, ArtifactKind>;
  /** Who actually did the work, e.g. "gemini:gemini-2.5-flash" or "deterministic". Defaults to the runner's name. */
  provider?: string;
  /** Checks the agent really ran before handing off, e.g. "run-tests: 7 passed, 0 failed (exit 0)". */
  checks?: string[];
  /** Assumptions and open questions the next teammate or the leader should know about. */
  unknowns?: string[];
}

export interface AgentProvider {
  readonly name: string;
  /** What to record as plannerProvider when this provider's plan is used (defaults to name), e.g. "gemma:gemma-4-26b-a4b-it". */
  readonly label?: string;
  /** Per-task time limit; model-driven runners need longer than templates. */
  readonly runTimeoutMs?: number;
  plan(ctx: PlanContext): Promise<Plan>;
  run(ctx: RunContext, tools: ToolBox): Promise<RunResult>;
}

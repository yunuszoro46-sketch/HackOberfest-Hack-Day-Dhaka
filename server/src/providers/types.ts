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
  signal: AbortSignal;
}

export interface RunResult {
  ok: boolean;
  summary: string;
  /** Why the run failed (ok=false). */
  error?: string;
  /** Kind for each file the agent wrote; files not listed default by extension. */
  kinds?: Record<string, ArtifactKind>;
}

export interface AgentProvider {
  readonly name: string;
  plan(ctx: PlanContext): Promise<Plan>;
  run(ctx: RunContext, tools: ToolBox): Promise<RunResult>;
}

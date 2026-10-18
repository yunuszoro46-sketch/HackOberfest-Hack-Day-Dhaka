// Shared API contract between client and server. Everything types against this file.

export const TASK_STATUSES = ['QUEUED', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'COMPLETED', 'FAILED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Legal state transitions (D6). COMPLETED is terminal. */
export const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  QUEUED: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['REVIEW', 'FAILED', 'BLOCKED'],
  REVIEW: ['COMPLETED'],
  FAILED: ['QUEUED'],
  BLOCKED: ['QUEUED'],
  COMPLETED: [],
};

/** Statuses the team leader may set by hand via PATCH. Never IN_PROGRESS. */
export const LEADER_SETTABLE: readonly TaskStatus[] = ['COMPLETED', 'QUEUED', 'BLOCKED'];

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const AGENT_ROLES = ['frontend', 'backend', 'aiml', 'qa', 'researcher', 'docs'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export type ToolName = 'write_file' | 'read_file' | 'list_files' | 'run_approved';
export type ApprovedCommand = 'syntax-check' | 'run-tests';

export interface RoleDefinition {
  role: AgentRole;
  title: string;
  tagline: string;
  instructions: string;
  responsibilities: string[];
  tools: ToolName[];
  outputStructure: string;
  completionCriteria: string[];
}

export interface Project {
  id: string;
  name: string;
  goal: string;
  constraints: string;
  createdAt: string;
  agents?: ProjectAgent[];
  taskCounts?: Partial<Record<TaskStatus, number>>;
  decisions?: Decision[];
}

export interface ProjectAgent {
  id: string;
  projectId: string;
  role: AgentRole;
  createdAt: string;
}

export interface Command {
  id: string;
  projectId: string;
  text: string;
  plannerProvider: string;
  plannerNote: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  commandId: string | null;
  role: AgentRole;
  title: string;
  description: string;
  status: TaskStatus;
  position: number;
  attempts: number;
  blockedReason: string | null;
  lastError: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = 'running' | 'succeeded' | 'failed';

export interface AgentRun {
  id: string;
  taskId: string;
  projectId: string;
  role: AgentRole;
  provider: string;
  attempt: number;
  status: RunStatus;
  summary: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface Message {
  id: string;
  projectId: string;
  taskId: string | null;
  author: string;
  body: string;
  createdAt: string;
}

export interface Decision {
  id: string;
  projectId: string;
  title: string;
  rationale: string;
  madeBy: string;
  createdAt: string;
}

export type ArtifactKind = 'code' | 'test' | 'report' | 'doc' | 'note';

export interface Artifact {
  id: string;
  projectId: string;
  taskId: string;
  runId: string;
  path: string;
  kind: ArtifactKind;
  size: number;
  createdAt: string;
  content?: string;
}

export type ActivityType =
  | 'project_created'
  | 'agents_updated'
  | 'command_received'
  | 'plan_created'
  | 'task_created'
  | 'task_status'
  | 'run_started'
  | 'run_finished'
  | 'tool_call'
  | 'artifact_created'
  | 'decision_added'
  | 'leader_action'
  | 'system';

export interface ActivityEvent {
  id: number;
  projectId: string;
  taskId: string | null;
  type: ActivityType;
  actor: string;
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskDetail extends Task {
  runs: AgentRun[];
  messages: Message[];
  artifacts: Artifact[];
}

export interface ArtifactDetail extends Artifact {
  content: string;
  run: AgentRun | null;
  task: Task | null;
}

export interface ProjectSnapshot {
  project: Project;
  agents: ProjectAgent[];
  tasks: Task[];
  runs: AgentRun[];
  artifacts: Artifact[];
  activity: ActivityEvent[];
  decisions: Decision[];
  commands: Command[];
  busy: boolean;
}

export interface CommandResponse {
  commandId: string;
  taskIds: string[];
  tasks: Task[];
  plannerProvider: string;
  plannerNote: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'NO_AGENTS'
  | 'STALE'
  | 'EMPTY_PLAN'
  | 'INTERNAL';

export interface ApiError {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

import type {
  ActivityEvent, Artifact, ArtifactDetail, CommandResponse, Decision, Project, ProjectAgent, ProjectSnapshot,
  RoleDefinition, Task, TaskDetail, TaskStatus, AgentRole, Run, PendingDecision, DecisionAction,
} from '../../shared/types';
import type { IdeaInput, IdeaReport } from '../../shared/idea-report';
import type { IdeaResearchResult } from '../../shared/idea-research';
import type { IdeaRun, IdeaRunDetail } from '../../shared/idea-run';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', 'Cannot reach the TeamMate server. Is it running?', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(e?.code ?? 'INTERNAL', e?.message ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const api = {
  roles: () => req<RoleDefinition[]>('GET', '/api/roles'),
  health: () => req<{ ok: boolean; plannerProvider: string; runnerProvider: string }>('GET', '/api/health'),
  projects: () => req<Project[]>('GET', '/api/projects'),
  project: (id: string) => req<Project & { agents: ProjectAgent[]; decisions: Decision[] }>('GET', `/api/projects/${id}`),
  createProject: (b: { name: string; goal: string; constraints: string }) => req<Project>('POST', '/api/projects', b),
  setAgents: (id: string, roles: AgentRole[]) => req<ProjectAgent[]>('PUT', `/api/projects/${id}/agents`, { agents: roles.map((role) => ({ role })) }),
  snapshot: (id: string) => req<ProjectSnapshot>('GET', `/api/projects/${id}/snapshot`),
  command: (id: string, text: string) => req<CommandResponse>('POST', `/api/projects/${id}/commands`, { text }),
  addDecision: (id: string, b: { title: string; rationale: string }) => req<Decision>('POST', `/api/projects/${id}/decisions`, b),
  task: (id: string) => req<TaskDetail>('GET', `/api/tasks/${id}`),
  patchTask: (id: string, b: { status?: TaskStatus; blockedReason?: string; note?: string }) => req<Task>('PATCH', `/api/tasks/${id}`, b),
  retry: (id: string) => req<Task>('POST', `/api/tasks/${id}/retry`),
  artifacts: (projectId: string) => req<Artifact[]>('GET', `/api/projects/${projectId}/artifacts`),
  artifact: (id: string) => req<ArtifactDetail>('GET', `/api/artifacts/${id}`),
  approveRun: (id: string) => req<Run>('POST', `/api/runs/${id}/approve`),
  pauseRun: (id: string) => req<Run>('POST', `/api/runs/${id}/pause`),
  resumeRun: (id: string) => req<Run>('POST', `/api/runs/${id}/resume`),
  cancelRun: (id: string) => req<Run>('POST', `/api/runs/${id}/cancel`),
  resolveDecision: (id: string, action: DecisionAction, instructions?: string) =>
    req<PendingDecision>('POST', `/api/decisions/${id}`, { action, ...(instructions?.trim() ? { instructions } : {}) }),
  recentActivity: () => req<(ActivityEvent & { projectName: string })[]>('GET', '/api/activity/recent'),
  createIdeaReport: (input: IdeaInput) => req<IdeaReport>('POST', '/api/ideas/report', input),
  researchIdea: (input: IdeaInput) =>
    req<IdeaResearchResult>('POST', '/api/ideas/research', { ...input, confirmed: true }),
  createIdeaRun: (input: IdeaInput, maxCalls: number) =>
    req<IdeaRunDetail>('POST', '/api/ideas/runs', { ...input, maxCalls }),
  ideaRun: (id: string) => req<IdeaRunDetail>('GET', `/api/ideas/runs/${id}`),
  approveIdeaRun: (id: string) => req<IdeaRun>('POST', `/api/ideas/runs/${id}/approve`),
  cancelIdeaRun: (id: string) => req<IdeaRun>('POST', `/api/ideas/runs/${id}/cancel`),
};

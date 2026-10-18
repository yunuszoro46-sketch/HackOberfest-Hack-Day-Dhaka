import type {
  ActivityEvent, ArtifactDetail, CommandResponse, Decision, Project, ProjectAgent, ProjectSnapshot,
  RoleDefinition, Task, TaskDetail, TaskStatus, AgentRole,
} from '../../shared/types';

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
  artifact: (id: string) => req<ArtifactDetail>('GET', `/api/artifacts/${id}`),
  recentActivity: () => req<(ActivityEvent & { projectName: string })[]>('GET', '/api/activity/recent'),
};

import { describe, expect, it } from 'vitest';
import { createDemoProject, DEMO_COMMAND, makeApp } from './helpers';

describe('orchestrator', () => {
  it('202s immediately, runs each task exactly once, ends in REVIEW', async () => {
    const { http, orch, repo } = makeApp();
    const pid = await createDemoProject(http);
    const res = await http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND });
    expect(res.status).toBe(202);
    expect(res.body.tasks).toHaveLength(4);
    expect(res.body.plannerProvider).toBe('rules');
    expect((await http.post(`/api/runs/${res.body.run.id}/approve`)).status).toBe(200);

    // Concurrent kicks must not double-run anything.
    const p1 = orch.kick(pid);
    const p2 = orch.kick(pid);
    expect(p1).toBe(p2);
    await orch.idle(pid);

    const tasks = repo.listTasks(pid);
    expect(tasks.map((t) => t.status)).toEqual(['REVIEW', 'REVIEW', 'REVIEW', 'BLOCKED']);
    for (const t of tasks.slice(0, 3)) expect(repo.listRunsForTask(t.id)).toHaveLength(1);
    expect(repo.listRunsForTask(tasks[3].id)).toHaveLength(0);
  });
});

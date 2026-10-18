import { describe, expect, it } from 'vitest';
import { commandAndRun, createDemoProject, DEMO_COMMAND, makeApp } from './helpers';

const runOf = async (a: ReturnType<typeof makeApp>, id: string) => (await a.http.get(`/api/runs/${id}`)).body;

describe('supervised runs', () => {
  it('nothing executes before the plan is approved', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    const cmd = await a.http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND });
    expect(cmd.status).toBe(202);
    expect(cmd.body.run.status).toBe('AWAITING_APPROVAL');
    expect(cmd.body.plan.map((p: any) => [p.role, p.blockedReason])).toEqual([
      ['frontend', null], ['frontend', null], ['qa', null], ['docs', 'No Documentation Writer on the team'],
    ]);
    await a.orch.idle(pid);
    expect(a.repo.runExecutions(cmd.body.run.id)).toBe(0);
    expect(a.repo.listTasks(pid).every((t) => t.status === 'BLOCKED')).toBe(true);
    // No side doors: unblocking a task or sending another command is refused while awaiting approval.
    expect((await a.http.patch(`/api/tasks/${cmd.body.taskIds[0]}`).send({ status: 'QUEUED' })).status).toBe(409);
    const second = await a.http.post(`/api/projects/${pid}/commands`).send({ text: 'build a form' });
    expect([second.status, second.body.error.code]).toEqual([409, 'RUN_ACTIVE']);
    // Illegal run transitions
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/pause`)).status).toBe(409);
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/resume`)).status).toBe(409);
    expect((await a.http.post(`/api/runs/nope/approve`)).status).toBe(404);
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/approve`)).status).toBe(200);
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/approve`)).status).toBe(409);
    await a.orch.idle(pid);
    const run = await runOf(a, cmd.body.run.id);
    expect(run.status).toBe('COMPLETED');
    expect(run.startedAt).toBeTruthy();
    expect(run.executed).toBe(3);
    a.db.close();
  });

  it('pause stops new claims; resume continues', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    const cmd = await a.http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND });
    await a.http.post(`/api/runs/${cmd.body.run.id}/approve`);
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/pause`)).body.status).toBe('PAUSED');
    await a.orch.idle(pid);
    expect(a.repo.runExecutions(cmd.body.run.id)).toBeLessThanOrEqual(1);
    expect(a.repo.listTasks(pid).filter((t) => t.status === 'QUEUED').length).toBeGreaterThanOrEqual(2);
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/resume`)).body.status).toBe('RUNNING');
    await a.orch.idle(pid);
    expect((await runOf(a, cmd.body.run.id)).status).toBe('COMPLETED');
    expect(a.repo.listTasks(pid).map((t) => t.status)).toEqual(['REVIEW', 'REVIEW', 'REVIEW', 'BLOCKED']);
    a.db.close();
  });

  it('max_tasks=1 stops the run with a budget summary', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    const cmd = await a.http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND, maxTasks: 1 });
    await a.http.post(`/api/runs/${cmd.body.run.id}/approve`);
    await a.orch.idle(pid);
    const run = await runOf(a, cmd.body.run.id);
    expect(run.status).toBe('FAILED');
    expect(run.summary).toMatch(/^Budget exhausted: 1\/1 task runs used/);
    expect(run.executed).toBe(1);
    const tasks = a.repo.listTasks(pid);
    expect(tasks[1]).toMatchObject({ status: 'BLOCKED', blockedReason: 'Run stopped: budget exhausted' });
    a.db.close();
  });

  it('cancel parks queued tasks; discard works on an unapproved plan', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    const cmd = await a.http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND });
    const c = await a.http.post(`/api/runs/${cmd.body.run.id}/cancel`);
    expect(c.body).toMatchObject({ status: 'CANCELLED', summary: 'Plan discarded by the leader' });
    expect(a.repo.listTasks(pid)[0]).toMatchObject({ status: 'BLOCKED', blockedReason: 'Run cancelled' });
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/cancel`)).status).toBe(409);
    expect((await a.http.post(`/api/projects/${pid}/commands`).send({ text: 'build a form' })).status).toBe(202);
    a.db.close();
  });

  it('a RUNNING run resumes after restart', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    const cmd = await a.http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND });
    // Approve at the DB level without kicking, as if the process died right after approval.
    a.repo.setRunStatus(cmd.body.run.id, ['AWAITING_APPROVAL'], 'RUNNING', { startedAt: true });
    for (const id of cmd.body.taskIds.slice(0, 3)) a.repo.transition(id, 'BLOCKED', 'QUEUED', { blockedReason: null });
    a.db.close();
    const b = makeApp({ dir: a.dir });
    await b.orch.idle(pid);
    expect(b.repo.listTasks(pid).map((t) => t.status)).toEqual(['REVIEW', 'REVIEW', 'REVIEW', 'BLOCKED']);
    expect((await runOf(b, cmd.body.run.id)).status).toBe('COMPLETED');
    b.db.close();
  });
});

describe('failure decisions', () => {
  it('reject leaves the task FAILED and the run continues', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    const cmd = await commandAndRun(a, pid, 'simulate a failure, build a signup form');
    let snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.run.status).toBe('PAUSED');
    expect(snap.pendingDecisions).toHaveLength(1);
    const d = snap.pendingDecisions[0];
    expect(d).toMatchObject({ proposed: 'retry', alternatives: ['skip'], provider: 'mock' });
    expect(d.question).toMatch(/^Task "Simulated failure \(demo\)" failed: .+ Retry or skip\?$/);
    expect(a.repo.listTasks(pid)[1].status).toBe('QUEUED'); // second task not run while paused
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/resume`)).status).toBe(409); // decide first
    const r = await a.http.post(`/api/decisions/${d.id}`).send({ action: 'reject' });
    expect(r.body).toMatchObject({ status: 'RESOLVED', resolution: 'reject', resolvedBy: 'leader' });
    await a.orch.idle(pid);
    snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.tasks.map((t: any) => t.status)).toEqual(['FAILED', 'REVIEW']);
    expect(snap.tasks[0].blockedReason).toBe('Skipped by leader');
    expect(snap.run.status).toBe('COMPLETED');
    expect(snap.pendingDecisions).toHaveLength(0);
    expect(snap.activity.some((e: any) => e.type === 'decision.resolved' && e.actor === 'leader' && e.data.action === 'reject')).toBe(true);
    expect((await a.http.post(`/api/decisions/${d.id}`).send({ action: 'approve' })).status).toBe(409);
    a.db.close();
  });

  it('approve retries; instructions are stored and visible on the task', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    const cmd = await commandAndRun(a, pid, 'simulate a failure');
    const d = (await a.http.get(`/api/projects/${pid}/snapshot`)).body.pendingDecisions[0];
    await a.http.post(`/api/decisions/${d.id}`).send({ action: 'approve', instructions: 'Try again with the cached data' });
    await a.orch.idle(pid);
    const t = (await a.http.get(`/api/tasks/${cmd.body.taskIds[0]}`)).body;
    expect(t.status).toBe('REVIEW');
    expect(t.attempts).toBe(2);
    expect(t.messages.some((m: any) => m.author === 'leader' && m.body === 'Try again with the cached data')).toBe(true);
    expect(a.repo.getPending(d.id)?.instructions).toBe('Try again with the cached data');
    expect(a.repo.listDecisions(pid).some((x) => x.rationale === 'Try again with the cached data')).toBe(true);
    expect(await (await a.http.get(`/api/runs/${cmd.body.run.id}`)).body.status).toBe('COMPLETED');
    a.db.close();
  });
});

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
  it('a real QA failure pauses the run and proposes sending it back; skip leaves QA FAILED', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    const cmd = await commandAndRun(a, pid, 'simulate a failure, build a signup form');
    expect(cmd.body.tasks.map((t: any) => [t.role, t.title])).toEqual([['frontend', 'Build a signup form'], ['qa', 'Test edge cases']]);
    expect(cmd.body.tasks[0].description).toContain('[Demo fault injection]');
    let snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.run.status).toBe('PAUSED');
    expect(snap.tasks.map((t: any) => t.status)).toEqual(['REVIEW', 'FAILED']);
    expect(snap.pendingDecisions).toHaveLength(1);
    const d = snap.pendingDecisions[0];
    expect(d).toMatchObject({ proposed: 'fix', alternatives: ['skip'], provider: 'mock' });
    // The failure is a real test run: the planted off-by-one breaks back-to-back bookings.
    expect(d.question).toMatch(/^QA "Test edge cases" failed: .*"allows back-to-back bookings".* Send it back to the Frontend Engineer to fix, then re-run QA\?$/);
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/resume`)).status).toBe(409); // decide first
    const r = await a.http.post(`/api/decisions/${d.id}`).send({ action: 'reject' });
    expect(r.body).toMatchObject({ status: 'RESOLVED', resolution: 'reject', resolvedBy: 'leader' });
    await a.orch.idle(pid);
    snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.tasks.map((t: any) => t.status)).toEqual(['REVIEW', 'FAILED']);
    expect(snap.tasks[1].blockedReason).toBe('Skipped by leader');
    expect(snap.run.status).toBe('COMPLETED');
    expect(snap.pendingDecisions).toHaveLength(0);
    expect(snap.activity.some((e: any) => e.type === 'decision.resolved' && e.actor === 'leader' && e.data.action === 'reject')).toBe(true);
    expect((await a.http.post(`/api/decisions/${d.id}`).send({ action: 'approve' })).status).toBe(409);
    a.db.close();
  });

  it('approve sends the failure back: a fix task runs before QA, then QA re-runs and passes', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    const cmd = await commandAndRun(a, pid, 'simulate a failure');
    const [build, qa] = cmd.body.taskIds;
    const d = (await a.http.get(`/api/projects/${pid}/snapshot`)).body.pendingDecisions[0];
    expect(d.proposed).toBe('fix');
    await a.http.post(`/api/decisions/${d.id}`).send({ action: 'approve', instructions: 'Back-to-back bookings must be allowed' });
    await a.orch.idle(pid);

    const tasks = a.repo.listTasks(pid);
    expect(tasks.map((t) => [t.role, t.status])).toEqual([['frontend', 'REVIEW'], ['frontend', 'REVIEW'], ['qa', 'REVIEW']]);
    const fix = tasks[1];
    expect(fix.title).toBe('Fix what QA found in "Implement booking validation"');
    expect(fix.description).toMatch(/^\[QA fix\] QA failed: .*run-tests/);

    // The fix task got QA's failure as a handoff plus the leader's note, and proved itself with the real suite.
    const fixDetail = (await a.http.get(`/api/tasks/${fix.id}`)).body;
    expect(fixDetail.messages.some((m: any) => m.kind === 'handoff' && m.author === 'QA Engineer' && /Back-to-back bookings must be allowed/.test(m.body))).toBe(true);
    expect(fixDetail.messages.some((m: any) => m.author === 'leader' && m.body === 'Back-to-back bookings must be allowed')).toBe(true);
    expect(fixDetail.runs[0].summary).toMatch(/Fixed src\/booking\.ts.*"allows back-to-back bookings".*7 passed/);

    const q = (await a.http.get(`/api/tasks/${qa}`)).body;
    expect(q.attempts).toBe(2);
    expect(q.runs.map((r: any) => r.status)).toEqual(['failed', 'succeeded']);
    const report = (await a.http.get(`/api/artifacts/${q.artifacts.at(-1).id}`)).body.content as string;
    expect(report).toContain('**Verdict: PASS**');
    expect(report).toMatch(/# pass 7/);

    // The fix handed back to QA with what it checked.
    const back = a.repo.listHandoffs(pid).find((m) => m.taskId === qa && m.author === 'Frontend Engineer' && /Fixed/.test(m.body));
    expect(back?.body).toMatch(/Checked: syntax-check src\/booking\.ts: exit 0; run-tests: 7 passed, 0 failed \(exit 0\)/);
    expect(a.repo.getPending(d.id)?.instructions).toBe('Back-to-back bookings must be allowed');
    expect(a.repo.listDecisions(pid).some((x) => x.title === 'Send "Test edge cases" failure back to the Frontend Engineer')).toBe(true);
    expect((await a.http.get(`/api/runs/${cmd.body.run.id}`)).body.status).toBe('COMPLETED');
    void build;
    a.db.close();
  });
});

describe('handoff', () => {
  it('after the first task, a handoff is addressed to the next role', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http);
    await commandAndRun(a, pid, DEMO_COMMAND);
    const [first, second, third] = a.repo.listTasks(pid);
    const handoffs = a.repo.listHandoffs(pid);
    expect(handoffs[0]).toMatchObject({ kind: 'handoff', author: 'Frontend Engineer', toRole: 'frontend', taskId: second.id, provider: 'mock' });
    expect(handoffs[0].body).toMatch(/^Artifacts ready: src\/booking\.ts, src\/RoomAvailability\.tsx\. Summary: Wrote /);
    expect(handoffs[1]).toMatchObject({ toRole: 'qa', taskId: third.id });
    expect((await a.http.get(`/api/tasks/${second.id}`)).body.messages.some((m: any) => m.kind === 'handoff')).toBe(true);
    void first;
    a.db.close();
  });
});

// Checkpoint C: the demo scenario end-to-end through the API, including restart and retry.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandAndRun, createDemoProject, DEMO_COMMAND, makeApp } from './helpers';

describe('acceptance: demo scenario via API', () => {
  it('runs steps 1–10 and survives a restart', async () => {
    // 1–3: project + team
    const a = makeApp();
    const pid = await createDemoProject(a.http, ['frontend', 'qa']);

    // 4–5: command → planner note + 4 tasks, docs blocked
    const cmd = await a.http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND });
    expect(cmd.status).toBe(202);
    expect(cmd.body.plannerNote).toMatch(/Documentation Writer/);
    // Supervised run: everything waits for plan approval; docs is blocked for a missing teammate.
    expect(cmd.body.tasks.map((t: any) => [t.role, t.status, t.blockedReason])).toEqual([
      ['frontend', 'BLOCKED', 'Awaiting plan approval'], ['frontend', 'BLOCKED', 'Awaiting plan approval'],
      ['qa', 'BLOCKED', 'Awaiting plan approval'], ['docs', 'BLOCKED', 'No Documentation Writer on the team'],
    ]);
    expect(cmd.body.run.status).toBe('AWAITING_APPROVAL');
    expect((await a.http.post(`/api/runs/${cmd.body.run.id}/approve`)).status).toBe(200);
    await a.orch.idle(pid);
    expect((await a.http.get(`/api/runs/${cmd.body.run.id}`)).body.status).toBe('COMPLETED');

    // 6: real files + QA report that really ran the tests
    let snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    const paths = snap.artifacts.map((x: any) => x.path);
    expect(paths).toEqual(expect.arrayContaining(['src/RoomAvailability.tsx', 'src/booking.ts', 'tests/booking.test.mjs', 'reports/qa-report.md']));
    const qaArt = snap.artifacts.find((x: any) => x.path === 'reports/qa-report.md');
    const qa = (await a.http.get(`/api/artifacts/${qaArt.id}`)).body;
    expect(qa.content).toContain('**Verdict: PASS**');
    expect(qa.content).toMatch(/# pass 7/);
    expect(qa.run.provider).toBe('mock');
    expect(snap.activity.some((e: any) => e.type === 'tool_call' && /run run-tests/.test(e.message))).toBe(true);

    // 7: approve one task
    const frontendTask = snap.tasks[0];
    const approved = await a.http.patch(`/api/tasks/${frontendTask.id}`).send({ status: 'COMPLETED' });
    expect(approved.body.status).toBe('COMPLETED');
    expect((await a.http.patch(`/api/tasks/${frontendTask.id}`).send({ status: 'QUEUED' })).status).toBe(409);

    // 8: restart — close app, reopen the same DB, snapshot intact
    const before = snap.tasks.map((t: any) => [t.id, t.status]);
    a.db.close();
    fs.rmSync(path.join(a.dir, 'ws'), { recursive: true, force: true }); // even with the workspace wiped
    const b = makeApp({ dir: a.dir });
    snap = (await b.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.tasks.map((t: any) => [t.id, t.status])).toEqual(before.map(([id, s]: any) => [id, id === frontendTask.id ? 'COMPLETED' : s]));
    expect((await b.http.get(`/api/artifacts/${qaArt.id}`)).body.content).toContain('PASS');

    // 9: simulated failure → FAILED → decision → approve (retry) → REVIEW, two runs kept
    const fail = await commandAndRun(b, pid, 'simulate a failure');
    const failId = fail.body.taskIds[0];
    let ft = (await b.http.get(`/api/tasks/${failId}`)).body;
    expect(ft.status).toBe('FAILED');
    expect(ft.lastError).toMatch(/Simulated failure/);
    const pending = (await b.http.get(`/api/projects/${pid}/snapshot`)).body.pendingDecisions;
    expect(pending).toHaveLength(1);
    expect((await b.http.post(`/api/tasks/${failId}/retry`)).status).toBe(409); // must go through the decision
    const retry = await b.http.post(`/api/decisions/${pending[0].id}`).send({ action: 'approve' });
    expect(retry.status).toBe(200);
    await b.orch.idle(pid);
    ft = (await b.http.get(`/api/tasks/${failId}`)).body;
    expect(ft.status).toBe('REVIEW');
    expect(ft.attempts).toBe(2);
    expect(ft.runs.map((r: any) => r.status)).toEqual(['failed', 'succeeded']);

    // 10: add the Docs agent, unblock → README from real project data
    await b.http.post(`/api/projects/${pid}/decisions`).send({ title: 'Store bookings locally', rationale: 'No external services allowed' });
    await b.http.put(`/api/projects/${pid}/agents`).send({ agents: [{ role: 'frontend' }, { role: 'qa' }, { role: 'docs' }] });
    const docsTask = snap.tasks[3];
    const unblock = await b.http.patch(`/api/tasks/${docsTask.id}`).send({ status: 'QUEUED' });
    expect(unblock.status).toBe(200);
    await b.orch.idle(pid);
    const dt = (await b.http.get(`/api/tasks/${docsTask.id}`)).body;
    expect(dt.status).toBe('REVIEW');
    const readme = (await b.http.get(`/api/artifacts/${dt.artifacts[0].id}`)).body.content as string;
    expect(readme).toContain('Book study rooms on campus');
    expect(readme).toContain('Store bookings locally');
    expect(readme).toContain('**Verdict: PASS**');
    expect(readme).toContain('src/booking.ts');
    b.db.close();
  });

  it('marks interrupted runs FAILED on boot', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http, ['qa']);
    const t = a.repo.createTask({ projectId: pid, commandId: null, role: 'qa', title: 'x', description: '', status: 'QUEUED' });
    a.repo.transition(t.id, 'QUEUED', 'IN_PROGRESS', { incrementAttempts: true });
    a.db.close();
    const b = makeApp({ dir: a.dir });
    expect(b.recovered.map((r) => r.id)).toEqual([t.id]);
    expect(b.repo.getTask(t.id)?.lastError).toBe('Interrupted by restart');
    b.db.close();
  });

  it('QA fails honestly when a file is broken', async () => {
    const a = makeApp();
    const pid = await createDemoProject(a.http, ['frontend', 'qa']);
    await commandAndRun(a, pid, 'implement booking validation');
    fs.writeFileSync(path.join(a.orch.workspaceFor(pid), 'src/booking.ts'), 'export function broken( {\n');
    const r = await commandAndRun(a, pid, 'test edge cases');
    const qa = (await a.http.get(`/api/tasks/${r.body.taskIds[0]}`)).body;
    expect(qa.status).toBe('FAILED');
    expect(qa.lastError).toMatch(/syntax-check src\/booking.ts/);
    a.db.close();
  });
});

import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers';

describe('api', () => {
  it('validates, 404s and enforces transitions', async () => {
    const { http, repo } = makeApp();
    const health = await http.get('/api/health');
    expect(health.body.ok).toBe(true);
    expect(health.headers['x-powered-by']).toBeUndefined();
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect((await http.get('/api/roles')).body).toHaveLength(6);

    const bad = await http.post('/api/projects').send({ name: '  ' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const p = await http.post('/api/projects').send({ name: 'StudySpace', goal: 'Book rooms' });
    expect(p.status).toBe(201);

    const noAgents = await http.post(`/api/projects/${p.body.id}/commands`).send({ text: 'build a page' });
    expect(noAgents.status).toBe(409);
    expect(noAgents.body.error.code).toBe('NO_AGENTS');

    const dup = await http.put(`/api/projects/${p.body.id}/agents`).send({ agents: [{ role: 'qa' }, { role: 'qa' }] });
    expect(dup.status).toBe(400);
    const unknownRole = await http.put(`/api/projects/${p.body.id}/agents`).send({ agents: [{ role: 'ceo' }] });
    expect(unknownRole.status).toBe(400);
    const ok = await http.put(`/api/projects/${p.body.id}/agents`).send({ agents: [{ role: 'qa' }] });
    expect(ok.body).toHaveLength(1);

    const t = repo.createTask({ projectId: p.body.id, commandId: null, role: 'docs', title: 'Docs', description: '', status: 'BLOCKED', blockedReason: 'x' });
    const illegal = await http.patch(`/api/tasks/${t.id}`).send({ status: 'COMPLETED' });
    expect(illegal.status).toBe(409);
    expect(illegal.body.error.code).toBe('INVALID_TRANSITION');
    const inProgress = await http.patch(`/api/tasks/${t.id}`).send({ status: 'IN_PROGRESS' });
    expect(inProgress.status).toBe(409);
    const unblockNoRole = await http.patch(`/api/tasks/${t.id}`).send({ status: 'QUEUED' });
    expect(unblockNoRole.body.error.code).toBe('NO_AGENTS');
    const retry = await http.post(`/api/tasks/${t.id}/retry`);
    expect(retry.status).toBe(409);

    expect((await http.get('/api/projects/nope')).status).toBe(404);
    expect((await http.get('/api/tasks/nope')).body.error.code).toBe('NOT_FOUND');
    expect((await http.get('/api/artifacts/nope')).status).toBe(404);
    expect((await http.get('/api/nothing')).status).toBe(404);

    const dec = await http.post(`/api/projects/${p.body.id}/decisions`).send({ title: 'Use SQLite', rationale: 'Restart-safe' });
    expect(dec.status).toBe(201);
    const detail = await http.get(`/api/projects/${p.body.id}`);
    expect(detail.body.decisions).toHaveLength(1);
    expect(detail.body.agents).toHaveLength(1);

    const empty = await http.post(`/api/projects/${p.body.id}/commands`).send({ text: '?!' });
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('EMPTY_PLAN');
  });
});

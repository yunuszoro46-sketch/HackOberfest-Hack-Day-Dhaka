import { describe, expect, it } from 'vitest';
import { IDEA_CRITERIA } from '../../shared/idea-report';
import { FallbackChain } from '../src/llm/chain';
import type { LlmSetup } from '../src/llm/registry';
import { LlmError, type JsonRequest, type JsonResult, type LlmClient } from '../src/llm/types';
import { makeApp, tmpDir } from './helpers';

const IDEA = { idea: 'A mobile app for commuters to find safe, cheap parking in Dhaka with live availability alerts.', hoursLeft: 48 };
const scores = IDEA_CRITERIA.map((criterion) => ({ criterion, score: 80, rationale: `on ${criterion}` }));
const suggestion = { title: 'Seed one district', description: 'Hand-collect 30 lots.', effortHours: 4, impact: 'high', group: 'mustFix' };
const question = { question: 'Where does the data come from?', suggestedAnswer: 'Lot owners.' };
const REPLIES: Record<string, unknown> = {
  draft: { summary: 's', scores, risks: ['No data feed'], suggestions: [suggestion], judgeQuestions: [question], verdict: 'Build' },
  critique: { objections: [], missingRisks: [] },
  synthesis: {
    summary: 's',
    ideaCard: {
      problem: 'Commuters need reliable parking availability.',
      targetUser: 'Drivers in Dhaka.',
      solution: 'A parking availability app.',
      whyNow: 'A focused pilot can be tested quickly.',
      hackathonConstraints: 'Start with one district and seeded data.',
    },
    scores,
    verdict: 'Build',
    topRisks: ['No data feed'],
    suggestions: [suggestion],
    judgeQuestions: [question],
  },
};

/** Answers every council turn; when `gate` is set, each call waits for it (or for the abort). */
class Fake implements LlmClient {
  readonly model = 'fake-model';
  calls = 0;
  gate: Promise<void> | null = null;
  constructor(readonly id = 'groq') {}
  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    this.calls += 1;
    if (this.gate) {
      await Promise.race([this.gate, new Promise((_, reject) => req.signal?.addEventListener('abort', () => reject(new LlmError(this.id, 'ABORTED', 'aborted'))))]);
    }
    const kind = req.name.startsWith('council_draft') ? 'draft' : req.name.replace('council_', '');
    return { data: req.schema.parse(REPLIES[kind]), provider: this.id, model: this.model, usage: { inputTokens: 10, outputTokens: 5 } };
  }
}

const llmOf = (...clients: LlmClient[]): LlmSetup => ({ configs: [], chain: new FallbackChain(clients.map((client) => ({ client }))) });

describe('idea council runs API', () => {
  it('creates a run awaiting approval without calling any provider', async () => {
    const fake = new Fake();
    const { http } = makeApp({ llm: llmOf(fake) });
    const r = await http.post('/api/ideas/runs').send(IDEA);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'AWAITING_APPROVAL', maxCalls: 5, report: null, turns: [], providers: ['groq'] });
    expect(r.body.input.idea).toBe(IDEA.idea);
    expect(fake.calls).toBe(0);
    expect((await http.get('/api/ideas/runs')).body.map((x: { id: string }) => x.id)).toEqual([r.body.id]);
  });

  it('runs the council after approval and persists every turn in order', async () => {
    const app = makeApp({ llm: llmOf(new Fake()) });
    const { body: run } = await app.http.post('/api/ideas/runs').send(IDEA);
    const ok = await app.http.post(`/api/ideas/runs/${run.id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('RUNNING');
    await app.council.idle(run.id);

    const d = (await app.http.get(`/api/ideas/runs/${run.id}`)).body;
    expect(d).toMatchObject({ status: 'COMPLETED', fallback: null, error: null });
    expect(d.startedAt).not.toBeNull();
    expect(d.finishedAt).not.toBeNull();
    expect(d.report.analysis).toMatchObject({ method: 'council', council: { calls: 5, providers: ['groq'] } });
    expect(d.turns.map((t: { seq: number; round: string; role: string; status: string }) => `${t.seq}:${t.round}:${t.role}:${t.status}`)).toEqual([
      '1:draft:feasibility:ok', '2:draft:market:ok', '3:draft:judge:ok', '4:critique:critic:ok', '5:synthesis:chair:ok',
    ]);
    expect(d.turns[0]).toMatchObject({ provider: 'groq', model: 'fake-model', usage: { inputTokens: 10, outputTokens: 5 }, attempts: [] });
    expect(d.turns[0].output.scores.length).toBeGreaterThan(0);

    const again = await app.http.post(`/api/ideas/runs/${run.id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('completes with the rule-based report when no provider is configured', async () => {
    const app = makeApp({ llm: llmOf() });
    const { body: run } = await app.http.post('/api/ideas/runs').send(IDEA);
    expect(run.providers).toEqual([]);
    await app.http.post(`/api/ideas/runs/${run.id}/approve`);
    await app.council.idle(run.id);
    const d = (await app.http.get(`/api/ideas/runs/${run.id}`)).body;
    expect(d).toMatchObject({ status: 'COMPLETED', fallback: 'NOT_CONFIGURED', turns: [] });
    expect(d.report.analysis.method).toBe('rule-based');
  });

  it('cancels before approval, and cancels a running council without storing a report', async () => {
    const fake = new Fake();
    const app = makeApp({ llm: llmOf(fake) });
    const { body: a } = await app.http.post('/api/ideas/runs').send(IDEA);
    expect((await app.http.post(`/api/ideas/runs/${a.id}/cancel`)).body.status).toBe('CANCELLED');
    expect((await app.http.post(`/api/ideas/runs/${a.id}/approve`)).status).toBe(409);

    let open!: () => void;
    fake.gate = new Promise((resolve) => { open = resolve; });
    const { body: b } = await app.http.post('/api/ideas/runs').send(IDEA);
    await app.http.post(`/api/ideas/runs/${b.id}/approve`);
    const { body: c } = await app.http.post('/api/ideas/runs').send(IDEA);
    const busy = await app.http.post(`/api/ideas/runs/${c.id}/approve`);
    expect(busy.status).toBe(409);
    expect(busy.body.error).toMatchObject({ code: 'RUN_ACTIVE', details: { runId: b.id } });

    const cancelled = await app.http.post(`/api/ideas/runs/${b.id}/cancel`);
    expect(cancelled.body.status).toBe('CANCELLED');
    await app.council.idle(b.id);
    open();
    const d = (await app.http.get(`/api/ideas/runs/${b.id}`)).body;
    expect(d).toMatchObject({ status: 'CANCELLED', report: null });
    expect(d.finishedAt).not.toBeNull();
    expect((await app.http.post(`/api/ideas/runs/${b.id}/cancel`)).status).toBe(409);
    // The slot is free again.
    expect((await app.http.post(`/api/ideas/runs/${c.id}/approve`)).status).toBe(200);
  });

  it('marks runs interrupted by a restart as FAILED', async () => {
    const dir = tmpDir();
    const fake = new Fake();
    fake.gate = new Promise(() => {});
    const first = makeApp({ dir, llm: llmOf(fake) });
    const { body: run } = await first.http.post('/api/ideas/runs').send(IDEA);
    await first.http.post(`/api/ideas/runs/${run.id}/approve`);

    const second = makeApp({ dir, llm: llmOf(new Fake()) });
    expect(second.recoveredIdeaRuns).toEqual([run.id]);
    const d = (await second.http.get(`/api/ideas/runs/${run.id}`)).body;
    expect(d.status).toBe('FAILED');
    expect(d.error).toContain('server restart');
  });

  it('validates input and unknown ids', async () => {
    const { http } = makeApp({ llm: llmOf() });
    expect((await http.post('/api/ideas/runs').send({ idea: '' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await http.post('/api/ideas/runs').send({ ...IDEA, maxCalls: 1 })).status).toBe(400);
    expect((await http.get('/api/ideas/runs/nope')).status).toBe(404);
    expect((await http.post('/api/ideas/runs/nope/approve')).status).toBe(404);
  });
});

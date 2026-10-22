import { describe, expect, it } from 'vitest';
import type { PlanSpec } from '../../shared/plan-review';
import { runPlanReview } from '../src/council/plan-review';
import type { JsonGenerator } from '../src/council/runner';
import { LlmChainError } from '../src/llm/chain';
import type { JsonRequest } from '../src/llm/types';
import { makeApp } from './helpers';

const SPEC: PlanSpec = {
  idea: {
    idea: 'StudySpace: students see live study-room availability on campus and book a slot in two taps. Validation blocks double bookings.',
    theme: 'Education', hoursLeft: 48, teamSkills: 'React, TypeScript, Node.js', targetJudges: 'Student-experience judges', mode: 'quick',
  },
  assessmentScore: 80,
  techStack: { framework: 'React 19 (Vite SPA)', database: 'In-Memory SQLite / Browser Storage' },
  features: [{ title: 'Book a room in the main flow', priority: 'P0' }, { title: 'Conflict validation with tests', priority: 'P0' }],
  constraints: ['Use labelled seed data for the demo'],
  nonGoals: ['User accounts'],
  decisions: [{ question: 'Real or demo data?', answer: 'Seed data for the demo' }],
};

async function review(a: ReturnType<typeof makeApp>, body: object) {
  const r = await a.http.post('/api/plans/reviews').send(body);
  expect(r.status).toBe(202);
  await a.planReviews.idle(r.body.id);
  return (await a.http.get(`/api/plans/reviews/${r.body.id}`)).body;
}

describe('plan review council: rule-based (no model configured)', () => {
  it('a focused plan that fits the time is approval-ready, labelled rule-based', async () => {
    const a = makeApp({ llm: undefined });
    const r = await review(a, { spec: SPEC });
    expect(r.status).toBe('COMPLETED');
    expect(r.agents).toEqual(['breaker', 'skeptic', 'builder']);
    expect(r.turns.every((t: any) => t.status === 'skipped' && t.reason === 'NOT_CONFIGURED')).toBe(true);
    expect(r.result).toMatchObject({ method: 'rule-based', fallback: 'NOT_CONFIGURED', verdict: 'approval-ready', blockers: [] });
    expect(r.result.solidity).toBeGreaterThanOrEqual(70);
    expect(r.result.breakAttempts.find((x: any) => /third-party API fails/.test(x.attack))).toMatchObject({ severity: 'high', holds: true });
    expect(r.result.pros.join(' ')).toMatch(/Scope fits the time/);
    a.db.close();
  });

  it('too much scope for the hours left is a blocker and the plan is not approval-ready', async () => {
    const a = makeApp();
    const features = Array.from({ length: 8 }, (_, i) => ({ title: `Feature ${i + 1}`, priority: 'P0' }));
    const r = await review(a, { spec: { ...SPEC, features, decisions: [], constraints: [] }, agents: ['breaker', 'builder'] });
    expect(r.result.verdict).not.toBe('approval-ready');
    expect(r.result.blockers.join(' ')).toMatch(/need roughly 48h .* only 48h are left|third-party API fails/);
    expect(r.result.breakAttempts.some((x: any) => x.agent === 'builder' && /8 P0|roughly/.test(x.attack))).toBe(true);
    expect(r.result.requiredChanges.join(' ')).toMatch(/Cut P2 features|seed data/);
    a.db.close();
  });

  it('validates the request', async () => {
    const a = makeApp();
    expect((await a.http.post('/api/plans/reviews').send({ spec: SPEC, agents: [] })).status).toBe(400);
    expect((await a.http.post('/api/plans/reviews').send({ spec: SPEC, agents: ['ceo'] })).status).toBe(400);
    expect((await a.http.post('/api/plans/reviews').send({ spec: { ...SPEC, idea: { idea: '' } } })).status).toBe(400);
    expect((await a.http.get('/api/plans/reviews/nope')).status).toBe(404);
    a.db.close();
  });
});

/** Scripted model: replies by request name; `fail` names throw like an exhausted provider chain. */
function fakeLlm(replies: Record<string, unknown>, fail: string[] = []) {
  const calls: JsonRequest<unknown>[] = [];
  const llm: JsonGenerator = {
    providers: ['fake'],
    async generateJson<T>(req: JsonRequest<T>) {
      calls.push(req as JsonRequest<unknown>);
      if (fail.includes(req.name)) throw new LlmChainError([{ provider: 'fake', model: 'fake-1', reason: 'RATE_LIMIT' }]);
      return { data: req.schema.parse(replies[req.name]), provider: 'fake', model: 'fake-1', usage: {}, attempts: [] };
    },
  };
  return { llm, calls };
}

const opinion = (solidity: number, attacks: unknown[] = []) => ({ stance: 'concerned', solidity, pros: ['Clear user'], cons: ['Thin moat'], attacks });

describe('plan review council: model agents', () => {
  it('agents attack, the chair weighs in, and an open high-severity attack downgrades an over-eager chair', async () => {
    const { llm, calls } = fakeLlm({
      plan_review_breaker: opinion(70, [{ attack: 'Two users book the same slot at the same second', severity: 'high', holds: false, mitigation: 'Check conflicts on the server inside a transaction' }]),
      plan_review_skeptic: opinion(75),
      plan_review_chair: { summary: 'Solid idea, one race condition.', solidity: 78, verdict: 'approval-ready', pros: ['Clear user'], cons: ['Race condition'], blockers: [], requiredChanges: ['Server-side conflict check'] },
    });
    const out = await runPlanReview(llm, SPEC, ['breaker', 'skeptic'], 'Will booking survive concurrency?');
    expect(calls.map((c) => c.name)).toEqual(['plan_review_breaker', 'plan_review_skeptic', 'plan_review_chair']);
    expect(calls[0].prompt).toContain('<plan>');
    expect(calls[0].prompt).toContain('<focus>Will booking survive concurrency?</focus>');
    expect(calls[0].system).toContain('Red-team engineer');
    expect(out.turns.map((t) => [t.agent, t.status, t.provider])).toEqual([['breaker', 'ok', 'fake'], ['skeptic', 'ok', 'fake'], ['chair', 'ok', 'fake']]);
    expect(out.result).toMatchObject({ method: 'council', solidity: 78, verdict: 'needs-changes', blockers: ['Two users book the same slot at the same second'] });
    expect(out.result.breakAttempts[0]).toMatchObject({ agent: 'breaker', holds: false });
    expect(out.result.notes[0]).toMatch(/chair said approval-ready, but 1 high-severity attack still breaks the plan/);
  });

  it('a failed agent is recorded and a failed chair falls back to combining the agents', async () => {
    const { llm } = fakeLlm({ plan_review_builder: opinion(50, [{ attack: 'Scope too big', severity: 'medium', holds: false, mitigation: 'Cut P1' }]) }, ['plan_review_breaker', 'plan_review_chair']);
    const out = await runPlanReview(llm, SPEC, ['breaker', 'builder'], null);
    expect(out.turns.map((t) => [t.agent, t.status, t.reason])).toEqual([['breaker', 'failed', 'RATE_LIMIT'], ['builder', 'ok', null], ['chair', 'failed', 'RATE_LIMIT']]);
    expect(out.result).toMatchObject({ method: 'council', solidity: 50, verdict: 'needs-changes', pros: ['Clear user'], cons: ['Thin moat'] });
    expect(out.result.notes).toContain('The chair did not answer, so agent opinions were combined without it.');
  });

  it('no agent answering falls back to the rule-based review', async () => {
    const { llm } = fakeLlm({}, ['plan_review_breaker']);
    const out = await runPlanReview(llm, SPEC, ['breaker'], null);
    expect(out.result).toMatchObject({ method: 'rule-based', fallback: 'NO_OPINIONS' });
  });
});

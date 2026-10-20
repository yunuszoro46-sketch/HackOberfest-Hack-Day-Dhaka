import { describe, expect, it } from 'vitest';
import { IDEA_CRITERIA, scoreIdea, type IdeaInput } from '../../shared/idea-report';
import { FallbackChain } from '../src/llm/chain';
import { LlmError, type JsonRequest, type JsonResult, type LlmClient } from '../src/llm/types';
import { COUNCIL_ROLES } from '../src/council/roles';
import { runCouncil, type CouncilTurn } from '../src/council/runner';
import { CritiqueSchema, DraftSchema, SynthesisSchema } from '../src/council/schema';

const INPUT: IdeaInput = {
  idea: 'A mobile app for commuters to find safe, cheap parking in Dhaka with live availability alerts.',
  theme: 'real life local problems',
  hoursLeft: 48,
  teamSkills: '2 people, React + Node',
  mode: 'quick',
};

type Reply = unknown | LlmError | ((req: JsonRequest<unknown>) => unknown);

class FakeClient implements LlmClient {
  readonly calls: JsonRequest<unknown>[] = [];
  constructor(readonly id: string, private readonly replies: Record<string, Reply>, readonly model = `${id}-model`) {}
  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    this.calls.push(req as JsonRequest<unknown>);
    if (req.signal?.aborted) throw new LlmError(this.id, 'ABORTED', 'aborted');
    let r = req.name in this.replies ? this.replies[req.name] : this.replies['*'];
    if (typeof r === 'function') r = (r as (q: JsonRequest<unknown>) => unknown)(req as JsonRequest<unknown>);
    if (r instanceof LlmError) throw r;
    if (r === undefined) throw new LlmError(this.id, 'UPSTREAM', 'no canned reply');
    const parsed = req.schema.safeParse(r);
    if (!parsed.success) throw new LlmError(this.id, 'SCHEMA', 'reply did not match');
    return { data: parsed.data, provider: this.id, model: this.model, usage: { inputTokens: 10, outputTokens: 5 } };
  }
}

const draft = (role: 'feasibility' | 'market' | 'judge', score: number) => ({
  summary: `${role} view`,
  // Includes an off-focus criterion, which the runner must drop.
  scores: [...COUNCIL_ROLES[role].focus.map((criterion) => ({ criterion, score, rationale: `${role} on ${criterion}` })), { criterion: IDEA_CRITERIA.find((c) => !COUNCIL_ROLES[role].focus.includes(c))!, score: 1, rationale: 'off-focus' }],
  risks: [`${role} risk`],
  suggestions: [{ title: `${role} fix`, description: 'Do it.', effortHours: 2, impact: 'high', group: 'mustFix' }],
  judgeQuestions: [{ question: `${role} question?`, suggestedAnswer: 'Answer.' }],
  verdict: 'Build',
});
const critique = { objections: [{ target: 'market', point: 'Originality is overstated.', severity: 'medium' }], missingRisks: ['Parking data access'] };
const synthesis = {
  summary: 'Build it, narrowly.',
  ideaCard: {
    problem: 'Commuters cannot reliably find affordable parking.',
    targetUser: 'Dhaka commuters who drive to busy areas.',
    solution: 'A mobile app showing verified parking availability and prices.',
    whyNow: 'A short pilot can validate supply and demand during the hackathon.',
    hackathonConstraints: 'Focus on one Dhaka district and seeded availability data.',
  },
  scores: IDEA_CRITERIA.map((criterion) => ({ criterion, score: 80, rationale: `chair on ${criterion}` })),
  verdict: 'Build',
  topRisks: ['No live parking data feed', 'Crowded market'],
  suggestions: [
    { title: 'Seed data for one district', description: 'Hand-collect 30 lots.', effortHours: 4, impact: 'high', group: 'mustFix' },
    { title: 'Voice alerts', description: 'Speak the nearest free lot.', effortHours: 6, impact: 'medium', group: 'wowFactor' },
  ],
  judgeQuestions: [{ question: 'Where does availability data come from?', suggestedAnswer: 'Lot owners update via SMS.' }],
};
const happy: Record<string, Reply> = {
  council_draft_feasibility: draft('feasibility', 70),
  council_draft_market: draft('market', 60),
  council_draft_judge: draft('judge', 90),
  council_critique: critique,
  council_synthesis: synthesis,
};
const chainOf = (...clients: LlmClient[]) => new FallbackChain(clients.map((client) => ({ client })));
const summarize = (turns: CouncilTurn[]) => turns.map((t) => `${t.round}:${t.role}:${t.status}${t.reason ? `:${t.reason}` : ''}`);

describe('idea council', () => {
  it('falls back to the rule-based report without calls when no provider is configured', async () => {
    const out = await runCouncil(chainOf(), INPUT);
    expect(out.fallback).toBe('NOT_CONFIGURED');
    expect(out.turns).toEqual([]);
    expect(out.report.analysis.method).toBe('rule-based');
    expect(out.report.criteria).toEqual(scoreIdea(INPUT).criteria);
    expect(out.report.ideaCard).toEqual(scoreIdea(INPUT).ideaCard);
  });

  it('runs drafts → critique → synthesis in order and maps the chair result onto the report', async () => {
    const groq = new FakeClient('groq', happy);
    const seen: string[] = [];
    const out = await runCouncil(chainOf(groq), INPUT, { onTurn: (t) => seen.push(`${t.round}:${t.role}`) });

    expect(out.fallback).toBeNull();
    expect(summarize(out.turns)).toEqual(['draft:feasibility:ok', 'draft:market:ok', 'draft:judge:ok', 'critique:critic:ok', 'synthesis:chair:ok']);
    expect(seen).toEqual(out.turns.map((t) => `${t.round}:${t.role}`));
    expect(groq.calls.map((c) => c.name)).toEqual(['council_draft_feasibility', 'council_draft_market', 'council_draft_judge', 'council_critique', 'council_synthesis']);

    const r = out.report;
    expect(r.criteria.every((c) => c.score === 80 && c.evidenceLabel === 'Inferred' && c.evidence === `chair on ${c.criterion}`)).toBe(true);
    expect(r.overallScore).toBe(80);
    expect(r.verdict).toBe('Build');
    expect(r.topRisks).toEqual(synthesis.topRisks);
    expect(r.upgradeSuggestions.mustFix.map((s) => s.title)).toEqual(['Seed data for one district']);
    expect(r.upgradeSuggestions.wowFactor.map((s) => s.title)).toEqual(['Voice alerts']);
    expect(r.ideaCard).toEqual(synthesis.ideaCard);
    // No council niceToHave items, so the rule-based ones stay.
    expect(r.upgradeSuggestions.niceToHave).toEqual(scoreIdea(INPUT).upgradeSuggestions.niceToHave);
    expect(r.judgeQuestions[0].question).toBe('Where does availability data come from?');
    expect(r.judgeQuestions).toHaveLength(scoreIdea(INPUT).judgeQuestions.length);
    expect(r.analysis).toMatchObject({ method: 'council', council: { members: ['feasibility', 'market', 'judge', 'critic', 'chair'], providers: ['groq'], calls: 5 } });
    expect(r.analysis.council?.note).toBeUndefined();

    // Drafts drop off-focus scores before they are recorded or reach the critic and chair.
    const feasibility = out.turns[0].output as { scores: { criterion: string }[] };
    expect(feasibility.scores.map((s) => s.criterion)).toEqual(COUNCIL_ROLES.feasibility.focus);
    const chairPrompt = groq.calls[4].prompt;
    expect(chairPrompt).not.toContain('off-focus');
    expect(chairPrompt).toContain('Originality is overstated.');
  });

  it('sends the idea as delimited data plus the strict JSON Schema, and spreads roles across preferred providers', async () => {
    const groq = new FakeClient('groq', happy);
    const gemini = new FakeClient('gemini', happy);
    const openrouter = new FakeClient('openrouter', happy);
    const out = await runCouncil(chainOf(groq, gemini, openrouter), INPUT);
    expect(out.turns.map((t) => `${t.role}@${t.provider}`)).toEqual(['feasibility@groq', 'market@openrouter', 'judge@groq', 'critic@openrouter', 'chair@gemini']);
    expect(out.report.analysis.council?.providers).toEqual(['groq', 'openrouter', 'gemini']);

    const first = groq.calls[0];
    expect(first.prompt).toContain('<idea>\nIdea: A mobile app for commuters');
    expect(first.prompt).toContain(JSON.stringify(DraftSchema.json));
    expect(first.jsonSchema).toEqual(DraftSchema.json);
    expect(first.system).toContain('Score only these criteria: feasibility, technicalDepth, demoAbility.');
    expect(first.maxOutputTokens).toBe(900);
  });

  it('continues when one member fails on every provider and records the reason', async () => {
    const groq = new FakeClient('groq', { ...happy, council_draft_market: new LlmError('groq', 'BAD_JSON', 'unparseable') });
    const out = await runCouncil(chainOf(groq), INPUT);
    expect(summarize(out.turns)).toEqual(['draft:feasibility:ok', 'draft:market:failed:BAD_JSON', 'draft:judge:ok', 'critique:critic:ok', 'synthesis:chair:ok']);
    expect(out.turns[1].attempts).toEqual([{ provider: 'groq', model: 'groq-model', reason: 'BAD_JSON' }]);
    expect(out.report.analysis.council?.members).toEqual(['feasibility', 'judge', 'critic', 'chair']);
    expect(out.report.analysis.council?.calls).toBe(5);
  });

  it('falls back to the rule-based report when every member fails', async () => {
    const groq = new FakeClient('groq', { '*': new LlmError('groq', 'AUTH', '401') });
    const out = await runCouncil(chainOf(groq), INPUT);
    expect(out.fallback).toBe('NO_DRAFTS');
    expect(summarize(out.turns)).toEqual([
      'draft:feasibility:failed:AUTH', 'draft:market:failed:AUTH', 'draft:judge:failed:AUTH',
      'critique:critic:skipped:NO_DRAFTS', 'synthesis:chair:skipped:NO_DRAFTS',
    ]);
    // AUTH puts groq in cooldown, so later members never reach it again.
    expect(groq.calls).toHaveLength(1);
    expect(out.report.analysis.method).toBe('rule-based');
  });

  it('averages member scores when the chair fails', async () => {
    const groq = new FakeClient('groq', { ...happy, council_synthesis: { not: 'valid' } });
    const out = await runCouncil(chainOf(groq), INPUT);
    expect(out.turns.at(-1)).toMatchObject({ role: 'chair', status: 'failed', reason: 'SCHEMA' });
    const score = (c: string) => out.report.criteria.find((x) => x.criterion === c)!;
    expect(score('feasibility')).toMatchObject({ score: 70, evidenceLabel: 'Inferred' });
    expect(score('demoAbility').score).toBe(80); // feasibility 70 + judge 90
    expect(score('originality').score).toBe(75); // market 60 + judge 90
    expect(score('themeFit').score).toBe(90); // judge only; the off-focus 1s were dropped
    expect(out.report.topRisks).toEqual(['feasibility risk', 'market risk', 'judge risk', 'Parking data access']);
    expect(out.report.upgradeSuggestions.mustFix.map((s) => s.title)).toEqual(['feasibility fix', 'market fix', 'judge fix']);
    expect(out.report.ideaCard).toEqual(scoreIdea(INPUT).ideaCard);
    expect(out.report.analysis.council?.note).toContain('averaged');
  });

  it('respects maxCalls: the chair is reserved, then drafts, then the critique', async () => {
    const groq = new FakeClient('groq', happy);
    const out = await runCouncil(chainOf(groq), INPUT, { maxCalls: 3 });
    expect(summarize(out.turns)).toEqual(['draft:feasibility:ok', 'draft:market:ok', 'draft:judge:skipped:BUDGET', 'critique:critic:skipped:BUDGET', 'synthesis:chair:ok']);
    expect(groq.calls).toHaveLength(3);
    expect(out.report.analysis.council?.calls).toBe(3);

    const tiny = await runCouncil(chainOf(new FakeClient('groq', happy)), INPUT, { maxCalls: 1 });
    expect(tiny.fallback).toBe('BUDGET');
  });

  it('counts provider retries against maxCalls, keeping the chair reservation', async () => {
    const failing = { ...happy, council_draft_feasibility: new LlmError('x', 'UPSTREAM', '500') };
    const groq = new FakeClient('groq', failing);
    const gemini = new FakeClient('gemini', { ...happy, council_synthesis: new LlmError('gemini', 'UPSTREAM', '500') });
    const openrouter = new FakeClient('openrouter', happy);
    const out = await runCouncil(chainOf(groq, gemini, openrouter), INPUT, { maxCalls: 3 });
    // Feasibility: groq fails, gemini answers (2 requests). Chair: gemini fails, groq cools down, openrouter is over budget.
    expect(summarize(out.turns)).toEqual(['draft:feasibility:ok', 'draft:market:skipped:BUDGET', 'draft:judge:skipped:BUDGET', 'critique:critic:skipped:BUDGET', 'synthesis:chair:failed:BUDGET']);
    expect(out.turns.at(-1)?.attempts.map((a) => `${a.provider}:${a.reason}`)).toEqual(['gemini:UPSTREAM', 'groq:UPSTREAM', 'openrouter:BUDGET']);
    expect(groq.calls.length + gemini.calls.length + openrouter.calls.length).toBe(3);
    expect(out.report.analysis.council?.calls).toBe(3);
  });

  it('fills criteria the chair skipped from member drafts and notes it; a draft without focused scores fails', async () => {
    const offFocusOnly = { ...draft('market', 60), scores: [{ criterion: 'feasibility', score: 5, rationale: 'off-focus' }] };
    const groq = new FakeClient('groq', { ...happy, council_draft_market: offFocusOnly, council_synthesis: { ...synthesis, scores: [] } });
    const out = await runCouncil(chainOf(groq), INPUT);
    expect(summarize(out.turns)).toEqual(['draft:feasibility:ok', 'draft:market:failed:NO_SCORES', 'draft:judge:ok', 'critique:critic:ok', 'synthesis:chair:ok']);
    const score = (c: string) => out.report.criteria.find((x) => x.criterion === c)!;
    expect(score('feasibility')).toMatchObject({ score: 70, evidenceLabel: 'Inferred' });
    expect(score('themeFit').score).toBe(90);
    expect(score('problemClarity')).toEqual(scoreIdea(INPUT).criteria.find((c) => c.criterion === 'problemClarity'));
    expect(out.report.analysis.council?.note).toMatch(/The chair did not score [^.]*\bfeasibility\b/);
    expect(out.report.analysis.council?.note).toContain('No council member scored problemClarity');
  });

  it('rejects with ABORTED when already aborted, even with nothing to call', async () => {
    const ac = new AbortController();
    ac.abort();
    const err = await runCouncil(chainOf(), INPUT, { signal: ac.signal }).then(() => null, (e) => e);
    expect((err as LlmError).reason).toBe('ABORTED');
  });

  it('rejects with ABORTED when the run is cancelled while the chair answers', async () => {
    const ac = new AbortController();
    const turns: CouncilTurn[] = [];
    const groq = new FakeClient('groq', { ...happy, council_synthesis: () => { ac.abort(); return synthesis; } });
    const err = await runCouncil(chainOf(groq), INPUT, { signal: ac.signal, onTurn: (t) => turns.push(t) }).then(() => null, (e) => e);
    expect((err as LlmError).reason).toBe('ABORTED');
    expect(turns.map((t) => t.role)).not.toContain('chair');
  });

  it('rejects with ABORTED when onTurn cancels on the final turn, including the no-drafts path', async () => {
    const ac = new AbortController();
    const onTurn = (t: CouncilTurn) => { if (t.role === 'chair') ac.abort(); };
    const err = await runCouncil(chainOf(new FakeClient('groq', happy)), INPUT, { signal: ac.signal, onTurn }).then(() => null, (e) => e);
    expect((err as LlmError).reason).toBe('ABORTED');

    const ac2 = new AbortController();
    const failing = new FakeClient('groq', { '*': new LlmError('groq', 'AUTH', '401') });
    const err2 = await runCouncil(chainOf(failing), INPUT, { signal: ac2.signal, onTurn: (t) => { if (t.role === 'chair') ac2.abort(); } }).then(() => null, (e) => e);
    expect((err2 as LlmError).reason).toBe('ABORTED');
  });

  it('does not charge maxCalls for a provider that rejects before sending (NOT_CONFIGURED)', async () => {
    const unconfigured = new FakeClient('groq', { '*': new LlmError('groq', 'NOT_CONFIGURED', 'API key is not set') });
    const gemini = new FakeClient('gemini', happy);
    const out = await runCouncil(chainOf(unconfigured, gemini), INPUT, { maxCalls: 2 });
    expect(summarize(out.turns)).toEqual(['draft:feasibility:ok', 'draft:market:skipped:BUDGET', 'draft:judge:skipped:BUDGET', 'critique:critic:skipped:BUDGET', 'synthesis:chair:ok']);
    expect(gemini.calls).toHaveLength(2);
    expect(out.report.analysis.council?.calls).toBe(2);
  });

  it('does not charge provider RPM/RPD for a NOT_CONFIGURED rejection', async () => {
    const unconfigured = new FakeClient('groq', { '*': new LlmError('groq', 'NOT_CONFIGURED', 'API key is not set') });
    const chain = new FallbackChain([{ client: unconfigured, limits: { rpm: 1, rpd: 1 } }, { client: new FakeClient('gemini', happy) }]);
    for (let i = 0; i < 2; i++) {
      const r = await chain.generateJson({ name: 'council_critique', prompt: 'p', schema: CritiqueSchema.zod });
      expect(r.attempts.map((a) => a.reason)).toEqual(['NOT_CONFIGURED']);
    }
    expect(chain.status()[0].usage).toEqual({ lastMinute: 0, today: 0 });
    expect(unconfigured.calls).toHaveLength(2);
  });

  it('rejects with ABORTED and stops calling when the signal aborts', async () => {
    const ac = new AbortController();
    const groq = new FakeClient('groq', { ...happy, council_draft_market: () => { ac.abort(); return draft('market', 60); } });
    const err = await runCouncil(chainOf(groq), INPUT, { signal: ac.signal }).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).reason).toBe('ABORTED');
    expect(groq.calls).toHaveLength(2);
  });
});

describe('council schemas', () => {
  it('emits strict JSON Schemas: every property required, no extra properties, at every level', () => {
    const walk = (s: Record<string, any>): void => {
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
        Object.values(s.properties).forEach((p) => walk(p as Record<string, any>));
      }
      if (s.type === 'array') walk(s.items);
    };
    walk(DraftSchema.json);
    walk(SynthesisSchema.json);
  });

  it('clamps scores, rounds hours and truncates long lists instead of rejecting', () => {
    const parsed = SynthesisSchema.zod.parse({
      ...synthesis,
      scores: [{ criterion: 'impact', score: 140, rationale: 'x' }, { criterion: 'feasibility', score: -3.4, rationale: 'y' }],
      topRisks: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      suggestions: [{ ...synthesis.suggestions[0], effortHours: 2.6 }],
    });
    expect(parsed.scores.map((s) => s.score)).toEqual([100, 0]);
    expect(parsed.topRisks).toHaveLength(5);
    expect(parsed.suggestions[0].effortHours).toBe(3);
    expect(() => SynthesisSchema.zod.parse({ ...synthesis, verdict: 'Maybe' })).toThrow();
  });
});

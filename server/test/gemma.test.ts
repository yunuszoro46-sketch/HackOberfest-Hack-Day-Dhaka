import { describe, expect, it, vi } from 'vitest';
import { GemmaError, GemmaProvider, parseLooseJson } from '../src/providers/gemma';
import { MockProvider } from '../src/providers/mock';
import { createDemoProject, DEMO_COMMAND, makeApp } from './helpers';

const reply = (text: string, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status, headers: { 'content-type': 'application/json' } });
const PLAN = '{"tasks":[{"role":"frontend","title":"Build UI and booking validation","description":"d"},{"role":"qa","title":"Test it","description":"d","dependsOn":[0]},{"role":"docs","title":"Write docs","description":"d"}],"note":"three steps"}';
const ctx = {
  project: { id: 'p', name: 'StudySpace', goal: 'Book rooms', constraints: '', createdAt: '' },
  decisions: [], team: ['frontend', 'qa'] as ('frontend' | 'qa')[], command: DEMO_COMMAND,
};
const gemma = (fetchImpl: unknown, extra: Record<string, unknown> = {}) =>
  new GemmaProvider({ apiKey: 'test-key', model: 'gemma-test-it', fetchImpl: fetchImpl as typeof fetch, ...extra });
const failsWith = async (p: Promise<unknown>, reason: string) => {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(GemmaError);
  expect((err as GemmaError).reason).toBe(reason);
};

/** App wired with a Gemma planner whose fetch is stubbed. */
async function appWith(fetchImpl: unknown) {
  const a = makeApp({ providers: { planner: gemma(fetchImpl), runner: new MockProvider() } });
  const pid = await createDemoProject(a.http);
  const r = await a.http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND });
  return { a, pid, r };
}

describe('GemmaProvider (native Gemini API, stubbed fetch)', () => {
  it('fenced JSON with prose → valid plan; key only in a header; no JSON mode', async () => {
    const fetchImpl = vi.fn(async () => reply('Sure! Here is the plan:\n```json\n' + PLAN + '\n```\nLet me know {if} you need more.'));
    const plan = await gemma(fetchImpl).plan(ctx);
    expect(plan.tasks.map((t) => t.role)).toEqual(['frontend', 'qa', 'docs']);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemma-test-it:generateContent');
    expect(url).not.toContain('test-key');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig).toEqual({ temperature: 0.2 });
    expect(body.contents[0].parts[0].text).toContain('Roles not on the team may still be assigned; they will be blocked for the leader');
    expect(parseLooseJson('x {"a":"}"} y {"b":2}')).toEqual({ a: '}' });
  });

  it('ignores Gemma 4 thought parts and asks for minimal thinking', async () => {
    const thought = { text: 'Let me think. Maybe {"tasks": "draft"} ... done.', thought: true };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [thought, { text: PLAN }] } }] }), { status: 200 }));
    const plan = await new GemmaProvider({ apiKey: 'k', model: 'gemma-4-26b-a4b-it', fetchImpl: fetchImpl as unknown as typeof fetch }).plan(ctx);
    expect(plan.tasks).toHaveLength(3);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body)).generationConfig).toEqual({ temperature: 0.2, thinkingConfig: { thinkingLevel: 'minimal' } });
  });

  it('maps HTTP and parse failures to short reasons', async () => {
    await failsWith(gemma(async () => reply('', 401)).plan(ctx), 'AUTH');
    await failsWith(gemma(async () => reply('', 403)).plan(ctx), 'AUTH');
    await failsWith(gemma(async () => reply('', 429)).plan(ctx), 'RATE_LIMIT');
    await failsWith(gemma(async () => reply('', 404)).plan(ctx), 'MODEL_NOT_FOUND');
    await failsWith(gemma(async () => reply('', 500)).plan(ctx), 'UPSTREAM');
    await failsWith(gemma(async () => { throw new TypeError('fetch failed'); }).plan(ctx), 'NETWORK');
    await failsWith(gemma(async () => reply('no json here, sorry')).plan(ctx), 'BAD_JSON');
    await failsWith(gemma(async () => reply('{"tasks": [ {"role": ')).plan(ctx), 'BAD_JSON');
    await failsWith(gemma(async () => reply(PLAN.replace('"qa"', '"ceo"'))).plan(ctx), 'SCHEMA');
    await failsWith(gemma(async () => reply(PLAN.replace('"dependsOn":[0]', '"dependsOn":[7]'))).plan(ctx), 'SCHEMA');
    await failsWith(gemma(async () => reply(PLAN.replace('"Build UI and booking validation"', `"${'x'.repeat(121)}"`))).plan(ctx), 'SCHEMA');
    await failsWith(gemma(async () => reply('{"tasks":[],"note":""}')).plan(ctx), 'SCHEMA');
    await failsWith(gemma(async () => reply(PLAN.replace('"note"', '"extra":1,"note"'))).plan(ctx), 'SCHEMA');
    await failsWith(new GemmaProvider({ apiKey: '', fetchImpl: (async () => reply(PLAN)) as unknown as typeof fetch }).plan(ctx), 'AUTH');
  });

  it('times out after 12s with TIMEOUT', async () => {
    vi.useFakeTimers();
    const hanging = (_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const p = gemma(hanging).plan(ctx);
    const assertion = failsWith(p, 'TIMEOUT');
    await vi.advanceTimersByTimeAsync(12_001);
    await assertion;
    vi.useRealTimers();
  });
});

describe('orchestrator with the Gemma planner', () => {
  it('success → plannerProvider "gemma:<model>", and the approval gate still holds', async () => {
    const { a, pid, r } = await appWith(async () => reply('```json\n' + PLAN + '\n```'));
    expect(r.status).toBe(202);
    expect(r.body.plannerProvider).toBe('gemma:gemma-test-it');
    expect(r.body.run.status).toBe('AWAITING_APPROVAL');
    expect(r.body.tasks.map((t: any) => [t.title, t.status, t.blockedReason])).toEqual([
      ['Build UI and booking validation', 'BLOCKED', 'Awaiting plan approval'],
      ['Test it', 'BLOCKED', 'Awaiting plan approval'],
      ['Write docs', 'BLOCKED', 'No Documentation Writer on the team'],
    ]);
    await a.orch.idle(pid);
    expect(a.repo.runExecutions(r.body.run.id)).toBe(0); // nothing ran before approval
    expect((await a.http.post(`/api/runs/${r.body.run.id}/approve`)).status).toBe(200);
    await a.orch.idle(pid);
    expect(a.repo.listTasks(pid).map((t) => t.status)).toEqual(['REVIEW', 'REVIEW', 'BLOCKED']);
    const snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.activity.some((e: any) => e.type === 'planner.fallback')).toBe(false);
    a.db.close();
  });

  for (const [status, reason] of [[401, 'AUTH'], [429, 'RATE_LIMIT']] as const) {
    it(`HTTP ${status} → rules plan, "rules (fallback: gemma ${reason})", planner.fallback event`, async () => {
      const { a, pid, r } = await appWith(async () => reply('', status));
      expect(r.body.plannerProvider).toBe(`rules (fallback: gemma ${reason})`);
      expect(r.body.tasks).toHaveLength(4); // the rule planner's demo split
      expect(r.body.run.status).toBe('AWAITING_APPROVAL');
      const snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
      const ev = snap.activity.find((e: any) => e.type === 'planner.fallback');
      expect(ev.data.reason).toBe(reason);
      expect(JSON.stringify(snap)).not.toContain('test-key');
      a.db.close();
    });
  }

  it('invalid JSON and unknown role fall back with BAD_JSON / SCHEMA', async () => {
    const bad = await appWith(async () => reply('I cannot help with that.'));
    expect(bad.r.body.plannerProvider).toBe('rules (fallback: gemma BAD_JSON)');
    bad.a.db.close();
    const schema = await appWith(async () => reply(PLAN.replace('"qa"', '"ceo"')));
    expect(schema.r.body.plannerProvider).toBe('rules (fallback: gemma SCHEMA)');
    schema.a.db.close();
  });
});

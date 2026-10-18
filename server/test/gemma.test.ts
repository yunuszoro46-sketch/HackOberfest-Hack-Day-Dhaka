import { describe, expect, it, vi } from 'vitest';
import { GemmaProvider, parseLooseJson } from '../src/providers/gemma';
import { MockProvider } from '../src/providers/mock';
import { createDemoProject, DEMO_COMMAND, makeApp } from './helpers';

const ctx = {
  project: { id: 'p', name: 'StudySpace', goal: 'Book rooms', constraints: '', createdAt: '' },
  decisions: [], team: ['frontend', 'qa'] as const, command: DEMO_COMMAND,
};
const reply = (text: string, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status, headers: { 'content-type': 'application/json' } });
const PLAN = '{"tasks":[{"role":"frontend","title":"Build UI","description":"d"},{"role":"qa","title":"Test it","description":"d"}],"note":"two steps"}';

describe('GemmaProvider.plan', () => {
  it('parses a plan and sends the key only in a header', async () => {
    const fetchImpl = vi.fn(async () => reply(PLAN));
    const g = new GemmaProvider({ apiKey: 'secret-key', model: 'gemma-x', fetchImpl: fetchImpl as any });
    const plan = await g.plan({ ...ctx, team: [...ctx.team] });
    expect(plan.tasks.map((t) => t.role)).toEqual(['frontend', 'qa']);
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).not.toContain('secret-key');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBeUndefined();
  });

  it('accepts fenced JSON with prose around it', async () => {
    const g = new GemmaProvider({ apiKey: 'k', fetchImpl: (async () => reply('Sure!\n```json\n' + PLAN + '\n```')) as any });
    expect((await g.plan({ ...ctx, team: [...ctx.team] })).note).toBe('two steps');
    expect(parseLooseJson('x {"a":1} y')).toEqual({ a: 1 });
  });

  it('throws on HTTP 400, unknown roles and timeouts', async () => {
    await expect(new GemmaProvider({ apiKey: 'k', fetchImpl: (async () => reply('', 400)) as any }).plan({ ...ctx, team: [...ctx.team] })).rejects.toThrow(/HTTP 400/);
    const badRole = PLAN.replace('"qa"', '"ceo"');
    await expect(new GemmaProvider({ apiKey: 'k', fetchImpl: (async () => reply(badRole)) as any }).plan({ ...ctx, team: [...ctx.team] })).rejects.toThrow(/validation/);
    vi.useFakeTimers();
    const hanging = (async (_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as any;
    const p = new GemmaProvider({ apiKey: 'k', fetchImpl: hanging }).plan({ ...ctx, team: [...ctx.team] });
    const assertion = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(12_001);
    await assertion;
    vi.useRealTimers();
  });

  it('orchestrator falls back to rules and labels it', async () => {
    const gemma = new GemmaProvider({ apiKey: 'k', fetchImpl: (async () => reply('', 400)) as any });
    const a = makeApp({ providers: { planner: gemma, runner: new MockProvider() } });
    const pid = await createDemoProject(a.http);
    const r = await a.http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND });
    expect(r.body.plannerProvider).toBe('rules (fallback: gemma — Gemma HTTP 400)');
    expect(r.body.tasks).toHaveLength(4);
    await a.orch.idle(pid);
    a.db.close();
  });

  it('orchestrator uses the Gemma plan when it succeeds', async () => {
    const gemma = new GemmaProvider({ apiKey: 'k', fetchImpl: (async () => reply(PLAN)) as any });
    const a = makeApp({ providers: { planner: gemma, runner: new MockProvider() } });
    const pid = await createDemoProject(a.http);
    const r = await a.http.post(`/api/projects/${pid}/commands`).send({ text: DEMO_COMMAND });
    expect(r.body.plannerProvider).toBe('gemma');
    expect(r.body.tasks.map((t: any) => t.title)).toEqual(['Build UI', 'Test it']);
    await a.orch.idle(pid);
    a.db.close();
  });
});

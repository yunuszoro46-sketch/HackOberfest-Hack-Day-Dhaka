import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BudgetTracker } from '../src/llm/budget';
import { FallbackChain, LlmChainError } from '../src/llm/chain';
import { GeminiClient } from '../src/llm/gemini';
import { OpenAICompatibleClient } from '../src/llm/openai-compatible';
import { createLlm, describeLlm, loadLlmConfig } from '../src/llm/registry';
import { LlmError, type JsonRequest, type JsonResult, type LlmClient } from '../src/llm/types';
import { makeApp } from './helpers';

const Verdict = z.object({ verdict: z.enum(['Build', 'Pivot', 'Drop']), score: z.number().int().min(0).max(100) }).strict();
const JSON_SCHEMA = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['Build', 'Pivot', 'Drop'] }, score: { type: 'integer' } },
  required: ['verdict', 'score'],
  additionalProperties: false,
};
const req = (extra: Partial<JsonRequest<z.infer<typeof Verdict>>> = {}): JsonRequest<z.infer<typeof Verdict>> => ({
  name: 'verdict', system: 'You are a judge.', prompt: 'Score this idea.', schema: Verdict, ...extra,
});
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const chat = (content: string, usage = { prompt_tokens: 12, completion_tokens: 5 }) => json({ choices: [{ message: { content } }], usage });
const gemini = (text: string, extraParts: unknown[] = []) =>
  json({ candidates: [{ content: { parts: [...extraParts, { text }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } });
const GOOD = '{"verdict":"Build","score":81}';

type Call = [string, RequestInit & { headers: Record<string, string> }];
const callOf = (f: ReturnType<typeof vi.fn>, i = 0) => {
  const [url, init] = f.mock.calls[i] as unknown as Call;
  return { url, init, body: JSON.parse(String(init.body)) };
};
const failsWith = async (p: Promise<unknown>, reason: string) => {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(LlmError);
  expect((err as LlmError).reason).toBe(reason);
  return err as LlmError;
};
const groq = (fetchImpl: unknown, extra: Record<string, unknown> = {}) =>
  new OpenAICompatibleClient({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1/', model: 'openai/gpt-oss-120b', apiKey: 'gk-test', fetchImpl: fetchImpl as typeof fetch, ...extra });

afterEach(() => vi.useRealTimers());

describe('OpenAICompatibleClient (stubbed fetch)', () => {
  it('sends a strict json_schema request with a bearer key and returns validated data + usage', async () => {
    const f = vi.fn(async () => chat(GOOD));
    const r = await groq(f).generateJson(req({ jsonSchema: JSON_SCHEMA, maxOutputTokens: 300 }));
    expect(r).toEqual({ data: { verdict: 'Build', score: 81 }, provider: 'groq', model: 'openai/gpt-oss-120b', usage: { inputTokens: 12, outputTokens: 5 } });
    const { url, init, body } = callOf(f);
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer gk-test');
    expect(body).toEqual({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: 'You are a judge.' }, { role: 'user', content: 'Score this idea.' }],
      response_format: { type: 'json_schema', json_schema: { name: 'verdict', strict: true, schema: JSON_SCHEMA } },
      temperature: 0.2,
      max_tokens: 300,
    });
  });

  it('uses json_object without a schema, and keyless local endpoints send no auth header', async () => {
    const f = vi.fn(async () => chat('```json\n' + GOOD + '\n```'));
    const ollama = new OpenAICompatibleClient({ id: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', requiresKey: false, fetchImpl: f as unknown as typeof fetch });
    expect((await ollama.generateJson(req({ system: undefined }))).data.score).toBe(81);
    const { init, body } = callOf(f);
    expect(init.headers.authorization).toBeUndefined();
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([{ role: 'user', content: 'Score this idea.' }]);
  });

  it('maps failures to short reasons and keeps Retry-After', async () => {
    await failsWith(groq(async () => chat(GOOD), { apiKey: '' }).generateJson(req()), 'NOT_CONFIGURED');
    await failsWith(groq(async () => json({}, 401)).generateJson(req()), 'AUTH');
    await failsWith(groq(async () => json({}, 402)).generateJson(req()), 'QUOTA');
    await failsWith(groq(async () => json({}, 404)).generateJson(req()), 'MODEL_NOT_FOUND');
    await failsWith(groq(async () => json({}, 503)).generateJson(req()), 'UPSTREAM');
    const rl = await failsWith(groq(async () => json({ error: 'secret body' }, 429, { 'retry-after': '7' })).generateJson(req()), 'RATE_LIMIT');
    expect(rl.retryAfterSec).toBe(7);
    expect(rl.message).not.toContain('secret body');
    await failsWith(groq(async () => { throw new TypeError('fetch failed'); }).generateJson(req()), 'NETWORK');
    await failsWith(groq(async () => new Response('<html>', { status: 200 })).generateJson(req()), 'BAD_JSON');
    await failsWith(groq(async () => chat('I cannot do that')).generateJson(req()), 'BAD_JSON');
    await failsWith(groq(async () => chat('{"verdict":"Maybe","score":1}')).generateJson(req()), 'SCHEMA');
    await failsWith(groq(async () => chat('{"verdict":"Build","score":1,"extra":true}')).generateJson(req()), 'SCHEMA');
  });

  it('times out with TIMEOUT and honours the caller abort with ABORTED', async () => {
    const hanging = (_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    vi.useFakeTimers();
    const timed = failsWith(groq(hanging, { timeoutMs: 5000 }).generateJson(req()), 'TIMEOUT');
    await vi.advanceTimersByTimeAsync(5001);
    await timed;
    vi.useRealTimers();
    const ac = new AbortController();
    const aborted = failsWith(groq(hanging).generateJson(req({ signal: ac.signal })), 'ABORTED');
    ac.abort();
    await aborted;
    await failsWith(groq(hanging).generateJson(req({ signal: ac.signal })), 'ABORTED');
  });
});

describe('GeminiClient (stubbed fetch)', () => {
  it('Gemini models get JSON mode + responseJsonSchema; key only in a header', async () => {
    const f = vi.fn(async () => gemini(GOOD));
    const r = await new GeminiClient({ apiKey: 'AIza-test', model: 'gemini-2.5-flash', fetchImpl: f as unknown as typeof fetch }).generateJson(req({ jsonSchema: JSON_SCHEMA }));
    expect(r).toEqual({ data: { verdict: 'Build', score: 81 }, provider: 'gemini', model: 'gemini-2.5-flash', usage: { inputTokens: 9, outputTokens: 4 } });
    const { url, init, body } = callOf(f);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(url).not.toContain('AIza-test');
    expect(init.headers['x-goog-api-key']).toBe('AIza-test');
    expect(body.generationConfig).toEqual({ temperature: 0.2, responseMimeType: 'application/json', responseJsonSchema: JSON_SCHEMA });
    expect(body.contents[0].parts[0].text).toBe('You are a judge.\n\nScore this idea.');
  });

  it('Gemma models: no JSON mode, minimal thinking, thought parts ignored', async () => {
    const f = vi.fn(async () => gemini('Here you go: ' + GOOD, [{ text: '{"verdict":"Drop","score":0}', thought: true }]));
    const r = await new GeminiClient({ apiKey: 'k', model: 'gemma-4-26b-a4b-it', fetchImpl: f as unknown as typeof fetch }).generateJson(req({ jsonSchema: JSON_SCHEMA }));
    expect(r.data).toEqual({ verdict: 'Build', score: 81 });
    expect(callOf(f).body.generationConfig).toEqual({ temperature: 0.2, thinkingConfig: { thinkingLevel: 'minimal' } });
  });

  it('maps failures', async () => {
    await failsWith(new GeminiClient({ apiKey: '', model: 'gemini-2.5-flash' }).generateJson(req()), 'NOT_CONFIGURED');
    await failsWith(new GeminiClient({ apiKey: 'k', model: 'x', fetchImpl: (async () => json({}, 403)) as unknown as typeof fetch }).generateJson(req()), 'AUTH');
    await failsWith(new GeminiClient({ apiKey: 'k', model: 'x', fetchImpl: (async () => gemini('nope')) as unknown as typeof fetch }).generateJson(req()), 'BAD_JSON');
  });
});

/** A fake client that answers from a script of results/errors. */
function fake(id: string, script: (LlmError | string)[]): LlmClient & { calls: number } {
  return {
    id, model: `${id}-model`, calls: 0,
    async generateJson<T>(r: JsonRequest<T>): Promise<JsonResult<T>> {
      const step = script[Math.min(this.calls++, script.length - 1)];
      if (step instanceof LlmError) throw step;
      return { data: r.schema.parse(JSON.parse(step)), provider: id, model: `${id}-model`, usage: {} };
    },
  };
}

describe('FallbackChain', () => {
  it('falls through failures in order and reports the attempts', async () => {
    const a = fake('groq', [new LlmError('groq', 'SCHEMA', 'bad')]);
    const b = fake('gemini', [new LlmError('gemini', 'UPSTREAM', 'HTTP 500')]);
    const c = fake('openrouter', [GOOD]);
    const r = await new FallbackChain([{ client: a }, { client: b }, { client: c }]).generateJson(req());
    expect(r.provider).toBe('openrouter');
    expect(r.data).toEqual({ verdict: 'Build', score: 81 });
    expect(r.attempts).toEqual([
      { provider: 'groq', model: 'groq-model', reason: 'SCHEMA' },
      { provider: 'gemini', model: 'gemini-model', reason: 'UPSTREAM' },
    ]);
  });

  it('cools a provider down after 429 (Retry-After wins) and retries it once the wait is over', async () => {
    let now = 1_000_000;
    const a = fake('groq', [new LlmError('groq', 'RATE_LIMIT', 'HTTP 429', 30), GOOD]);
    const b = fake('gemini', [GOOD]);
    const chain = new FallbackChain([{ client: a }, { client: b }], { now: () => now });
    expect((await chain.generateJson(req())).provider).toBe('gemini');
    expect(chain.status()[0].coolingDownUntil).toBe(new Date(now + 30_000).toISOString());
    now += 10_000;
    const second = await chain.generateJson(req());
    expect(second.provider).toBe('gemini');
    expect(second.attempts).toEqual([{ provider: 'groq', model: 'groq-model', reason: 'RATE_LIMIT' }]);
    expect(a.calls).toBe(1); // skipped without a request
    now += 21_000;
    expect((await chain.generateJson(req())).provider).toBe('groq');
  });

  it('enforces RPM and RPD budgets without sending requests', async () => {
    let now = Date.UTC(2026, 9, 20, 12, 0, 0);
    const a = fake('openrouter', [GOOD]);
    const b = fake('ollama', [GOOD]);
    const chain = new FallbackChain([{ client: a, limits: { rpm: 2, rpd: 3 } }, { client: b }], { now: () => now });
    const providers = async (n: number) => { const out = []; for (let i = 0; i < n; i++) out.push((await chain.generateJson(req())).provider); return out; };
    expect(await providers(3)).toEqual(['openrouter', 'openrouter', 'ollama']); // rpm 2
    now += 61_000;
    expect(await providers(2)).toEqual(['openrouter', 'ollama']); // rpd 3 reached
    expect(chain.status()[0].usage).toEqual({ lastMinute: 1, today: 3 });
    now = Date.UTC(2026, 9, 21, 0, 0, 1); // new UTC day
    expect(await providers(1)).toEqual(['openrouter']);
    expect(a.calls).toBe(4);
  });

  it('counts the day in the provider time zone (Gemini resets at midnight Pacific)', () => {
    let now = Date.UTC(2026, 9, 20, 6, 0, 0); // 23:00 PDT on Oct 19
    const t = new BudgetTracker(() => now);
    const pt = { rpd: 1, dayTimeZone: 'America/Los_Angeles' };
    t.record('gemini', pt);
    expect(t.check('gemini', pt)).toEqual({ ok: false, limit: 'rpd' });
    now = Date.UTC(2026, 9, 20, 7, 0, 1); // 00:00 PDT on Oct 20
    expect(t.check('gemini', pt)).toEqual({ ok: true });
  });

  it('prefer moves a provider first; aborts stop the chain; all-failed throws LlmChainError', async () => {
    const a = fake('groq', [GOOD]);
    const b = fake('gemini', [GOOD]);
    expect((await new FallbackChain([{ client: a }, { client: b }]).generateJson(req(), { prefer: 'gemini' })).provider).toBe('gemini');

    const aborting = fake('groq', [new LlmError('groq', 'ABORTED', 'cancelled')]);
    const never = fake('gemini', [GOOD]);
    await failsWith(new FallbackChain([{ client: aborting }, { client: never }]).generateJson(req()), 'ABORTED');
    expect(never.calls).toBe(0);

    const err = await new FallbackChain([{ client: fake('groq', [new LlmError('groq', 'AUTH', 'HTTP 401')]) }]).generateJson(req()).catch((e) => e);
    expect(err).toBeInstanceOf(LlmChainError);
    expect(err.attempts).toEqual([{ provider: 'groq', model: 'groq-model', reason: 'AUTH' }]);
    const none = await new FallbackChain([]).generateJson(req()).catch((e) => e);
    expect(none.message).toBe('no LLM providers are configured');
  });
});

describe('registry (env config)', () => {
  it('defaults: groq, gemini, openrouter; unconfigured without keys; free-tier limits', () => {
    expect(loadLlmConfig({})).toEqual([
      { id: 'groq', model: 'openai/gpt-oss-120b', limits: { rpm: 30, rpd: 1000 }, configured: false, missing: 'GROQ_API_KEY' },
      { id: 'gemini', model: 'gemini-2.5-flash', limits: { dayTimeZone: 'America/Los_Angeles' }, configured: false, missing: 'GEMINI_API_KEY' },
      { id: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free', limits: { rpm: 20, rpd: 50 }, configured: false, missing: 'OPENROUTER_API_KEY' },
    ]);
    expect(createLlm({}).chain.providers).toEqual([]);
  });

  it('honours LLM_PROVIDERS order, model/limit overrides, GEMMA_API_KEY fallback and Ollama', () => {
    const env = {
      LLM_PROVIDERS: 'ollama, gemini,openrouter', GEMMA_API_KEY: 'AIza-gemma', GEMINI_MODEL: 'gemini-3.5-flash-lite',
      OPENROUTER_API_KEY: 'or-key', OPENROUTER_RPD: '1000', OLLAMA_BASE_URL: 'http://gpu-box:11434/', OLLAMA_MODEL: 'qwen3:8b',
    };
    const cfg = loadLlmConfig(env);
    expect(cfg.map((c) => [c.id, c.model, c.configured])).toEqual([
      ['ollama', 'qwen3:8b', true], ['gemini', 'gemini-3.5-flash-lite', true], ['openrouter', 'nvidia/nemotron-3-super-120b-a12b:free', true],
    ]);
    expect(cfg[0].baseUrl).toBe('http://gpu-box:11434/v1');
    expect(cfg[1].apiKey).toBe('AIza-gemma');
    expect(cfg[2].limits).toEqual({ rpm: 20, rpd: 1000 });
    expect(createLlm(env).chain.providers).toEqual(['ollama', 'gemini', 'openrouter']);
  });

  it('rejects unknown/duplicate providers and invalid limits', () => {
    expect(() => loadLlmConfig({ LLM_PROVIDERS: 'groq,huggingface' })).toThrow(/unknown provider "huggingface"/);
    expect(() => loadLlmConfig({ LLM_PROVIDERS: 'groq,groq' })).toThrow(/listed twice/);
    expect(() => loadLlmConfig({ GROQ_RPM: 'lots' })).toThrow('GROQ_RPM must be a positive integer');
    expect(() => loadLlmConfig({ GROQ_RPD: '0' })).toThrow('GROQ_RPD must be a positive integer');
  });

  it('end to end through the registry: groq 429 falls back to gemini with the right wire formats', async () => {
    const f = vi.fn(async (url: string) => (url.includes('groq') ? json({}, 429) : gemini(GOOD)));
    const llm = createLlm({ GROQ_API_KEY: 'gk', GEMINI_API_KEY: 'gm' }, { fetchImpl: f as unknown as typeof fetch });
    const r = await llm.chain.generateJson(req({ jsonSchema: JSON_SCHEMA }));
    expect([r.provider, r.attempts.map((a) => a.reason)]).toEqual(['gemini', ['RATE_LIMIT']]);
    expect(f.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://api.groq.com/openai/v1/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    ]);
    const status = describeLlm(llm).providers;
    expect(status.map((p) => [p.id, p.configured, p.usage?.today ?? null, Boolean(p.coolingDownUntil)])).toEqual([
      ['groq', true, 1, true], ['gemini', true, 1, false], ['openrouter', false, null, false],
    ]);
  });

  it('GET /api/llm/status lists providers without leaking keys', async () => {
    const a = makeApp({ llm: createLlm({ GROQ_API_KEY: 'gk-super-secret' }) });
    const r = await a.http.get('/api/llm/status');
    expect(r.status).toBe(200);
    expect(r.body.providers.map((p: any) => [p.id, p.configured, p.missing ?? null, p.limits])).toEqual([
      ['groq', true, null, { rpm: 30, rpd: 1000 }],
      ['gemini', false, 'GEMINI_API_KEY', { rpm: null, rpd: null }],
      ['openrouter', false, 'OPENROUTER_API_KEY', { rpm: 20, rpd: 50 }],
    ]);
    expect(JSON.stringify(r.body)).not.toContain('gk-super-secret');
    a.db.close();
  });
});

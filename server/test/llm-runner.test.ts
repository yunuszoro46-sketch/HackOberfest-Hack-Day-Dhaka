// Model-driven execution (AGENT_PROVIDER=llm) with a scripted fake model: no network, real files, real checks.
import { describe, expect, it } from 'vitest';
import { FallbackChain } from '../src/llm/chain';
import { LlmError, type JsonRequest, type JsonResult, type LlmClient } from '../src/llm/types';
import { createProviders } from '../src/providers';
import { pathProblem } from '../src/providers/llm';
import { createDemoProject, makeApp } from './helpers';

type Reply = (req: JsonRequest<unknown>) => unknown;

class FakeModel implements LlmClient {
  readonly id = 'fake';
  readonly model = 'fake-1';
  readonly calls: JsonRequest<unknown>[] = [];
  constructor(private readonly replies: Reply[]) {}
  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    this.calls.push(req as JsonRequest<unknown>);
    const next = this.replies.shift();
    if (!next) throw new Error(`unexpected model call: ${req.name}`);
    return { data: req.schema.parse(next(req as JsonRequest<unknown>)), provider: this.id, model: this.model, usage: {} };
  }
}

function llmApp(replies: Reply[]) {
  const model = new FakeModel(replies);
  const providers = createProviders('llm', new FallbackChain([{ client: model }]));
  return { ...makeApp({ providers }), model };
}

const GOOD_SRC = `export function applyDiscount(price: number, pct: number): number {
  if (pct < 0 || pct > 100) throw new RangeError('pct must be between 0 and 100');
  return Math.round(price * (1 - pct / 100) * 100) / 100;
}
`;
const BUGGY_SRC = GOOD_SRC.replace('pct / 100)', 'pct / 10)');
const TESTS = `import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount } from '../src/discount.ts';

test('takes 10% off', () => assert.equal(applyDiscount(200, 10), 180));
test('0% keeps the price', () => assert.equal(applyDiscount(99.99, 0), 99.99));
test('rejects a negative percent', () => assert.throws(() => applyDiscount(10, -1), RangeError));
`;

const plan = () => ({
  tasks: [
    { role: 'frontend', title: 'Implement discount logic', description: 'applyDiscount(price, pct) with node:test coverage' },
    { role: 'qa', title: 'Test edge cases', description: 'Run every check' },
  ],
  note: 'Build, then verify.',
});
const files = (src: string, extra: Record<string, unknown> = {}) => () => ({
  summary: 'Wrote applyDiscount and its tests.',
  files: [{ path: 'src/discount.ts', content: src }, { path: 'tests/discount.test.mjs', content: TESTS }],
  unknowns: [],
  ...extra,
});

async function command(a: ReturnType<typeof llmApp>, pid: string, text: string) {
  const cmd = await a.http.post(`/api/projects/${pid}/commands`).send({ text });
  expect(cmd.status).toBe(202);
  expect((await a.http.post(`/api/runs/${cmd.body.run.id}/approve`)).status).toBe(200);
  await a.orch.idle(pid);
  return cmd.body;
}

describe('LLM runner: one complete task with a real failure and recovery', () => {
  it('model plans and builds, QA really fails, the leader sends it back, the model fixes it, QA passes', async () => {
    const a = llmApp([
      plan,
      files(BUGGY_SRC, { unknowns: ['Demo: planted bug in applyDiscount (divides by 10)'] }),
      files(GOOD_SRC, { summary: 'Fixed the percent divisor in applyDiscount.', files: [{ path: 'src/discount.ts', content: GOOD_SRC }] }),
    ]);
    const pid = await createDemoProject(a.http);
    const cmd = await command(a, pid, 'simulate a failure, implement discount logic and test edge cases');

    // Planning: the model saw the work without the demo switch, and is credited by provider and model.
    expect(a.model.calls[0].name).toBe('plan');
    expect(a.model.calls[0].prompt).toContain('implement discount logic and test edge cases');
    expect(a.model.calls[0].prompt).not.toMatch(/simulate/i);
    expect(cmd.plannerProvider).toBe('fake:fake-1');
    expect(cmd.tasks[0].description).toContain('[Demo fault injection]');

    // Build: the fault injection instruction is explicit, the files are real, the run is credited to the model.
    expect(a.model.calls[1].prompt).toContain('DEMO FAULT INJECTION');
    let snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.run).toMatchObject({ status: 'PAUSED', provider: 'llm' });
    const [build, qa] = snap.tasks;
    expect([build.status, qa.status]).toEqual(['REVIEW', 'FAILED']);
    const buildRun = snap.runs.find((r: any) => r.taskId === build.id);
    const qaRun = snap.runs.find((r: any) => r.taskId === qa.id);
    expect(buildRun.provider).toBe('fake:fake-1');
    expect(qaRun.provider).toBe('deterministic');
    expect(qa.lastError).toMatch(/run-tests \(2 passed, 1 failed: "takes 10% off"\)/);

    // The build handoff says what was checked and what is unknown.
    const toQa = a.repo.listHandoffs(pid).find((m) => m.taskId === qa.id)!;
    expect(toQa.provider).toBe('fake:fake-1');
    expect(toQa.body).toMatch(/Checked: syntax-check src\/discount\.ts: exit 0; syntax-check tests\/discount\.test\.mjs: exit 0\./);
    expect(toQa.body).toMatch(/Unknowns: Demo: planted bug/);

    const d = snap.pendingDecisions[0];
    expect(d).toMatchObject({ proposed: 'fix', provider: 'llm' });
    await a.http.post(`/api/decisions/${d.id}`).send({ action: 'approve', instructions: 'Percent means out of 100.' });
    await a.orch.idle(pid);

    // Fix: the model got the QA report with the real failing output, the buggy code and the leader's note.
    const fixPrompt = a.model.calls[2].prompt;
    expect(fixPrompt).toContain('This is a FIX task');
    expect(fixPrompt).toContain('--- reports/qa-report.md ---');
    expect(fixPrompt).toMatch(/not ok \d+ - takes 10% off/);
    expect(fixPrompt).toContain('pct / 10)');
    expect(fixPrompt).toContain('Percent means out of 100.');
    expect(fixPrompt).not.toContain('DEMO FAULT INJECTION');

    snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.tasks.map((t: any) => [t.role, t.status])).toEqual([['frontend', 'REVIEW'], ['frontend', 'REVIEW'], ['qa', 'REVIEW']]);
    expect(snap.run.status).toBe('COMPLETED');
    const fixRun = snap.runs.find((r: any) => r.taskId === snap.tasks[1].id);
    expect(fixRun).toMatchObject({ provider: 'fake:fake-1', status: 'succeeded' });
    expect(fixRun.summary).toMatch(/^Fixed the percent divisor in applyDiscount\. \(model: fake:fake-1\)$/);

    const qaDetail = (await a.http.get(`/api/tasks/${qa.id}`)).body;
    expect(qaDetail.runs.map((r: any) => r.status)).toEqual(['failed', 'succeeded']);
    const report = (await a.http.get(`/api/artifacts/${qaDetail.artifacts.at(-1).id}`)).body.content as string;
    expect(report).toContain('**Verdict: PASS**');
    expect(report).toContain('provider: deterministic checks, no model');
    expect(report).toMatch(/# pass 3/);
    const src = snap.artifacts.filter((x: any) => x.path === 'src/discount.ts').at(-1);
    expect((await a.http.get(`/api/artifacts/${src.id}`)).body.content).toBe(GOOD_SRC);
    a.db.close();
  });

  it('a fix whose tests still fail does not go back to QA', async () => {
    const a = llmApp([plan, files(BUGGY_SRC), files(BUGGY_SRC, { files: [{ path: 'src/discount.ts', content: BUGGY_SRC }] })]);
    const pid = await createDemoProject(a.http);
    await command(a, pid, 'simulate a failure, implement discount logic and test edge cases');
    const d = (await a.http.get(`/api/projects/${pid}/snapshot`)).body.pendingDecisions[0];
    await a.http.post(`/api/decisions/${d.id}`).send({ action: 'approve' });
    await a.orch.idle(pid);
    const snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.tasks.map((t: any) => t.status)).toEqual(['REVIEW', 'FAILED', 'QUEUED']);
    expect(snap.tasks[1].lastError).toMatch(/^run-tests: 1 failed: "takes 10% off"$/);
    expect(snap.run.status).toBe('PAUSED');
    expect(snap.pendingDecisions[0]).toMatchObject({ proposed: 'retry' });
    a.db.close();
  });
});

describe('LLM runner: guard rails', () => {
  it('rejects a reply that writes outside the allowed paths, writes nothing, and passes the error and note on retry', async () => {
    const a = llmApp([
      plan,
      () => ({ summary: 'oops', files: [{ path: 'src/ok.ts', content: 'export const x = 1;' }, { path: '../escape.ts', content: 'x' }], unknowns: [] }),
      files(GOOD_SRC),
    ]);
    const pid = await createDemoProject(a.http);
    await command(a, pid, 'implement discount logic and test edge cases');
    let snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.tasks[0]).toMatchObject({ status: 'FAILED', lastError: 'Model reply rejected: ../escape.ts: not a plain relative path' });
    expect(snap.artifacts).toHaveLength(0);
    const d = snap.pendingDecisions[0];
    expect(d.proposed).toBe('retry');
    await a.http.post(`/api/decisions/${d.id}`).send({ action: 'approve', instructions: 'Only write under src/ and tests/.' });
    await a.orch.idle(pid);
    expect(a.model.calls[2].prompt).toContain('Your previous attempt (attempt 1) failed: Model reply rejected: ../escape.ts');
    expect(a.model.calls[2].prompt).toContain('- Only write under src/ and tests/.');
    snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.tasks.map((t: any) => t.status)).toEqual(['REVIEW', 'REVIEW']);
    expect(snap.run.status).toBe('COMPLETED');
    a.db.close();
  });

  it('when the model is unavailable the plan falls back to rules and the task fails with the reason', async () => {
    const limited = () => { throw new LlmError('fake', 'RATE_LIMIT', 'HTTP 429'); };
    const a = llmApp([limited]);
    const pid = await createDemoProject(a.http);
    const cmd = await command(a, pid, 'implement booking validation');
    expect(cmd.plannerProvider).toBe('rules (fallback: llm RATE_LIMIT)');
    const snap = (await a.http.get(`/api/projects/${pid}/snapshot`)).body;
    expect(snap.activity.some((e: any) => e.type === 'planner.fallback' && /Model planner unavailable \(RATE_LIMIT/.test(e.message))).toBe(true);
    // The provider is cooling down after the 429, so the task fails without another request.
    expect(snap.tasks[0]).toMatchObject({ status: 'FAILED', lastError: 'Model call failed (fake RATE_LIMIT)' });
    expect(a.model.calls).toHaveLength(1);
    a.db.close();
  });

  it('path rules', () => {
    expect(pathProblem('frontend', 'src/a/b.tsx')).toBeNull();
    expect(pathProblem('backend', 'tests/api.test.mjs')).toBeNull();
    expect(pathProblem('aiml', 'notes/prompt.md')).toBeNull();
    expect(pathProblem('frontend', 'tests/helpers.mjs')).toMatch(/tests must be/);
    expect(pathProblem('frontend', 'reports/qa-report.md')).toMatch(/builders may write/);
    expect(pathProblem('frontend', 'docs/README.md')).toMatch(/builders may write/);
    expect(pathProblem('frontend', '/etc/passwd')).toMatch(/plain relative/);
    expect(pathProblem('frontend', 'src/../../x.ts')).toMatch(/plain relative/);
    expect(pathProblem('researcher', 'src/x.ts')).toMatch(/notes/);
    expect(pathProblem('researcher', 'notes/research-users.md')).toBeNull();
  });

  it('AGENT_PROVIDER=llm without a configured model falls back to templates with a warning', () => {
    const p = createProviders('llm', new FallbackChain([]));
    expect(p.runner.name).toBe('mock');
    expect(p.warning).toMatch(/no model provider is configured/);
  });
});

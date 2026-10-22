// LlmRunner: model-driven planning and execution through the shared LLM fallback chain (server/src/llm).
//
// Builder roles (frontend, backend, AI/ML) and the researcher get their files from a model. The model can only
// answer with files; the runner validates every path, writes through the jailed ToolBox, then runs the real
// approved checks itself. QA and docs stay deterministic on purpose: the verdict comes from commands that really
// ran, never from a model's claim. Every agent run records the provider and model that actually answered.
import { z } from 'zod';
import { AGENT_ROLES, type AgentRole } from '../../../shared/types';
import { BUILDER_ROLES, isFaultInjected, isFixTask, type Plan } from '../agents/planner';
import { LlmChainError, type FallbackChain } from '../llm/chain';
import { LlmError } from '../llm/types';
import type { ToolBox } from '../tools/toolbox';
import { buildPlanPrompt, PlanSchema } from './gemma';
import { runDocs, runQa } from './mock';
import type { AgentProvider, PlanContext, RunContext, RunResult } from './types';

/** Whole-task limit for model-driven runs (one model call plus the checks). */
export const LLM_RUN_TIMEOUT_MS = 180_000;
const CALL_TIMEOUT_MS = 150_000;
const PLAN_TIMEOUT_MS = 45_000;
/** Workspace content handed to the model, so fixes can see the code and the QA report. */
const FILE_LIMIT = 8_000;
const CONTEXT_LIMIT = 48_000;

export const DETERMINISTIC = 'deterministic';

const FileSchema = z.object({ path: z.string().trim().min(1).max(160), content: z.string().max(60_000) });
export const TaskReplySchema = z.object({
  summary: z.string().trim().min(1).max(800),
  files: z.array(FileSchema).min(1).max(8),
  unknowns: z.array(z.string().trim().max(300)).max(8).default([]),
});
export type TaskReply = z.infer<typeof TaskReplySchema>;

const TASK_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files', 'unknowns'],
};

const PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { role: { type: 'string', enum: [...AGENT_ROLES] }, title: { type: 'string' }, description: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'integer' } } },
        required: ['role', 'title', 'description'],
      },
    },
    note: { type: 'string' },
  },
  required: ['tasks', 'note'],
};

const SAFE = /^[A-Za-z0-9_][A-Za-z0-9_\-./]*$/;
const CODE_PATH = /^src\/.+\.(ts|tsx|mjs|js|css|json|md)$/;
const TEST_PATH = /^tests\/[A-Za-z0-9_-]+\.test\.mjs$/;
const NOTE_PATH = /^notes\/.+\.md$/;

/** Why a model-chosen path is refused, or null if it may be written. */
export function pathProblem(role: AgentRole, p: string): string | null {
  if (!SAFE.test(p) || p.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return 'not a plain relative path';
  if (role === 'researcher') return NOTE_PATH.test(p) ? null : 'researchers may only write notes/*.md';
  if (p.startsWith('tests/')) return TEST_PATH.test(p) ? null : 'tests must be tests/<name>.test.mjs (QA only runs those)';
  if (CODE_PATH.test(p) || NOTE_PATH.test(p)) return null;
  return 'builders may write src/**, tests/<name>.test.mjs and notes/*.md only';
}

const failureReason = (err: unknown): string => {
  if (err instanceof LlmChainError) return err.attempts.length ? err.attempts.map((a) => `${a.provider} ${a.reason}`).join(', ') : 'no model provider is configured';
  if (err instanceof LlmError) return `${err.provider} ${err.reason}`;
  return 'unexpected error';
};

/** Short reason code for the planner fallback line (matches the client's allow-list). */
export function planFailureCode(err: unknown): string {
  if (err instanceof LlmChainError) return err.attempts.at(-1)?.reason ?? 'NOT_CONFIGURED';
  if (err instanceof LlmError) return err.reason;
  return 'UPSTREAM';
}

const firstLine = (s: string) => s.split('\n').find((l) => l.trim()) ?? '';

function systemPrompt(ctx: RunContext): string {
  const { role } = ctx;
  if (ctx.task.role === 'researcher') {
    return `You are the ${role.title} on a small software team run by a human leader. ${role.instructions}
You act only by returning files. Write Markdown notes under notes/ (e.g. notes/research-<topic>.md). Label assumptions as assumptions; do not invent sources, numbers or quotes.
Reply with JSON only: {"summary": "1-3 sentences on what you wrote", "files": [{"path": "notes/...", "content": "..."}], "unknowns": ["open questions for the leader"]}`;
  }
  return `You are the ${role.title} on a small software team run by a human leader. ${role.instructions}
You act only by returning complete files. A separate QA Engineer verifies your work by running real commands, so never claim that tests pass.

File rules:
- Allowed paths: src/** (code), tests/<name>.test.mjs (tests), notes/*.md (design notes). Never write reports/ or docs/.
- TypeScript runs under Node's built-in type stripping: no enums, namespaces, parameter properties or decorators. Import local modules with the explicit .ts extension (import { x } from './booking.ts'). Use "import type" for type-only imports.
- Put pure logic in src/*.ts so it can be tested. React components go in src/*.tsx; tests never import .tsx files.
- Tests are tests/<name>.test.mjs: plain JavaScript ES modules using node:test and node:assert/strict, importing from '../src/<file>.ts'. No other packages exist; there is no npm install. Use fixed dates, never the real clock.
- Return the full content of every file you create or change. No diffs, no placeholders, no TODO/FIXME.

QA will: syntax-check every .ts/.mjs/.js file; check that each .tsx file has a default export, at least one aria-* attribute, an empty-state message (e.g. "No rooms found") and no TODO/FIXME; and run node --test "tests/**/*.test.mjs". Every check must pass, so ship at least one test file for your logic.

Reply with JSON only: {"summary": "1-3 sentences on what you did", "files": [{"path": "...", "content": "..."}], "unknowns": ["assumptions or open questions for the leader"]}`;
}

function userPrompt(ctx: RunContext, workspace: { path: string; content: string; truncated: boolean }[]): string {
  const { project, task } = ctx;
  const parts: string[] = [
    `Project: ${project.name}`,
    `Goal: ${project.goal || '(not set)'}`,
    `Constraints: ${project.constraints || '(none)'}`,
    `Leader decisions:\n${ctx.decisions.map((d) => `- ${d.title}: ${d.rationale}`).join('\n') || '- (none)'}`,
    '',
    `Your task: ${task.title}`,
    `Details: ${task.description}`,
  ];
  if (isFixTask(task)) {
    parts.push('', 'This is a FIX task. QA ran the real checks and they failed. Read reports/qa-report.md below, find the root cause and fix the source code so the existing tests pass. Change a test only if the test itself is wrong, and say so in unknowns.');
  }
  if (isFaultInjected(task) && ctx.attempt === 1) {
    parts.push('', 'DEMO FAULT INJECTION (requested by the leader, shown in the plan they approved): in this attempt, write correct tests, but put exactly one realistic, subtle bug in the source under src/ that at least one of your tests catches. Do not mention the bug in code comments. Do list it in unknowns, starting with "Demo: planted bug".');
  }
  if (ctx.leaderNotes.length) parts.push('', `Leader's notes for this task:\n${ctx.leaderNotes.map((n) => `- ${n}`).join('\n')}`);
  if (ctx.previousError) parts.push('', `Your previous attempt (attempt ${ctx.attempt - 1}) failed: ${ctx.previousError}`);
  const prior = ctx.priorResults.filter((r) => r.summary);
  if (prior.length) parts.push('', `Teammates' finished work:\n${prior.map((r) => `- ${r.title} (${r.role}): ${r.summary}`).join('\n')}`);
  if (workspace.length) {
    parts.push('', 'Current workspace files:');
    for (const f of workspace) parts.push(`--- ${f.path}${f.truncated ? ' (truncated)' : ''} ---`, f.content);
  } else {
    parts.push('', 'The workspace is empty.');
  }
  return parts.join('\n');
}

/** Reads the workspace for the prompt: QA report first, then code and tests, within a character budget. */
function readWorkspace(tools: ToolBox): { path: string; content: string; truncated: boolean }[] {
  const rank = (p: string) => (p === 'reports/qa-report.md' ? 0 : p.startsWith('src/') ? 1 : p.startsWith('tests/') ? 2 : p.startsWith('notes/') ? 3 : 9);
  const files = tools.listFiles().filter((p) => rank(p) < 9).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const out: { path: string; content: string; truncated: boolean }[] = [];
  let used = 0;
  for (const p of files) {
    if (used >= CONTEXT_LIMIT) break;
    const raw = tools.readFile(p);
    const content = raw.slice(0, Math.min(FILE_LIMIT, CONTEXT_LIMIT - used));
    used += content.length;
    out.push({ path: p, content, truncated: content.length < raw.length });
  }
  return out;
}

export class LlmRunner implements AgentProvider {
  readonly name = 'llm';
  readonly runTimeoutMs = LLM_RUN_TIMEOUT_MS;

  constructor(private readonly chain: FallbackChain) {}

  /** Configured providers in fallback order, e.g. ["gemini"]. */
  get providers(): string[] {
    return this.chain.providers;
  }

  async plan(ctx: PlanContext): Promise<Plan> {
    const res = await this.chain.generateJson({ name: 'plan', prompt: buildPlanPrompt(ctx), schema: PlanSchema, jsonSchema: PLAN_JSON_SCHEMA, temperature: 0.2, timeoutMs: PLAN_TIMEOUT_MS, signal: ctx.signal });
    return {
      tasks: res.data.tasks.map(({ role, title, description }) => ({ role, title, description })),
      note: res.data.note || `Planned by ${res.provider}.`,
      by: `${res.provider}:${res.model}`,
    };
  }

  async run(ctx: RunContext, tools: ToolBox): Promise<RunResult> {
    // Verification and documentation are never delegated to a model.
    if (ctx.task.role === 'qa') return { ...(await runQa(ctx, tools, 'deterministic checks, no model')), provider: DETERMINISTIC };
    if (ctx.task.role === 'docs') return { ...(await runDocs(ctx, tools, 'deterministic, built from project data, no model')), provider: DETERMINISTIC };
    if (!BUILDER_ROLES.includes(ctx.task.role) && ctx.task.role !== 'researcher') {
      return { ok: false, summary: 'Unsupported role', error: `No model runner for role ${ctx.task.role}` };
    }

    const workspace = readWorkspace(tools);
    let reply: TaskReply;
    let provider: string;
    try {
      const res = await this.chain.generateJson(
        { name: 'task_files', system: systemPrompt(ctx), prompt: userPrompt(ctx, workspace), schema: TaskReplySchema, jsonSchema: TASK_JSON_SCHEMA, temperature: 0.2, timeoutMs: CALL_TIMEOUT_MS, signal: ctx.signal },
      );
      reply = res.data;
      provider = `${res.provider}:${res.model}`;
    } catch (err) {
      return { ok: false, summary: 'No model reply', error: `Model call failed (${failureReason(err)})`, provider: this.name };
    }

    // Validate every path before writing anything: a bad reply writes nothing.
    const seen = new Set<string>();
    for (const f of reply.files) {
      const problem = seen.has(f.path) ? 'listed twice' : pathProblem(ctx.task.role, f.path);
      if (problem) return { ok: false, summary: 'Model reply rejected', error: `Model reply rejected: ${f.path}: ${problem}`, provider };
      seen.add(f.path);
    }
    for (const f of reply.files) tools.writeFile(f.path, f.content.endsWith('\n') ? f.content : `${f.content}\n`);

    const written = reply.files.map((f) => f.path);
    const checks: string[] = [];
    for (const f of written.filter((p) => /\.(ts|mts|mjs|js)$/.test(p))) {
      const r = await tools.runApproved('syntax-check', f);
      checks.push(`syntax-check ${f}: exit ${r.timedOut ? 'timeout' : r.exitCode}`);
      if (r.exitCode !== 0) {
        return { ok: false, summary: `Syntax check failed for ${f}`, error: `${f}: ${firstLine(r.stderr)}`, provider, checks, unknowns: reply.unknowns };
      }
    }
    // A fix must prove itself with the same test run QA uses before it is handed back.
    if (isFixTask(ctx.task) && tools.listFiles().some((p) => TEST_PATH.test(p))) {
      const r = await tools.runApproved('run-tests');
      const pass = /^# pass (\d+)/m.exec(r.stdout)?.[1] ?? '?';
      const fail = /^# fail (\d+)/m.exec(r.stdout)?.[1] ?? '?';
      checks.push(`run-tests: ${pass} passed, ${fail} failed (exit ${r.timedOut ? 'timeout' : r.exitCode})`);
      if (r.exitCode !== 0) {
        const failing = [...r.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => `"${m[1].trim()}"`).slice(0, 5);
        return { ok: false, summary: 'Tests still fail after the fix', error: `run-tests: ${fail} failed${failing.length ? `: ${failing.join(', ')}` : ''}`, provider, checks, unknowns: reply.unknowns };
      }
    }
    return { ok: true, summary: `${reply.summary} (model: ${provider})`, provider, checks, unknowns: reply.unknowns };
  }
}

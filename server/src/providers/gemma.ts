// GemmaProvider (D2): Gemma plans; execution stays with the MockProvider's real tool runs.
//
// Protocol: Google's native Gemini API (not the OpenAI-compatible endpoint):
//   POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
//   key in the x-goog-api-key header (never in the URL), body {contents:[{parts:[{text}]}], generationConfig}.
// Gemma does not support JSON mode (responseMimeType), so the reply text is parsed tolerantly.
import { z } from 'zod';
import { AGENT_ROLES } from '../../../shared/types';
import type { Plan } from '../agents/planner';
import { ROLES } from '../agents/roles';
import { MockProvider } from './mock';
import type { AgentProvider, PlanContext, RunContext, RunResult } from './types';
import type { ToolBox } from '../tools/toolbox';
import { parseLooseJson } from '../llm/json';

export { parseLooseJson };

export const GEMMA_TIMEOUT_MS = 12_000;
// Verified against the live models list for this project's key (2026-10-18): gemma-4-26b-a4b-it, gemma-4-31b-it.
export const DEFAULT_GEMMA_MODEL = 'gemma-4-26b-a4b-it';

/**
 * Gemma 4 thinks before answering by default (3.5k thought tokens, 22–78s measured), which blows the 12s budget.
 * thinkingLevel "minimal" was measured at ~4s with 0 thought tokens; thinkingBudget is rejected (400) for Gemma 4.
 */
const generationConfigFor = (model: string) =>
  model.startsWith('gemma-4') ? { temperature: 0.2, thinkingConfig: { thinkingLevel: 'minimal' } } : { temperature: 0.2 };

/** Short, safe reasons stored on the command. Never contains the key or a raw response body. */
export type GemmaFailure = 'AUTH' | 'RATE_LIMIT' | 'TIMEOUT' | 'BAD_JSON' | 'SCHEMA' | 'MODEL_NOT_FOUND' | 'NETWORK' | 'UPSTREAM';

export class GemmaError extends Error {
  readonly reason: GemmaFailure;
  constructor(reason: GemmaFailure, detail: string) {
    super(detail);
    this.reason = reason;
  }
}

const TaskSchema = z
  .object({
    role: z.enum(AGENT_ROLES),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(''),
    /** Optional 0-based indexes of earlier tasks in this plan. Validated, then ignored: execution is sequential. */
    dependsOn: z.array(z.number().int().min(0)).max(12).optional(),
  })
  .strict();

export const PlanSchema = z
  .object({ tasks: z.array(TaskSchema).min(1).max(12), note: z.string().max(1000).default('') })
  .strict()
  .superRefine((plan, ctx) => {
    plan.tasks.forEach((t, i) => {
      for (const d of t.dependsOn ?? []) {
        // Reject ids outside the plan. (A self-reference is meaningless but harmless: execution is sequential.)
        if (d >= plan.tasks.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `task ${i} depends on ${d}, which is not a task in this plan` });
      }
    });
  });

export function buildPlanPrompt(ctx: PlanContext): string {
  const team = ctx.team.map((r) => `- ${r}: ${ROLES[r].title} — ${ROLES[r].responsibilities.join(', ')}`).join('\n');
  const decisions = ctx.decisions.map((d) => `- ${d.title}: ${d.rationale}`).join('\n') || '- (none)';
  return `You are the planner for a hackathon team. Split the leader's command into concrete tasks.

Project: ${ctx.project.name}
Goal: ${ctx.project.goal || '(not set)'}
Constraints: ${ctx.project.constraints || '(none)'}
Decisions:
${decisions}

Roles on the team (role id: title — responsibilities):
${team}

Leader's command: """${ctx.command}"""

Rules:
- One task per distinct piece of work, in the order it should be done. Testing comes after building; documentation comes last.
- role must be one of: ${AGENT_ROLES.join(', ')}. Use the best-fitting role. Roles not on the team may still be assigned; they will be blocked for the leader.
- 1 to 12 tasks. Titles are short imperative phrases (max 120 characters). Descriptions max 2000 characters.
- dependsOn is optional: 0-based indexes of earlier tasks in this same list.

Reply with ONLY this JSON object, no prose and no extra keys:
{"tasks":[{"role":"frontend","title":"...","description":"...","dependsOn":[]}],"note":"one sentence explaining the split"}`;
}

export class GemmaProvider implements AgentProvider {
  readonly name = 'gemma';
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly runner = new MockProvider();

  constructor(opts: { apiKey?: string; model?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
    this.apiKey = opts.apiKey ?? process.env.GEMMA_API_KEY ?? '';
    this.model = opts.model ?? process.env.GEMMA_MODEL ?? DEFAULT_GEMMA_MODEL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? GEMMA_TIMEOUT_MS;
  }

  /** Recorded as plannerProvider on success, e.g. "gemma:gemma-4-26b-a4b-it". */
  get label(): string {
    return `gemma:${this.model}`;
  }

  async plan(ctx: PlanContext): Promise<Plan> {
    if (!this.apiKey) throw new GemmaError('AUTH', 'GEMMA_API_KEY is not set');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: Response;
    try {
      // Key goes in a header, never the URL (URLs end up in proxy/access logs).
      res = await this.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          signal: ac.signal,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: buildPlanPrompt(ctx) }] }], generationConfig: generationConfigFor(this.model) }),
        },
      );
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === 'AbortError' || ac.signal.aborted) throw new GemmaError('TIMEOUT', `no response within ${this.timeoutMs / 1000}s`);
      throw new GemmaError('NETWORK', 'request failed before a response');
    }
    clearTimeout(timer);

    if (!res.ok) {
      const reason: GemmaFailure = res.status === 401 || res.status === 403 ? 'AUTH' : res.status === 429 ? 'RATE_LIMIT' : res.status === 404 ? 'MODEL_NOT_FOUND' : 'UPSTREAM';
      throw new GemmaError(reason, `HTTP ${res.status}`);
    }

    let text: string;
    try {
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      // Gemma 4 returns its reasoning as separate `thought` parts; only the answer parts hold the plan.
      text = body.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
    } catch {
      throw new GemmaError('BAD_JSON', 'response body was not JSON');
    }
    let raw: unknown;
    try {
      raw = parseLooseJson(text);
    } catch {
      throw new GemmaError('BAD_JSON', 'no parseable JSON object in the model reply');
    }
    const parsed = PlanSchema.safeParse(raw);
    if (!parsed.success) throw new GemmaError('SCHEMA', parsed.error.issues[0]?.message ?? 'plan did not match the schema');
    return {
      tasks: parsed.data.tasks.map(({ role, title, description }) => ({ role, title, description })),
      note: parsed.data.note || 'Planned by Gemma.',
    };
  }

  /** Execution is not model-driven yet; runs are done (and labelled) by the mock role templates. */
  run(ctx: RunContext, tools: ToolBox): Promise<RunResult> {
    return this.runner.run(ctx, tools);
  }
}

// GemmaProvider (D2): Gemma plans; execution stays with the MockProvider's real tool runs.
import { z } from 'zod';
import { AGENT_ROLES } from '../../../shared/types';
import type { Plan } from '../agents/planner';
import { ROLES } from '../agents/roles';
import { MockProvider } from './mock';
import type { AgentProvider, PlanContext, RunContext, RunResult } from './types';
import type { ToolBox } from '../tools/toolbox';

export const GEMMA_TIMEOUT_MS = 12_000;

const PlanSchema = z.object({
  tasks: z
    .array(
      z.object({
        role: z.enum(AGENT_ROLES),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).default(''),
      }),
    )
    .min(1)
    .max(12),
  note: z.string().max(1000).default(''),
});

/** Gemma doesn't support JSON mode, so take the text, strip fences, and parse the first {...} block. */
export function parseLooseJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(unfenced.slice(start, end + 1));
}

export function buildPlanPrompt(ctx: PlanContext): string {
  const team = ctx.team.map((r) => `- ${r}: ${ROLES[r].title} — ${ROLES[r].responsibilities.join(', ')}`).join('\n');
  const decisions = ctx.decisions.map((d) => `- ${d.title}: ${d.rationale}`).join('\n') || '- (none)';
  return `You are the planner for a hackathon team. Split the leader's command into concrete tasks.

Project: ${ctx.project.name}
Goal: ${ctx.project.goal || '(not set)'}
Constraints: ${ctx.project.constraints || '(none)'}
Decisions:
${decisions}

Team members (role id: title — responsibilities):
${team}

Leader's command: """${ctx.command}"""

Rules:
- One task per distinct piece of work, in the order it should be done. Testing comes after building; documentation comes last.
- role must be one of: frontend, backend, aiml, qa, researcher, docs. Use the best-fitting role even if it is not on the team.
- Titles are short imperative phrases (max 8 words).

Reply with ONLY this JSON, no prose:
{"tasks":[{"role":"frontend","title":"...","description":"..."}],"note":"one sentence explaining the split"}`;
}

export class GemmaProvider implements AgentProvider {
  readonly name = 'gemma';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly runner = new MockProvider();

  constructor(opts: { apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = opts.apiKey ?? process.env.GEMMA_API_KEY ?? '';
    this.model = opts.model ?? process.env.GEMMA_MODEL ?? 'gemma-3-27b-it';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async plan(ctx: PlanContext): Promise<Plan> {
    if (!this.apiKey) throw new Error('GEMMA_API_KEY is not set');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), GEMMA_TIMEOUT_MS);
    try {
      // Key goes in a header, never the URL (URLs end up in proxy/access logs).
      const res = await this.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          signal: ac.signal,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: buildPlanPrompt(ctx) }] }], generationConfig: { temperature: 0.2 } }),
        },
      );
      if (!res.ok) throw new Error(`Gemma HTTP ${res.status}`);
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text.trim()) throw new Error('Gemma returned no text');
      const parsed = PlanSchema.safeParse(parseLooseJson(text));
      if (!parsed.success) throw new Error(`Gemma plan failed validation: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      return { tasks: parsed.data.tasks, note: parsed.data.note || 'Planned by Gemma.' };
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw new Error(`Gemma timed out after ${GEMMA_TIMEOUT_MS / 1000}s`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Execution is not model-driven yet; runs are done (and labelled) by the mock role templates. */
  run(ctx: RunContext, tools: ToolBox): Promise<RunResult> {
    return this.runner.run(ctx, tools);
  }
}

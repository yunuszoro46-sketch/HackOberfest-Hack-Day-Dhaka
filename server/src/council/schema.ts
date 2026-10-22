import { z } from 'zod';
import { IDEA_CRITERIA, IDEA_VERDICTS } from '../../../shared/idea-report';

type JsonSchema = Record<string, unknown>;

/** A zod validator and the matching JSON Schema, built together so they cannot drift. */
export interface Field<T> {
  zod: z.ZodType<T, z.ZodTypeDef, unknown>;
  json: JsonSchema;
}

type Shape = Record<string, Field<any>>;
type Infer<S extends Shape> = { [K in keyof S]: S[K] extends Field<infer T> ? T : never };

// Strict structured-output modes (Groq, OpenAI-style) reject min/max keywords on some models, so bounds are
// enforced leniently on our side: long text is cut, numbers are clamped and lists are truncated.
const str = (max = 400): Field<string> => ({
  zod: z.string().trim().min(1).transform((s) => s.slice(0, max)),
  json: { type: 'string' },
});
const int = (min: number, max: number): Field<number> => ({
  zod: z.number().finite().transform((n) => Math.min(max, Math.max(min, Math.round(n)))),
  json: { type: 'integer' },
});
const enm = <T extends string>(values: readonly [T, ...T[]]): Field<T> => ({
  zod: z.enum(values as [T, ...T[]]) as unknown as z.ZodType<T, z.ZodTypeDef, unknown>,
  json: { type: 'string', enum: [...values] },
});
const arr = <T>(item: Field<T>, maxItems: number): Field<T[]> => ({
  zod: z.array(item.zod).transform((a) => a.slice(0, maxItems)),
  json: { type: 'array', items: item.json },
});
const obj = <S extends Shape>(shape: S): Field<Infer<S>> => ({
  zod: z.object(Object.fromEntries(Object.entries(shape).map(([k, f]) => [k, f.zod]))) as unknown as z.ZodType<Infer<S>, z.ZodTypeDef, unknown>,
  json: {
    type: 'object',
    properties: Object.fromEntries(Object.entries(shape).map(([k, f]) => [k, f.json])),
    required: Object.keys(shape),
    additionalProperties: false,
  },
});

const bool: Field<boolean> = { zod: z.boolean(), json: { type: 'boolean' } };

/** Building blocks for other council schemas (e.g. the plan review). */
export const fields = { str, int, enm, arr, obj, bool };

const score = obj({ criterion: enm(IDEA_CRITERIA), score: int(0, 100), rationale: str(300) });
const suggestion = obj({
  title: str(80),
  description: str(300),
  effortHours: int(1, 200),
  impact: enm(['high', 'medium', 'low'] as const),
  group: enm(['mustFix', 'niceToHave', 'wowFactor'] as const),
});
const judgeQuestion = obj({ question: str(200), suggestedAnswer: str(300) });
const ideaCard = obj({
  problem: str(300),
  targetUser: str(200),
  solution: str(300),
  whyNow: str(300),
  hackathonConstraints: str(300),
});

export const MEMBER_ROLE_IDS = ['feasibility', 'market', 'judge'] as const;
export type MemberRoleId = (typeof MEMBER_ROLE_IDS)[number];

export const DraftSchema = obj({
  summary: str(400),
  scores: arr(score, IDEA_CRITERIA.length),
  risks: arr(str(200), 5),
  suggestions: arr(suggestion, 4),
  judgeQuestions: arr(judgeQuestion, 3),
  verdict: enm(IDEA_VERDICTS),
});

export const CritiqueSchema = obj({
  objections: arr(obj({ target: enm(MEMBER_ROLE_IDS), point: str(300), severity: enm(['high', 'medium', 'low'] as const) }), 8),
  missingRisks: arr(str(200), 5),
});

export const SynthesisSchema = obj({
  summary: str(500),
  ideaCard,
  scores: arr(score, IDEA_CRITERIA.length),
  verdict: enm(IDEA_VERDICTS),
  topRisks: arr(str(200), 5),
  suggestions: arr(suggestion, 8),
  judgeQuestions: arr(judgeQuestion, 6),
});

export type CouncilScore = z.output<typeof score.zod>;
export type CouncilDraft = z.output<typeof DraftSchema.zod>;
export type CouncilCritique = z.output<typeof CritiqueSchema.zod>;
export type CouncilSynthesis = z.output<typeof SynthesisSchema.zod>;

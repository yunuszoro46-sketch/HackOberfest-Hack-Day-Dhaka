// The Idea Card: the one JSON object every stage reads from and writes to.
// Every field a model can fill is Lockable; locked values are passed downstream verbatim and never regenerated.
import { z } from "zod";

export const lockable = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({ value: inner, locked: z.boolean().default(false), generatedAt: z.string().optional() });

export type Lockable<T> = { value: T; locked: boolean; generatedAt?: string };

const text = (max = 2000) => z.string().max(max);

export const VERDICTS = ["approve", "conditional", "reject"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CritiqueSchema = z.object({
  strongest_objection: text(600),
  what_would_change_my_mind: text(600),
  one_question: text(300),
  /** Would this critic back the idea as it stands? Defaults keep cards saved before verdicts existed valid. */
  verdict: z.enum(VERDICTS).default("conditional"),
  /** How solid the idea is from this critic's angle, 1 (weak) to 5 (solid). */
  solidity: z.number().int().min(1).max(5).default(3),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export const PERSONAS = ["investor", "user", "engineer"] as const;
export type Persona = (typeof PERSONAS)[number];

export const CouncilSchema = z.object({ investor: CritiqueSchema, user: CritiqueSchema, engineer: CritiqueSchema });
export type Council = z.infer<typeof CouncilSchema>;

/** "tavily" and "google-search" URLs came from a live search; "model-knowledge" entries never carry a URL. */
export const CompetitorSchema = z.object({
  name: text(120),
  url: z.string().max(500),
  whatTheySolve: text(400),
  gap: text(400),
  source: z.enum(["tavily", "google-search", "model-knowledge", "user"]),
});
export type Competitor = z.infer<typeof CompetitorSchema>;

export const DirectionSchema = z.object({
  id: z.string().min(1).max(60),
  title: text(120),
  oneLiner: text(300),
  rationale: text(1200),
  citations: z.array(text(500)).max(10).default([]),
  previewHtml: z.string().max(200_000).optional(),
  /** The kind of bet, shown as the card's tag line, e.g. "NARROW THE USER". */
  tag: z.string().max(40).optional(),
  /** Added by the user rather than generated. */
  custom: z.boolean().optional(),
});
export type Direction = z.infer<typeof DirectionSchema>;

const score = z.number().int().min(1).max(5);
export const StackCandidateSchema = z.object({
  id: z.string().min(1).max(60),
  name: text(120),
  stack: z.array(text(120)).min(1).max(12),
  scores: z.object({ speed: score, fit: score, skills: score, cost: score, hackathon: score }),
  why: text(600),
  whyNot: text(600),
});
export type StackCandidate = z.infer<typeof StackCandidateSchema>;

export const EntitySchema = z.object({
  name: text(80),
  fields: z.array(z.object({ name: text(80), type: text(60), note: text(200).default("") })).max(30),
  relations: z.array(text(200)).max(10).default([]),
});
export type Entity = z.infer<typeof EntitySchema>;

export const EndpointSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: text(200),
  request: text(500).default(""),
  response: text(500).default(""),
  note: text(300).default(""),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

export const ServiceSchema = z.object({ name: text(80), reason: text(300), freeTier: text(300) });
export type Service = z.infer<typeof ServiceSchema>;

export const DeploymentSchema = z.object({
  target: text(120),
  estCostPerMonth: z.number().min(0).max(100_000),
  estHoursToFirstDeploy: z.number().min(0).max(1000),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const RiskSchema = z.object({ risk: text(300), likelihood: z.enum(["low", "medium", "high"]), mitigation: text(400) });
export type Risk = z.infer<typeof RiskSchema>;

export const ArchitectureSchema = z.object({
  candidates: z.array(StackCandidateSchema).max(3),
  chosenId: z.string().nullable(),
  diagramMermaid: lockable(z.string().max(20_000)),
  dataModel: lockable(z.array(EntitySchema).max(20)),
  apiSurface: lockable(z.array(EndpointSchema).max(40)),
  services: lockable(z.array(ServiceSchema).max(15)),
  deployment: lockable(DeploymentSchema.nullable()),
  risks: lockable(z.array(RiskSchema).max(8)),
});
export type Architecture = z.infer<typeof ArchitectureSchema>;

export const PROMPT_TARGETS = ["claude-code", "cursor", "lovable", "generic"] as const;
export type PromptTarget = (typeof PROMPT_TARGETS)[number];

export const ConstraintsSchema = z.object({
  teamSize: z.number().int().min(1).max(50),
  deadlineDays: z.number().min(0).max(365),
  budgetUSD: z.number().min(0).max(1_000_000),
  skills: z.array(text(80)).max(30),
  mustUse: z.array(text(120)).max(20),
  mustAvoid: z.array(text(120)).max(20),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

export const ProvenanceSchema = z.object({
  kind: z.enum(["model", "search", "rules", "mock"]),
  model: z.string().max(120).optional(),
  sources: z.number().int().min(0).max(100).optional(),
  at: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const STAGES = ["interrogate", "council", "preview", "architecture", "prompt", "verify"] as const;
export type StageId = (typeof STAGES)[number];

export const CHECK_STATUSES = ["pass", "fail", "unknown"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

/** One acceptance criterion as judged from a build report. */
export const CheckResultSchema = z.object({
  acId: z.string().max(12),
  criterion: text(600),
  status: z.enum(CHECK_STATUSES),
  /** A line quoted from the report; empty when nothing in the report supports the status. */
  evidence: text(400).default(""),
  /** Who decided: the report named the id (rules), the model matched it, or the user set it. */
  by: z.enum(["rules", "model", "you"]),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const BuildCheckSchema = z.object({
  id: z.string().max(60),
  at: z.string(),
  /** The prompt version the build was made from. */
  promptVersion: z.number().int().min(1),
  report: z.string().max(20_000),
  results: z.array(CheckResultSchema).max(60),
  provenance: ProvenanceSchema.optional(),
});
export type BuildCheck = z.infer<typeof BuildCheckSchema>;

export const LOG_KINDS = ["stage", "lock", "unlock", "direction", "approve", "stack", "sign", "prompt", "check", "review"] as const;
export const LogEntrySchema = z.object({ at: z.string(), kind: z.enum(LOG_KINDS), text: text(300) });
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const ReviewSchema = z.object({
  id: z.string().max(60),
  at: z.string(),
  reviewer: text(80),
  verdict: z.enum(["approve", "changes", "reject"]),
  decisions: z.array(z.object({ question: text(200), answer: text(600), stance: z.enum(["agree", "question"]), comment: text(600).default("") })).max(5),
  note: text(1500).default(""),
  /** The plan the reviewer saw; differs from the current plan when the card changed after sharing. */
  planFingerprint: z.string().max(20),
});
export type Review = z.infer<typeof ReviewSchema>;

export const IdeaCardSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().min(1),
  raw: text(4000),
  /** Answers to the five Interrogator questions, kept so the stage can be re-run. */
  answers: z.array(text(1000)).max(5).default([]),
  problem: lockable(text()),
  targetUser: lockable(text()),
  coreAction: lockable(text(600)),
  whyNow: lockable(text()),
  constraints: ConstraintsSchema,
  council: CouncilSchema.nullable(),
  competitors: z.array(CompetitorSchema).max(8),
  /** How the competitor list was made, for the warning badge. */
  competitorSearch: z.object({ mode: z.enum(["tavily", "google-search", "none"]), queries: z.array(z.string()).max(5), ranAt: z.string() }).nullable().default(null),
  directions: z.array(DirectionSchema).max(3),
  chosenDirectionId: z.string().nullable(),
  /** Direction ids whose preview is shown side by side with the chosen one. */
  compareDirectionId: z.string().nullable().default(null),
  architecture: ArchitectureSchema.nullable(),
  outOfScope: lockable(z.array(text(300)).max(20)),
  prompt: z.object({ markdown: z.string().max(200_000), target: z.enum(PROMPT_TARGETS), version: z.number().int().min(1).default(1) }).nullable(),
  /** Visual archetype for the preview and the prompt; null = neutral component kit. */
  archetypeId: z.string().max(60).nullable().default(null),
  /** The direction whose preview the leader approved (cleared when the chosen direction changes). */
  previewApprovedId: z.string().nullable().default(null),
  /** Who produced each generated block (keyed by block, e.g. "council", "competitors", "preview"). */
  provenance: z.record(z.string(), ProvenanceSchema).default({}),
  /** Human sign-off before compiling: the fingerprint of the plan that was signed. */
  signoff: z.object({ signedAt: z.string(), fingerprint: z.string() }).nullable().default(null),
  /** Build reports checked against the acceptance criteria, newest last. */
  buildChecks: z.array(BuildCheckSchema).max(10).default([]),
  /** Decision log: what the human decided and when, newest last. */
  log: z.array(LogEntrySchema).max(300).default([]),
  /** Reviews received through a share link. */
  reviews: z.array(ReviewSchema).max(20).default([]),
  /**
   * For each stage that has run: a fingerprint of the upstream inputs it ran on. A stage is stale when its
   * stored fingerprint no longer matches the current inputs (see lib/stale.ts).
   */
  stamps: z.record(z.enum(STAGES), z.string()).default({}),
  readiness: z.number().int().min(0).max(100),
});
export type IdeaCard = z.infer<typeof IdeaCardSchema>;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `idea-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const emptyLockable = <T>(value: T): Lockable<T> => ({ value, locked: false });

export function newIdeaCard(raw: string, now = new Date().toISOString()): IdeaCard {
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    version: 1,
    raw,
    answers: [],
    problem: emptyLockable(""),
    targetUser: emptyLockable(""),
    coreAction: emptyLockable(""),
    whyNow: emptyLockable(""),
    constraints: { teamSize: 1, deadlineDays: 2, budgetUSD: 0, skills: [], mustUse: [], mustAvoid: [] },
    council: null,
    competitors: [],
    competitorSearch: null,
    directions: [],
    chosenDirectionId: null,
    compareDirectionId: null,
    architecture: null,
    outOfScope: emptyLockable([]),
    prompt: null,
    archetypeId: null,
    previewApprovedId: null,
    signoff: null,
    provenance: {},
    buildChecks: [],
    log: [],
    reviews: [],
    stamps: {},
    readiness: 0,
  };
}

/** An empty architecture block around freshly generated candidates. */
export function emptyArchitecture(candidates: StackCandidate[]): Architecture {
  return {
    candidates,
    chosenId: null,
    diagramMermaid: emptyLockable(""),
    dataModel: emptyLockable([]),
    apiSurface: emptyLockable([]),
    services: emptyLockable([]),
    deployment: emptyLockable(null),
    risks: emptyLockable([]),
  };
}

export const chosenDirection = (card: IdeaCard): Direction | null => card.directions.find((d) => d.id === card.chosenDirectionId) ?? null;

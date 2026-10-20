export const IDEA_VERDICTS = ['Build', 'Pivot', 'Drop'] as const;
export type IdeaVerdict = (typeof IDEA_VERDICTS)[number];

export const IDEA_EVIDENCE_LABELS = ['Found', 'Inferred', 'Assumed'] as const;
export type IdeaEvidenceLabel = (typeof IDEA_EVIDENCE_LABELS)[number];

export const IDEA_CRITERIA = ['problemClarity', 'originality', 'feasibility', 'demoAbility', 'impact', 'technicalDepth', 'themeFit'] as const;
export type IdeaCriterion = (typeof IDEA_CRITERIA)[number];

export type IdeaMode = 'quick' | 'deep';

export interface IdeaInput {
  idea: string;
  theme?: string | null;
  hoursLeft?: number | null;
  teamSkills?: string | null;
  targetJudges?: string | null;
  mode?: IdeaMode;
}

export interface IdeaCard {
  problem: string;
  targetUser: string;
  solution: string;
  whyNow: string;
  hackathonConstraints: string;
}

export interface CriterionScore {
  criterion: IdeaCriterion;
  score: number;
  evidenceLabel: IdeaEvidenceLabel;
  evidence: string;
}

export interface IdeaReport {
  id: string;
  generatedAt: string;
  mode: IdeaMode;
  input: IdeaInput;
  ideaCard: IdeaCard;
  criteria: CriterionScore[];
  overallScore: number;
  verdict: IdeaVerdict;
  topRisks: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toSentenceCase = (value: string) => value.trim().replace(/\s+/g, ' ');

const safeString = (value?: string | null) => (value && value.trim() ? value.trim() : 'general users');

const createId = () => {
  if (typeof globalThis !== 'undefined' && 'crypto' in globalThis && typeof (globalThis as any).crypto?.randomUUID === 'function') {
    return (globalThis as any).crypto.randomUUID();
  }
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

function deriveProblem(rawIdea: string): string {
  const idea = toSentenceCase(rawIdea);
  const match = idea.match(/(?:for|help|solve|reduce|improve|fix|track|find)\s+([^.!?]+)[.!?]?$/i);
  const problemText = match ? match[1].trim() : idea;
  if (problemText.length <= 140) return problemText;
  return `${problemText.slice(0, 137).trim()}...`;
}

function deriveTargetUser(rawIdea: string): string {
  const idea = toSentenceCase(rawIdea).toLowerCase();
  const userPatterns = [
    /for\s+([a-z0-9][a-z0-9\s,-]{0,60})\s+(?:who|that|to|with)/i,
    /for\s+([a-z0-9][a-z0-9\s,-]{0,60})(?:\.|!|\?|:|$)/i,
    /people\s+who\s+([a-z0-9\s,-]{0,60})/i,
    /users?\s+(?:such as|including|like)?\s*([a-z0-9\s,-]{0,60})/i,
  ];

  for (const pattern of userPatterns) {
    const result = idea.match(pattern);
    if (result?.[1]) {
      return safeString(result[1].replace(/\s{2,}/g, ' '));
    }
  }

  return 'busy people with an unmet daily need';
}

function deriveSolution(rawIdea: string): string {
  const idea = toSentenceCase(rawIdea);
  const keywords = ['app', 'platform', 'dashboard', 'tool', 'service', 'experience', 'assistant', 'workflow', 'product'];
  const match = idea.match(/(?:a|an|the)\s+([a-z0-9\s-]{0,80})\s+(?:app|platform|dashboard|tool|service|assistant|workflow|product|website|experience)/i);
  if (match?.[1]) {
    return `${match[1].trim()} ${match[0].match(/(?:app|platform|dashboard|tool|service|assistant|workflow|product|website|experience)/i)?.[0] ?? 'solution'}`;
  }

  if (keywords.some((keyword) => idea.toLowerCase().includes(keyword))) {
    return 'A simple digital workflow that reduces friction and creates a clear decision path.';
  }

  return 'A lightweight product concept that turns the pain point into a clear, testable experience.';
}

export function buildIdeaCard(input: IdeaInput): IdeaCard {
  const idea = toSentenceCase(safeString(input.idea));
  const theme = safeString(input.theme);
  const hoursLeft = typeof input.hoursLeft === 'number' && Number.isFinite(input.hoursLeft) ? input.hoursLeft : 24;
  const teamSkills = safeString(input.teamSkills);

  return {
    problem: deriveProblem(idea),
    targetUser: deriveTargetUser(idea),
    solution: deriveSolution(idea),
    whyNow: `The problem is visible now because users already feel the pain, and the market is ready for a fast, focused response within ${hoursLeft} hours of build time.`,
    hackathonConstraints: `Theme: ${theme}. Team: ${teamSkills}. Hours left: ${hoursLeft}.`,
  };
}

function rateCriterion(criterion: IdeaCriterion, input: IdeaInput, ideaText: string): CriterionScore {
  const theme = safeString(input.theme).toLowerCase();
  const text = `${ideaText} ${theme} ${safeString(input.teamSkills)}`.toLowerCase();
  const hours = typeof input.hoursLeft === 'number' && Number.isFinite(input.hoursLeft) ? input.hoursLeft : 24;
  const hasSpecificUser = /(for|users?|students?|parents?|farmers?|small businesses?|commuters?|drivers?|patients?|workers?|teams?)/i.test(text);
  const hasPain = /(problem|pain|waste|slow|hard|difficulty|friction|frustrat|lag|risk|cost|time|missing|lack|need|struggle)/i.test(text);
  const hasTruthySolution = /(app|tool|platform|service|dashboard|assistant|workflow|portfolio|website|system|product|prototype)/i.test(text);
  const hasDemoSignal = /(dashboard|map|flow|booking|tracking|alerts|recommend|search|filter|upload|share|voice|ai)/i.test(text);
  const hasThemeFit = theme && theme !== 'general users' ? true : false;

  const baseScores: Record<IdeaCriterion, { score: number; evidenceLabel: IdeaEvidenceLabel; evidence: string }> = {
    problemClarity: {
      score: clamp((hasPain ? 30 : 10) + (hasSpecificUser ? 20 : 8) + (hasTruthySolution ? 15 : 5) + (ideaText.split(/\s+/).length > 12 ? 20 : 10), 0, 100),
      evidenceLabel: hasPain && hasSpecificUser ? 'Found' : 'Inferred',
      evidence: hasPain && hasSpecificUser ? 'The idea names a user group and a pain point in plain language.' : 'The problem is understandable, but the idea could be more explicit about the user and friction.',
    },
    originality: {
      score: clamp(45 + (hasDemoSignal ? 18 : 0) + (hasThemeFit ? 11 : 0) + (ideaText.split(/\s+/).length > 20 ? 10 : 4), 0, 100),
      evidenceLabel: hasDemoSignal ? 'Inferred' : 'Assumed',
      evidence: hasDemoSignal ? 'The concept has a specific surface area and differentiation signal.' : 'Originality is plausible but needs sharper positioning against existing alternatives.',
    },
    feasibility: {
      score: clamp((hours >= 150 ? 85 : hours >= 48 ? 72 : 56) + (safeString(input.teamSkills).length > 10 ? 8 : 0), 0, 100),
      evidenceLabel: hours >= 24 ? 'Inferred' : 'Assumed',
      evidence: `The build window is ${hours} hours, which is enough for a focused MVP if scope stays narrow.`,
    },
    demoAbility: {
      score: clamp((hasDemoSignal ? 38 : 18) + (ideaText.split(/\s+/).length > 8 ? 22 : 10) + (hours >= 48 ? 18 : 8), 0, 100),
      evidenceLabel: hasDemoSignal ? 'Found' : 'Assumed',
      evidence: hasDemoSignal ? 'The idea maps to a visual flow or workflow that can be demoed in a short session.' : 'The idea is promising, but it needs a concrete demo flow to feel real during judging.',
    },
    impact: {
      score: clamp((hasPain ? 30 : 12) + (hasSpecificUser ? 25 : 10) + (hours >= 150 ? 12 : 5) + (theme.includes('local') || theme.includes('real') ? 15 : 5), 0, 100),
      evidenceLabel: hasPain && hasSpecificUser ? 'Found' : 'Inferred',
      evidence: hasPain && hasSpecificUser ? 'The user pain and repeatability suggest a clear impact if the solution works.' : 'Impact is likely, but the problem statement should show frequency and urgency.',
    },
    technicalDepth: {
      score: clamp((/(ai|ml|algorithm|predict|recommend|analytics|real[- ]?time|map|chat|search|automation)/i.test(text) ? 38 : 12) + (hasTruthySolution ? 22 : 8) + (hasDemoSignal ? 15 : 8), 0, 100),
      evidenceLabel: /(ai|ml|analytics|real[- ]?time|automation)/i.test(text) ? 'Found' : 'Inferred',
      evidence: /(ai|ml|analytics|real[- ]?time|automation)/i.test(text) ? 'The idea includes technical depth that can be shown in architecture and product decisions.' : 'The concept is technically viable but would benefit from a clearly defined technical hook.',
    },
    themeFit: {
      score: clamp((hasThemeFit ? 60 : 40) + (/(theme|hackathon|local|community|real life|impact)/i.test(text) ? 18 : 6), 0, 100),
      evidenceLabel: hasThemeFit ? 'Found' : 'Assumed',
      evidence: hasThemeFit ? 'The idea aligns with the theme and likely judges’ expectations.' : 'The concept is generally interesting, but it would be stronger with a clearer theme or audience fit.',
    },
  };

  return {
    criterion,
    score: clamp(Math.round(baseScores[criterion].score), 0, 100),
    evidenceLabel: baseScores[criterion].evidenceLabel,
    evidence: baseScores[criterion].evidence,
  };
}

export function scoreIdea(input: IdeaInput): IdeaReport {
  const mode: IdeaMode = input.mode ?? 'quick';
  const normalizedInput: IdeaInput = {
    idea: toSentenceCase(safeString(input.idea)),
    theme: safeString(input.theme),
    hoursLeft: typeof input.hoursLeft === 'number' && Number.isFinite(input.hoursLeft) ? Math.max(1, input.hoursLeft) : 24,
    teamSkills: safeString(input.teamSkills),
    targetJudges: input.targetJudges ?? undefined,
    mode,
  };

  const ideaCard = buildIdeaCard(normalizedInput);
  const criteria = IDEA_CRITERIA.map((criterion) => rateCriterion(criterion, normalizedInput, normalizedInput.idea));
  const overallScore = Math.round(criteria.reduce((sum, item) => sum + item.score, 0) / criteria.length);

  const verdict: IdeaVerdict = overallScore >= 75 ? 'Build' : overallScore >= 60 ? 'Pivot' : 'Drop';

  const topRisks = [
    'The user pain point is not specific enough yet to prove strong product-market fit.',
    'A weak differentiation story could make the idea feel like a clone of existing tools.',
    'Scope creep or external dependencies can eat the build budget before the demo is stable.',
  ];

  const reportMode: IdeaMode = normalizedInput.mode ?? 'quick';

  return {
    id: createId(),
    generatedAt: new Date().toISOString(),
    mode: reportMode,
    input: normalizedInput,
    ideaCard,
    criteria,
    overallScore,
    verdict,
    topRisks,
  };
}

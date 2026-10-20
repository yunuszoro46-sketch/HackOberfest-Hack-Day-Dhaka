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

export type RecommendationGroup = 'mustFix' | 'niceToHave' | 'wowFactor';
export type ImpactRating = 'high' | 'medium' | 'low';

export interface UpgradeSuggestion {
  title: string;
  description: string;
  effortHours: number;
  impact: ImpactRating;
  group: RecommendationGroup;
}

export interface UserSimulation {
  user: string;
  goal: string;
  getsStuckAt: string;
  improvement: string;
}

export interface JudgeQuestion {
  question: string;
  suggestedAnswer: string;
}

export interface FailureSimulation {
  scenario: string;
  fallback: string;
}

export interface TimeCrunchPlan {
  cutLineHours: number;
  keep: string[];
  cut: string[];
}

export interface ImpactScenario {
  outcome: 'best' | 'expected' | 'worst';
  description: string;
  assumption: string;
}

export interface ArchitectureOption {
  name: string;
  description: string;
  advantages: string[];
  tradeoffs: string[];
  fitScore: number;
}

export interface ApiEndpointRecommendation {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  purpose: string;
}

export interface ArchitectureDecision {
  title: string;
  decision: string;
  rationale: string;
  consequences: string[];
}

export interface SystemDesignRecommendation {
  options: ArchitectureOption[];
  selectedOption: string;
  mermaidDiagram: string;
  dataModel: { entity: string; fields: string[] }[];
  endpoints: ApiEndpointRecommendation[];
  decisionRecord: ArchitectureDecision;
}

export interface DesignReference {
  name: string;
  url: string;
  whyRelevant: string;
}

export interface UiUxDirection {
  principles: string[];
  keyScreens: string[];
  mainFlow: string[];
  colorAndType: string;
  components: string[];
  references: DesignReference[];
}

export interface CouncilSummary {
  /** Council roles whose turn succeeded, in turn order. */
  members: string[];
  /** Providers that answered at least one turn. */
  providers: string[];
  /** LLM calls made (each may have fallen back across providers). */
  calls: number;
  /** Set when the council ran degraded, e.g. the chair failed and drafts were averaged. */
  note?: string;
}

export interface IdeaAnalysis {
  method: 'rule-based' | 'council';
  limitation: string;
  council?: CouncilSummary;
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
  analysis: IdeaAnalysis;
  upgradeSuggestions: Record<RecommendationGroup, UpgradeSuggestion[]>;
  userSimulations: UserSimulation[];
  judgeQuestions: JudgeQuestion[];
  failureSimulations: FailureSimulation[];
  timeCrunch: TimeCrunchPlan;
  impactScenarios: ImpactScenario[];
  systemDesign: SystemDesignRecommendation;
  uiUxDirection: UiUxDirection;
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

function buildUpgradeSuggestions(input: IdeaInput, hasSpecificUser: boolean, hasDemoSignal: boolean): Record<RecommendationGroup, UpgradeSuggestion[]> {
  const hours = input.hoursLeft ?? 24;
  const mustFix: UpgradeSuggestion[] = [];
  if (!hasSpecificUser) {
    mustFix.push({
      title: 'Name one primary user',
      description: 'Choose the first person who feels this problem and describe the moment they need help.',
      effortHours: 1,
      impact: 'high',
      group: 'mustFix',
    });
  }
  mustFix.push({
    title: 'Validate the problem with real users',
    description: 'Speak with at least three representative users and record the current workaround, frequency, and cost of the problem.',
    effortHours: Math.min(4, Math.max(1, Math.ceil(hours * 0.05))),
    impact: 'high',
    group: 'mustFix',
  });
  if (!hasDemoSignal) {
    mustFix.push({
      title: 'Define one end-to-end demo path',
      description: 'Write down the input, the visible product response, and the successful outcome for a single user journey.',
      effortHours: 2,
      impact: 'high',
      group: 'mustFix',
    });
  }

  return {
    mustFix,
    niceToHave: [
      {
        title: 'Add a measurable success signal',
        description: 'Pick one metric that demonstrates the intended user benefit, such as time saved or successful task completion.',
        effortHours: 2,
        impact: 'medium',
        group: 'niceToHave',
      },
      {
        title: 'Prepare a resilient demo dataset',
        description: 'Use a small, clearly labeled sample dataset so the key flow remains demonstrable if live services are unreliable.',
        effortHours: 2,
        impact: 'medium',
        group: 'niceToHave',
      },
    ],
    wowFactor: [
      {
        title: 'Show the before-and-after experience',
        description: 'Make the old workaround and the improved outcome visible in the demo, using a real user example when available.',
        effortHours: 3,
        impact: 'high',
        group: 'wowFactor',
      },
      {
        title: 'Add one trustworthy technical differentiator',
        description: 'Demonstrate a single technical feature that is essential to the user outcome instead of adding technology for its own sake.',
        effortHours: 4,
        impact: 'medium',
        group: 'wowFactor',
      },
    ],
  };
}

function buildUserSimulations(targetUser: string, solution: string): UserSimulation[] {
  return [
    {
      user: `A first-time ${targetUser}`,
      goal: 'Understand quickly whether this product can help with the immediate problem.',
      getsStuckAt: 'The user may not know what information to provide or what the first result means.',
      improvement: 'Use a short onboarding prompt, a realistic example, and plain-language result labels.',
    },
    {
      user: `A returning ${targetUser}`,
      goal: 'Complete the core task with less effort than the current workaround.',
      getsStuckAt: 'The user may have to repeat setup or re-enter details on every visit.',
      improvement: 'Keep the primary action prominent and preserve relevant state where feasible.',
    },
    {
      user: 'A skeptical or low-connectivity user',
      goal: 'Verify the result and continue even when trust or connectivity is limited.',
      getsStuckAt: `The user may not trust an unexplained recommendation from ${solution.toLowerCase()}.`,
      improvement: 'Show the source or reason behind key results and provide a clear offline or manual fallback.',
    },
  ];
}

function buildJudgeQuestions(input: IdeaInput, targetUser: string): JudgeQuestion[] {
  const audience = input.targetJudges?.trim() || 'the people judging this project';
  return [
    {
      question: 'What specific problem are you solving, and for whom?',
      suggestedAnswer: `We are focusing on ${targetUser}. We will validate the pain and its current workaround with users rather than claiming the need is already proven.`,
    },
    {
      question: 'How do you know people actually have this problem?',
      suggestedAnswer: 'We will share direct user observations or interviews from this build, and label any remaining assumptions clearly.',
    },
    {
      question: 'What makes this different from existing alternatives?',
      suggestedAnswer: 'We will compare the core workflow with relevant alternatives and explain the specific gap our prototype tests.',
    },
    {
      question: 'Why is this the right solution rather than a simpler process change?',
      suggestedAnswer: 'The prototype will test whether the chosen workflow reduces a real point of friction; if not, we will simplify or pivot.',
    },
    {
      question: 'Can your team deliver this reliably in the available time?',
      suggestedAnswer: `Our plan is scoped to ${input.hoursLeft ?? 24} hours and the stated skills (${input.teamSkills?.trim() || 'not yet specified'}), with a narrow demo-ready MVP.`,
    },
    {
      question: 'How will you measure whether the solution works?',
      suggestedAnswer: 'We will use one observable task outcome, such as a completed user task or reduced time versus the current workaround.',
    },
    {
      question: 'What happens when a key API, model, or network connection fails?',
      suggestedAnswer: 'The demo has a labeled sample-data or manual fallback, and the core user flow will not depend on an unverified live integration.',
    },
    {
      question: `Why should ${audience} care about this idea?`,
      suggestedAnswer: 'We will connect the user problem to the event goals with evidence from the target users and a concrete, working demonstration.',
    },
  ];
}

function buildFailureSimulations(): FailureSimulation[] {
  return [
    {
      scenario: 'The live demo breaks.',
      fallback: 'Switch to a rehearsed, labeled recording or screenshots, explain the intended flow, and show the last known working build.',
    },
    {
      scenario: 'A required API or external service is down.',
      fallback: 'Use a small local fixture or mock response labeled as sample data; keep the core flow independent of the external service.',
    },
    {
      scenario: 'The venue has no reliable internet.',
      fallback: 'Preload assets and sample data, test the app offline, and prepare a short local walkthrough.',
    },
    {
      scenario: 'There are no real users available before judging.',
      fallback: 'State that validation is incomplete, show the interview questions and assumptions, and avoid presenting hypothetical results as user evidence.',
    },
  ];
}

function buildTimeCrunch(input: IdeaInput): TimeCrunchPlan {
  const hours = input.hoursLeft ?? 24;
  const cutLineHours = Math.max(1, Math.floor(hours / 2));
  return {
    cutLineHours,
    keep: [
      'One complete happy-path user journey.',
      'A reliable demo using verified or clearly labeled sample data.',
      'Basic error handling and a tested fallback.',
      'A concise explanation of the user problem and what remains unvalidated.',
    ],
    cut: [
      'Secondary features and additional user roles.',
      'Optional integrations that are not required for the core outcome.',
      'Advanced settings, analytics, and visual polish beyond the main demo path.',
    ],
  };
}

function buildImpactScenarios(targetUser: string): ImpactScenario[] {
  return [
    {
      outcome: 'best',
      description: `The prototype addresses a frequent, meaningful problem for ${targetUser} and earns follow-up testing with relevant partners.`,
      assumption: 'Target users confirm the problem is urgent, and the demo shows a clear improvement over their workaround.',
    },
    {
      outcome: 'expected',
      description: 'The team delivers a credible prototype, learns which parts of the problem matter most, and identifies a focused next iteration.',
      assumption: 'The hackathon validates the workflow direction but does not establish broad adoption or long-term impact.',
    },
    {
      outcome: 'worst',
      description: 'The prototype does not solve a high-priority problem or cannot demonstrate its benefit reliably.',
      assumption: 'User feedback contradicts the initial problem framing, or core dependencies prevent a dependable demo.',
    },
  ];
}

function buildSystemDesign(input: IdeaInput): SystemDesignRecommendation {
  const skills = (input.teamSkills ?? '').toLowerCase();
  const hours = input.hoursLeft ?? 24;
  const hasWebSkills = /(react|javascript|typescript|node|web|frontend|backend)/i.test(skills);
  const hasPythonSkills = /(python|django|fastapi|flask)/i.test(skills);
  const focusedMvpFit = (hasWebSkills ? 88 : hasPythonSkills ? 82 : 74) + (hours >= 48 ? 4 : 0);

  return {
    options: [
      {
        name: 'Single web app with managed database',
        description: 'A browser client, one API service, and one managed relational database.',
        advantages: ['Fastest route to one complete demo flow.', 'Simple deployment and debugging.', 'Easy to keep scope aligned with a small team.'],
        tradeoffs: ['Less independent scaling by feature.', 'External services need clear fallbacks.', 'Requires deliberate boundaries as the product grows.'],
        fitScore: Math.min(100, focusedMvpFit),
      },
      {
        name: 'Serverless functions with managed services',
        description: 'A static client calling independent functions and hosted data or identity services.',
        advantages: ['Low infrastructure maintenance.', 'Useful when a managed service solves a core need.', 'Can scale individual functions independently.'],
        tradeoffs: ['Provider setup and permissions can consume hackathon time.', 'Local testing may be less representative.', 'Vendor limits can shape the product unexpectedly.'],
        fitScore: Math.max(50, Math.min(92, focusedMvpFit - 8)),
      },
      {
        name: 'Separate frontend, API, and worker services',
        description: 'Deploy independently owned services behind an API boundary, with asynchronous jobs as needed.',
        advantages: ['Clear service ownership and independent scaling.', 'Useful for genuinely long-running or high-volume workloads.', 'Supports separate technology choices by component.'],
        tradeoffs: ['More deployment, observability, and integration work.', 'Harder to finish and demo with limited hours.', 'Premature unless workload needs justify the complexity.'],
        fitScore: Math.max(35, Math.min(80, focusedMvpFit - 25)),
      },
    ],
    selectedOption: 'Single web app with managed database',
    mermaidDiagram: [
      'flowchart LR',
      '  U[User] --> UI[Web client]',
      '  UI --> API[Validated API]',
      '  API --> DB[(Relational data store)]',
      '  API --> EXT[Optional external API]',
      '  API --> OBS[Logs and error reporting]',
    ].join('\n'),
    dataModel: [
      { entity: 'Idea', fields: ['id', 'ownerId?', 'ideaText', 'theme', 'createdAt'] },
      { entity: 'AnalysisRun', fields: ['id', 'ideaId', 'mode', 'status', 'score', 'verdict', 'createdAt'] },
      { entity: 'ReportSection', fields: ['id', 'runId', 'sectionKey', 'structuredContent', 'evidenceLevel'] },
      { entity: 'Reference', fields: ['id', 'runId', 'provider', 'url', 'summary', 'similarity', 'checkedAt'] },
    ],
    endpoints: [
      { method: 'POST', path: '/api/ideas/report', purpose: 'Validate an idea submission and return a quick structured assessment.' },
      { method: 'POST', path: '/api/ideas/research', purpose: 'Run externally sourced research after explicit user confirmation.' },
      { method: 'GET', path: '/api/ideas/:ideaId/reports/:reportId', purpose: 'Retrieve a saved report for later review.' },
      { method: 'GET', path: '/api/ideas/:ideaId/reports', purpose: 'List prior reports so iterations can be compared.' },
    ],
    decisionRecord: {
      title: 'Use a single web application for the first build',
      decision: 'Keep the client, API, and persistence in a small, clearly separated application; add external services only where needed.',
      rationale: `This fits the supplied team skills (${input.teamSkills?.trim() || 'not specified'}) and ${hours} available hours, keeps the demo path testable, and avoids operating multiple services before the need is proven.`,
      consequences: [
        'Prioritize one vertical user journey and typed API boundaries.',
        'Treat external integrations as optional and provide sample-data fallbacks.',
        'Revisit service separation only when a specific scale, ownership, or reliability need appears.',
      ],
    },
  };
}

function buildUiUxDirection(): UiUxDirection {
  return {
    principles: [
      'Lead with the idea verdict and the evidence strength; never imply assumptions are research findings.',
      'Progressively disclose deep analysis so a first-time user gets value quickly.',
      'Keep the user in control before external research or other costly work begins.',
      'Design for keyboard, screen-reader, mobile, and reduced-motion use.',
      'Use plain language and make uncertainty and failure states actionable.',
    ],
    keyScreens: [
      'Idea intake: short idea field, optional constraints, team skills, judge audience, and Quick/Deep choice.',
      'Approval and progress: clear research scope, confirmation, provider status, and cancel/retry behavior.',
      'Report overview: verdict, score, evidence labels, top risks, and next recommended action.',
      'Report details: research references, simulations, architecture, UI direction, and build/pitch plan.',
      'Iteration comparison: previous and current score, changed criteria, and the edited idea.',
    ],
    mainFlow: [
      'Enter a one-sentence idea and optional context.',
      'Choose Quick or Deep and review what the selected mode will do.',
      'Review the initial assessment and explicitly approve external research when needed.',
      'Follow clear progress states while report sections are generated.',
      'Inspect evidence, risks, and recommendations; edit and rerun to compare scores.',
    ],
    colorAndType: 'Use a restrained indigo accent for primary actions, neutral high-contrast surfaces for report reading, and distinct accessible colors plus text labels for Build/Pivot/Drop and Found/Inferred/Assumed. Use a highly legible sans-serif for body text and a monospaced face only for technical diagrams or metadata.',
    components: [
      'Idea input form with optional context fields',
      'Quick/Deep mode selector with effort disclosure',
      'Verdict and score summary card',
      'Evidence badge and criterion score row',
      'Research source card with provider and link status',
      'Progress stepper and provider status list',
      'Recommendation card with effort and impact chips',
      'Scenario accordion and judge Q&A list',
      'Mermaid diagram panel and endpoint table',
      'Accessible report tabs and iteration score comparison',
    ],
    references: [
      {
        name: 'W3C WCAG 2.2 Quick Reference',
        url: 'https://www.w3.org/WAI/WCAG22/quickref/',
        whyRelevant: 'Accessibility checklist for contrast, keyboard interaction, focus, and understandable controls.',
      },
      {
        name: 'Material Design 3',
        url: 'https://m3.material.io/',
        whyRelevant: 'Reference for consistent component states, layout, and accessible interaction patterns.',
      },
      {
        name: 'GOV.UK Design System',
        url: 'https://design-system.service.gov.uk/',
        whyRelevant: 'Practical examples of plain-language forms, predictable patterns, and accessible content hierarchy.',
      },
    ],
  };
}

export const verdictFor = (overallScore: number): IdeaVerdict => (overallScore >= 75 ? 'Build' : overallScore >= 60 ? 'Pivot' : 'Drop');

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

  const verdict = verdictFor(overallScore);
  const hasSpecificUser = /(for|users?|students?|parents?|farmers?|small businesses?|commuters?|drivers?|patients?|workers?|teams?)/i.test(normalizedInput.idea);
  const hasDemoSignal = /(dashboard|map|flow|booking|tracking|alerts|recommend|search|filter|upload|share|voice|ai)/i.test(normalizedInput.idea);
  const upgrades = buildUpgradeSuggestions(normalizedInput, hasSpecificUser, hasDemoSignal);
  const targetUser = ideaCard.targetUser;

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
    analysis: {
      method: 'rule-based',
      limitation: 'These recommendations and simulations are generated from the submitted text and constraints; they are hypotheses, not user research or validated market evidence.',
    },
    upgradeSuggestions: upgrades,
    userSimulations: buildUserSimulations(targetUser, ideaCard.solution),
    judgeQuestions: buildJudgeQuestions(normalizedInput, targetUser),
    failureSimulations: buildFailureSimulations(),
    timeCrunch: buildTimeCrunch(normalizedInput),
    impactScenarios: buildImpactScenarios(targetUser),
    systemDesign: buildSystemDesign(normalizedInput),
    uiUxDirection: buildUiUxDirection(),
  };
}

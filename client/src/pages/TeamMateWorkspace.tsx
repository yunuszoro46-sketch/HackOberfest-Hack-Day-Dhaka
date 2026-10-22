import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { TeamMateWordmark, HexagonPrimitive } from '../components/teammate/HexagonIdentity';
import { ProvenanceBadge, ProvenanceLegendModal } from '../components/teammate/ProvenanceBadge';
import { VisualArchetypes, ARCHETYPES } from '../components/teammate/VisualArchetypes';
import { PromptGenerator } from '../components/teammate/PromptGenerator';
import { SevenSegmentDisplay } from '../components/teammate/SevenSegment';
import { ThemeSelector } from '../components/ThemeSelector';
import { useTheme } from '../hooks/useTheme';
import { voiceDispatcher } from '../utils/speech';
import { scoreIdea, type IdeaInput, type IdeaReport } from '../../../shared/idea-report';
import { api } from '../api';
import { CouncilStep, VERDICT_STYLE } from '../components/teammate/CouncilStep';
import { CustomizeToggle, EditableList, editButton, editField } from '../components/teammate/EditableList';
import type { VisualArchetype } from '../components/teammate/VisualArchetypes';
import type { PlanReview, PlanSpec } from '../../../shared/plan-review';

export type StepId = 'idea' | 'assess' | 'explore' | 'plan' | 'council' | 'approve' | 'generate';

const STEPS: { id: StepId; label: string; index: number }[] = [
  { id: 'idea', label: 'Idea', index: 1 },
  { id: 'assess', label: 'Assess', index: 2 },
  { id: 'explore', label: 'Explore', index: 3 },
  { id: 'plan', label: 'Plan', index: 4 },
  { id: 'council', label: 'Council', index: 5 },
  { id: 'approve', label: 'Approve', index: 6 },
  { id: 'generate', label: 'Prompt', index: 7 },
];
const STEP_ORDER = STEPS.map((s) => s.id);

type Priority = 'P0' | 'P1' | 'P2';
type Feature = { id: string; title: string; priority: Priority; selected: boolean };

/** Starting scope from the assessment's time-crunch plan: what to keep is P0, what to cut is P2 and unselected. */
function featuresFromReport(rep: IdeaReport, idea: string): Feature[] {
  const main = idea.split(/(?<=[.!?])\s/)[0].slice(0, 160);
  return [
    { id: 'r-main', title: `Main demo path: ${main}`, priority: 'P0', selected: true },
    ...rep.timeCrunch.keep.slice(1).map((t, i) => ({ id: `r-keep-${i}`, title: t.replace(/\.$/, ''), priority: 'P0' as const, selected: true })),
    ...rep.timeCrunch.cut.map((t, i) => ({ id: `r-cut-${i}`, title: t.replace(/\.$/, ''), priority: 'P2' as const, selected: false })),
  ];
}

const STACK_OPTIONS: Record<'framework' | 'styling' | 'database' | 'stateManagement', { label: string; options: string[] }> = {
  framework: { label: 'Frontend framework', options: ['React 19 (Vite SPA)', 'Next.js 15 (App Router)', 'Vue 3 (Vite)', 'SvelteKit (Node adapter)'] },
  styling: { label: 'Styling system', options: ['Tailwind CSS v4 with custom CSS variables', 'Vanilla CSS Modules + Design Tokens', 'Radix UI Primitives + Tailwind CSS'] },
  database: { label: 'Data layer & persistence', options: ['In-Memory SQLite / Browser Storage', 'PostgreSQL (Drizzle ORM)', 'Client-Side IndexedDB / LocalStorage', 'REST API with In-Memory Mocks'] },
  stateManagement: { label: 'State management', options: ['React Context + Hooks', 'Zustand Store', 'TanStack Query + Local State'] },
};

const PRESETS = [
  {
    title: 'Campus Study Room Booking',
    idea: 'StudySpace: students see live study-room availability on campus and book a slot in two taps. Validation rules block double bookings, over-capacity groups and bookings in the past, and a QA suite proves it.',
    theme: 'Education & Campus Life',
    teamSkills: 'React, TypeScript, Node.js',
    targetJudges: 'Student-experience and product judges',
    hoursLeft: 48,
  },
  {
    title: 'Local First AI Journal',
    idea: 'Private mental wellness and reflection app that uses local embeddings for privacy-first sentiment tracking, structured retrospective prompts, and end-to-end encrypted backup.',
    theme: 'Consumer AI & Privacy',
    teamSkills: 'React, IndexedDB, Transformers.js',
    targetJudges: 'UX researchers and security evaluators',
    hoursLeft: 140,
  },
  {
    title: 'Decentralized Energy Arbitrage',
    idea: 'Visual telemetry tool mapping solar battery microgrid export rates against dynamic spot prices, giving small homeowners automated dispatch timing schedules.',
    theme: 'Climate & Clean Energy',
    teamSkills: 'TypeScript, Fastify, D3 / Recharts',
    targetJudges: 'Climate investors and systems engineers',
    hoursLeft: 72,
  },
];

export function TeamMateWorkspace() {
  const [currentStep, setCurrentStep] = useState<StepId>('idea');

  // Step 1: Idea State
  const [ideaInput, setIdeaInput] = useState<IdeaInput>({
    idea: '',
    theme: '',
    hoursLeft: 120,
    teamSkills: '',
    targetJudges: '',
    mode: 'quick',
  });

  // Step 2: Assessment State
  const [assessing, setAssessing] = useState(false);
  const [report, setReport] = useState<IdeaReport | null>(null);
  const [reportProvenance, setReportProvenance] = useState<'model' | 'rule-based'>('rule-based');
  const [modelUsed, setModelUsed] = useState<string | undefined>(undefined);

  // Step 3: Explore State
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>('hardware-lcd');

  // Step 4: Plan State
  const [techStack, setTechStack] = useState({
    framework: 'React 19 (Vite SPA)',
    styling: 'Tailwind CSS v4 with custom CSS variables',
    database: 'In-Memory SQLite / Browser Storage',
    stateManagement: 'React Context + Hooks',
  });

  const [features, setFeatures] = useState<Feature[]>([
    { id: 'f1', title: 'Main demo path that works end to end', priority: 'P0', selected: true },
    { id: 'f2', title: 'Labelled seed data so the demo works offline', priority: 'P0', selected: true },
    { id: 'f3', title: 'Clear error and empty states on the main screens', priority: 'P1', selected: true },
    { id: 'f4', title: 'Accessibility pass: contrast, focus rings, 44px touch targets', priority: 'P1', selected: true },
    { id: 'f5', title: 'Settings and secondary user roles', priority: 'P2', selected: false },
  ]);
  /** Once the leader edits features, the assessment no longer replaces them. */
  const [featuresTouched, setFeaturesTouched] = useState(false);
  const editFeatures = (fn: (prev: Feature[]) => Feature[]) => {
    setFeaturesTouched(true);
    setFeatures(fn);
  };

  const [newFeatureText, setNewFeatureText] = useState('');

  const [constraints, setConstraints] = useState([
    'Ship a working end-to-end demo path before any polish',
    'WCAG AA 4.5:1 text contrast',
    'Minimum 44x44px touch targets on all interactive triggers',
    'No API keys or secrets in frontend code',
  ]);

  const [nonGoals, setNonGoals] = useState([
    'User accounts and authentication unless the demo needs them',
    'Production-scale infrastructure and multi-region deployment',
    'Features outside the selected P0 and P1 list',
  ]);

  const [decisions, setDecisions] = useState([
    {
      question: 'Will the demo use live data or seed data?',
      answer: 'Labelled seed data for the demo; live integrations are stretch goals.',
      approved: true,
    },
    {
      question: 'Which visual direction will the UI follow?',
      answer: 'The visual archetype chosen in the Explore step.',
      approved: true,
    },
    {
      question: 'Is human approval required before generating final AI prompts?',
      answer: 'Yes, "The Human Has the Key" rule mandates explicit user sign-off.',
      approved: true,
    },
  ]);

  // Customize panels, one per step
  const [editAssess, setEditAssess] = useState(false);
  const [assessEdited, setAssessEdited] = useState(false);
  const [editExplore, setEditExplore] = useState(false);
  const [customArchetype, setCustomArchetype] = useState<VisualArchetype | null>(null);
  const [editStack, setEditStack] = useState(false);
  const [editDecisions, setEditDecisions] = useState(false);

  // Step 5: Council review
  const [review, setReview] = useState<PlanReview | null>(null);
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const [overrideCouncil, setOverrideCouncil] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  // Step 6: Approval State
  /** The exact plan the leader signed; any later edit needs a new sign-off. */
  const [approvedKey, setApprovedKey] = useState<string | null>(null);
  /** Recorded when the leader approves against the council; goes into the prompt, not into the reviewed plan. */
  const [overrideRecord, setOverrideRecord] = useState<{ question: string; answer: string; approved: boolean } | null>(null);

  // Provenance Legend Modal State
  const [showLegend, setShowLegend] = useState(false);

  // Theme state: Console Dark and Dim Night modes
  const { theme, setTheme } = useTheme();

  // Check LLM status on mount to know if Groq/Gemini is configured
  useEffect(() => {
    fetch('/api/llm/status')
      .then((r) => r.json())
      .then((data) => {
        const groq = data?.providers?.find((p: any) => p.id === 'groq' && p.configured);
        const gemini = data?.providers?.find((p: any) => p.id === 'gemini' && p.configured);
        if (groq) {
          setModelUsed(groq.model || 'Groq');
        } else if (gemini) {
          setModelUsed(gemini.model || 'Gemini');
        }
      })
      .catch(() => {});
  }, []);

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setIdeaInput({
      idea: preset.idea,
      theme: preset.theme,
      hoursLeft: preset.hoursLeft,
      teamSkills: preset.teamSkills,
      targetJudges: preset.targetJudges,
      mode: 'quick',
    });
  };

  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => !voiceDispatcher.isMuted());

  const handleRunAssessment = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ideaInput.idea.trim()) return;

    setAssessing(true);
    try {
      const rep = await api.createIdeaReport(ideaInput);
      setReport(rep);
      // /api/ideas/report is the rule-based scorer; a model only takes part in the council steps.
      setReportProvenance('rule-based');
      setAssessEdited(false);
      if (!featuresTouched) setFeatures(featuresFromReport(rep, ideaInput.idea));
      voiceDispatcher.speakAssessment(rep.overallScore, ideaInput.theme || 'concept');
    } catch {
      const rep = scoreIdea(ideaInput);
      setReport(rep);
      setReportProvenance('rule-based');
      setAssessEdited(false);
      if (!featuresTouched) setFeatures(featuresFromReport(rep, ideaInput.idea));
      voiceDispatcher.speakAssessment(rep.overallScore, ideaInput.theme || 'concept');
    } finally {
      setAssessing(false);
      setCurrentStep('assess');
    }
  };

  const handleAddCustomFeature = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeatureText.trim()) return;
    editFeatures((prev) => [
      ...prev,
      {
        id: `f-${Date.now()}`,
        title: newFeatureText.trim(),
        priority: 'P1',
        selected: true,
      },
    ]);
    setNewFeatureText('');
  };

  const selectedArchetype = (selectedArchetypeId === 'custom' && customArchetype) || ARCHETYPES.find((a) => a.id === selectedArchetypeId) || ARCHETYPES[0];

  /** Everything the leader has decided, as the council and the prompt see it. */
  const spec: PlanSpec = useMemo(() => ({
    idea: { ...ideaInput, hoursLeft: Math.max(1, Math.round(Number(ideaInput.hoursLeft) || 1)) },
    ...(report ? { ideaCard: { problem: report.ideaCard.problem, targetUser: report.ideaCard.targetUser, solution: report.ideaCard.solution }, assessmentScore: report.overallScore, knownRisks: report.topRisks.filter((r) => r.trim()).slice(0, 10) } : {}),
    visualDirection: `${selectedArchetype.name}: ${selectedArchetype.tagline}`.slice(0, 300),
    techStack,
    features: features.filter((f) => f.selected && f.title.trim()).map(({ title, priority }) => ({ title: title.trim(), priority })),
    constraints: constraints.filter((c) => c.trim()),
    nonGoals: nonGoals.filter((c) => c.trim()),
    decisions: decisions.filter((d) => d.question.trim() && d.answer.trim()).map(({ question, answer }) => ({ question, answer })),
  }), [ideaInput, report, selectedArchetype, techStack, features, constraints, nonGoals, decisions]);
  const specKey = JSON.stringify(spec);
  const councilStale = !!review && reviewKey !== null && reviewKey !== specKey;
  const verdict = review?.status === 'COMPLETED' ? review.result?.verdict ?? null : null;
  const councilBlocks = !verdict || verdict !== 'approval-ready' || councilStale;
  const humanApproved = approvedKey === specKey;

  /** Applies an edit to the assessment report and marks it as edited by the leader. */
  const editReport = (fn: (r: IdeaReport) => IdeaReport) => {
    setReport((r) => (r ? fn(r) : r));
    setAssessEdited(true);
  };

  return (
    <div className="min-h-screen bg-[var(--glass)] text-[var(--text)] flex flex-col selection:bg-[var(--brand)] selection:text-[#101010]">
      {/* 3A.8 App Header at z-20 (Strict 3-zone contract) */}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--glass)]/95 backdrop-blur-md px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* Zone 1: Single Brand Wordmark Device */}
        <div className="flex items-center gap-2">
          <TeamMateWordmark size="md" />
        </div>

        {/* Zone 2: Navigation / Purpose */}
        <div className="hidden md:flex items-center gap-4 text-xs font-mono text-[var(--text-dim)]">
          <span>AI PLANNING WORKSPACE</span>
          <span aria-hidden="true">·</span>
          <span className="text-[var(--text)] font-medium">The Human Has the Key</span>
          <span aria-hidden="true">·</span>
          <ProvenanceBadge
            type={reportProvenance}
            modelName={modelUsed}
            interactive
            onClick={() => setShowLegend(true)}
            detail="Click to inspect Provenance Legend and verification sources"
          />
        </div>

        {/* Zone 3: the rest of TeamMate, appearance mode & actions */}
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Main" className="flex items-center gap-1 text-xs font-mono">
            <Link to="/dashboard" className="inline-flex min-h-[36px] items-center rounded px-2 text-[var(--text-dim)] hover:text-[var(--text)]">Team projects</Link>
            <Link to="/ideas" className="inline-flex min-h-[36px] items-center rounded px-2 text-[var(--text-dim)] hover:text-[var(--text)]">IdeaMate</Link>
            <Link to="/teammate" className="inline-flex min-h-[36px] items-center rounded px-2 text-[var(--text-dim)] hover:text-[var(--text)]">How it works</Link>
          </nav>
          <ThemeSelector compact />

          {/* Voice Synthesizer Toggle */}
          <button
            type="button"
            onClick={() => {
              const next = !voiceEnabled;
              setVoiceEnabled(next);
              voiceDispatcher.setMuted(!next);
            }}
            title="Toggle AI Voice Synthesizer Dispatch"
            aria-label={`Toggle AI voice speech readout (currently ${voiceEnabled ? 'armed' : 'muted'})`}
            className={`min-h-[36px] min-w-[36px] px-2.5 py-1 rounded text-xs font-mono flex items-center justify-center gap-1.5 transition-colors border ${
              voiceEnabled
                ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--panel)]'
                : 'border-[var(--line)] text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            <svg className="w-3.5 h-3.5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <span className="hidden sm:inline">{voiceEnabled ? 'VOICE ON' : 'MUTED'}</span>
          </button>
        </div>
      </header>

      {/* 3A.6 Semantic Workflow Map (<ol>) */}
      <nav aria-label="Planning Progress Journey" className="border-b border-[var(--line)] bg-[var(--panel)] px-4 sm:px-6 py-2 overflow-x-auto">
        <ol className="max-w-6xl mx-auto flex items-center justify-between gap-2 min-w-[680px]">
          {STEPS.map((step) => {
            const isCurrent = currentStep === step.id;
            const isCompleted = STEP_ORDER.indexOf(currentStep) > STEP_ORDER.indexOf(step.id);
            const isApprovalStep = step.id === 'approve';

            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (step.id === 'idea' || report || isCompleted || isCurrent) {
                      setCurrentStep(step.id);
                    }
                  }}
                  disabled={!report && step.id !== 'idea'}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150 min-h-[44px] text-xs font-mono active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)] disabled:opacity-40 disabled:cursor-not-allowed ${
                    isCurrent
                      ? 'bg-[var(--glass)] text-[var(--brand)] font-bold border border-[var(--brand)]/50 shadow-sm'
                      : isCompleted
                      ? 'text-[var(--ok)] hover:bg-[var(--glass)]'
                      : 'text-[var(--text-dim)] hover:text-[var(--text)]'
                  }`}
                >
                  <HexagonPrimitive
                    size={24}
                    active={isCurrent}
                    completed={isCompleted}
                    requiresApproval={isApprovalStep && currentStep === 'approve' && !humanApproved}
                  >
                    {isCompleted ? '✓' : step.index}
                  </HexagonPrimitive>
                  <span className="whitespace-nowrap">{step.index}. {step.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* 3A.2 Main Workspace Canvas with 8px Grid Spacing (16 mobile, 24 tablet, 48 desktop) */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-12 space-y-8">
        {/* STEP 1: IDEA DISCOVERY */}
        {currentStep === 'idea' && (
          <section aria-labelledby="step-idea-title" className="space-y-6">
            <div className="border-b border-[var(--line)] pb-4">
              <span className="text-xs font-mono uppercase text-[var(--text-dim)]">STEP 01</span>
              <h1 id="step-idea-title" className="text-2xl sm:text-3xl font-bold text-[var(--text)] mt-1">
                Define the Core Concept & Parameters
              </h1>
              <p className="text-sm sm:text-base text-[var(--text-dim)] mt-2 max-w-[80ch] leading-6">
                Enter your project vision, target audience, and timeframe constraints. TeamMate will assess its feasibility and prepare a build plan.
              </p>
            </div>

            {/* Quick-Fill Preset Buttons on 8px Grid */}
            <div>
              <span className="text-xs font-mono uppercase text-[var(--text-dim)] block mb-2">
                RAPID INSPIRATION PRESETS:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {PRESETS.map((p) => (
                  <button
                    key={p.title}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="p-4 text-left rounded-xl border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--brand)] hover:bg-[var(--glass)] active:scale-[0.98] transition-all duration-150 min-h-[44px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                  >
                    <div className="text-xs font-mono font-bold text-[var(--brand)]">{p.title}</div>
                    <div className="text-xs text-[var(--text-dim)] line-clamp-2 mt-1">{p.idea}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Idea Submission Form */}
            <form onSubmit={handleRunAssessment} className="space-y-6">
              <div>
                <label htmlFor="idea-text" className="block text-xs font-mono uppercase text-[var(--text)] mb-2 font-semibold">
                  PROJECT PROBLEM & SOLUTION PITCH *
                </label>
                <textarea
                  id="idea-text"
                  required
                  rows={4}
                  value={ideaInput.idea}
                  onChange={(e) => setIdeaInput({ ...ideaInput, idea: e.target.value })}
                  placeholder="Describe what you want to create, the exact user problem it solves, and its standout mechanism..."
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--glass)] p-4 text-sm sm:text-base text-[var(--text)] focus:border-[var(--brand)] focus:outline-none font-sans leading-relaxed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="theme-text" className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">
                    HACKATHON THEME / TRACK
                  </label>
                  <input
                    id="theme-text"
                    type="text"
                    value={ideaInput.theme || ''}
                    onChange={(e) => setIdeaInput({ ...ideaInput, theme: e.target.value })}
                    placeholder="e.g. SRE Tools, Climate, AI Agents"
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                  />
                </div>

                <div>
                  <label htmlFor="skills-text" className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">
                    TEAM SKILLSET
                  </label>
                  <input
                    id="skills-text"
                    type="text"
                    value={ideaInput.teamSkills || ''}
                    onChange={(e) => setIdeaInput({ ...ideaInput, teamSkills: e.target.value })}
                    placeholder="e.g. React, Node, WebGL"
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                  />
                </div>

                <div>
                  <label htmlFor="hours-number" className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">
                    HOURS LEFT TO SUBMIT
                  </label>
                  <input
                    id="hours-number"
                    type="number"
                    min={1}
                    max={1000}
                    value={ideaInput.hoursLeft || 120}
                    onChange={(e) => setIdeaInput({ ...ideaInput, hoursLeft: Number(e.target.value) })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                  />
                </div>

                <div>
                  <label htmlFor="judges-text" className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">
                    TARGET JUDGES / CRITERIA
                  </label>
                  <input
                    id="judges-text"
                    type="text"
                    value={ideaInput.targetJudges || ''}
                    onChange={(e) => setIdeaInput({ ...ideaInput, targetJudges: e.target.value })}
                    placeholder="e.g. Feasibility & execution polish"
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={assessing || !ideaInput.idea.trim()}
                  className="min-h-[48px] px-6 py-2.5 bg-[var(--brand)] text-[#101010] [data-theme='light']_:text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-[var(--brand)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_15px_var(--amber-glow)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                >
                  {assessing ? 'COMPUTING ASSESSMENT...' : 'ASSESS THIS CONCEPT →'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* STEP 2: STRUCTURED ASSESSMENT (IdeaMate Council Engine) */}
        {currentStep === 'assess' && report && (
          <section aria-labelledby="step-assess-title" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
              <div>
                <span className="text-xs font-mono uppercase text-[var(--text-dim)]">STEP 02</span>
                <h1 id="step-assess-title" className="text-2xl sm:text-3xl font-bold text-[var(--text)] mt-1">
                  Idea Feasibility & Evaluation Matrix
                </h1>
                <p className="text-sm text-[var(--text-dim)] mt-1">
                  Structured assessment calculated with honest provenance indicators.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {assessEdited && <ProvenanceBadge type="edited" detail="You changed the idea card, scores or risks" />}
                <ProvenanceBadge
                  type={reportProvenance}
                  modelName={modelUsed}
                  interactive
                  onClick={() => setShowLegend(true)}
                  detail="Click to inspect Provenance Legend"
                />
                <CustomizeToggle open={editAssess} onToggle={() => setEditAssess((o) => !o)} />
              </div>
            </div>

            {editAssess && (
              <div className="rounded-xl border border-[var(--info)]/50 bg-[var(--panel)] p-4 sm:p-6 space-y-5" data-testid="assess-editor">
                <div>
                  <h2 className="text-xs font-mono uppercase font-bold text-[var(--info)] tracking-wider">Customize the assessment</h2>
                  <p className="text-xs text-[var(--text-dim)] mt-1">Your edits replace the generated values and are marked "Edited by you". The council sees the edited version.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['problem', 'targetUser', 'solution'] as const).map((k) => (
                    <label key={k} className="block">
                      <span className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">{k === 'targetUser' ? 'Target user' : k}</span>
                      <textarea rows={3} maxLength={k === 'targetUser' ? 300 : 500} className={editField} value={report.ideaCard[k]}
                        onChange={(e) => editReport((r) => ({ ...r, ideaCard: { ...r.ideaCard, [k]: e.target.value } }))} />
                    </label>
                  ))}
                </div>
                <div>
                  <span className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-2">Scores (overall is the average)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {report.criteria.map((c) => (
                      <label key={c.criterion} className="flex items-center gap-3 text-xs font-mono">
                        <span className="w-32 shrink-0 capitalize text-[var(--text)]">{c.criterion}</span>
                        <input type="range" min={0} max={100} value={c.score} className="flex-1 accent-[var(--brand)]" aria-label={`${c.criterion} score`}
                          onChange={(e) => editReport((r) => {
                            const criteria = r.criteria.map((x) => (x.criterion === c.criterion ? { ...x, score: Number(e.target.value), evidenceLabel: 'Inferred' as const, evidence: `${x.evidence.replace(/ \(score set by you\)$/, '')} (score set by you)` } : x));
                            return { ...r, criteria, overallScore: Math.round(criteria.reduce((sum, x) => sum + x.score, 0) / criteria.length) };
                          })} />
                        <span className="w-10 text-right tabular-nums text-[var(--brand)]">{c.score}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-2">Top risks</span>
                  <EditableList items={report.topRisks} label="risk" placeholder="Add a risk you see…" marker={<span className="text-[var(--alert)]">✕</span>} max={10}
                    onChange={(topRisks) => editReport((r) => ({ ...r, topRisks }))} />
                </div>
              </div>
            )}

            {/* Verdict Hero Banner */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-2 max-w-[80ch]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase text-[var(--text-dim)]">
                    ASSESSMENT VERDICT:
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase border ${
                      report.verdict === 'Build'
                        ? 'border-[var(--ok)] text-[var(--ok)] bg-[var(--ok)]/10'
                        : report.verdict === 'Pivot'
                        ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--brand)]/10'
                        : 'border-[var(--alert)] text-[var(--alert)] bg-[var(--alert)]/10'
                    }`}
                  >
                    {report.verdict} RECOMMENDATION
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-[var(--text)]">
                  {report.ideaCard.solution || report.ideaCard.problem}
                </h2>
                <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-dim)]">
                  <ProvenanceBadge type="inferred" detail="Estimated based on time budget and domain complexity" />
                  <span className="tabular-nums">Calculated for {ideaInput.hoursLeft}h hackathon build window</span>
                </div>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => voiceDispatcher.speakAssessment(report.overallScore, report.ideaCard.solution || 'Concept')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono border border-[var(--line)] hover:border-[var(--brand)] text-[var(--brand)] bg-[var(--glass)] transition-all"
                  >
                    <svg className="w-3.5 h-3.5 fill-none stroke-current stroke-2 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    <span>PLAY VOICE READOUT</span>
                  </button>
                </div>
              </div>

              {/* 3A.4 Overall Score in High-Salience LCD (>24px) */}
              <div className="shrink-0 flex flex-col items-center sm:items-end">
                <span className="text-xs font-mono uppercase text-[var(--text-dim)] mb-1">
                  Overall Score
                </span>
                <div className="lcd-display p-3 rounded-xl border border-[var(--line)]">
                  <SevenSegmentDisplay
                    value={report.overallScore.toString().padStart(2, '0')}
                    size="lg"
                    color={report.overallScore >= 75 ? 'resolved' : 'amber'}
                    label={`Overall feasibility score: ${report.overallScore} out of 100`}
                  />
                </div>
                <span className="text-xs font-mono text-[var(--text-dim)] mt-1 tabular-nums">out of 100 max</span>
              </div>
            </div>

            {/* 3A.4 Criteria Breakdown: numbers in sans with tabular-nums */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 mb-4">
                <h3 className="text-xs font-mono uppercase font-bold text-[var(--text)] tracking-wider">
                  DIMENSIONAL EVALUATION
                </h3>
                <ProvenanceBadge type="rule-based" detail="Calculated using standardized rubric weighting" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {report.criteria.map((c) => (
                  <div key={c.criterion} className="p-4 rounded-xl border border-[var(--line)] bg-[var(--glass)]">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-sans font-semibold capitalize text-[var(--text)]">{c.criterion}</span>
                      <span className="text-xs font-sans font-bold text-[var(--brand)] tabular-nums">{c.score}/100</span>
                    </div>
                    <div className="w-full bg-[var(--line)] h-1.5 rounded-full overflow-hidden mb-2">
                      <div
                        className="bg-[var(--brand)] h-full rounded-full transition-all duration-300"
                        style={{ width: `${c.score}%` }}
                      />
                    </div>
                    <p className="text-xs font-sans text-[var(--text-dim)] line-clamp-2">{c.evidence}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Strengths & Pitfalls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[var(--ok)]/30 bg-[var(--panel)] p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-mono uppercase font-bold text-[var(--ok)]">
                    RECOMMENDED UPGRADES & LEVERAGE
                  </h3>
                  <ProvenanceBadge type="rule-based" detail="From the rule-based assessment; the council in step 5 uses a model when one is configured" />
                </div>
                <ul className="text-xs sm:text-sm text-[var(--text)] space-y-2">
                  {(report.upgradeSuggestions?.wowFactor || []).concat(report.upgradeSuggestions?.mustFix || []).slice(0, 4).map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[var(--ok)]" aria-hidden="true">✓</span>
                      <span><strong>{s.title}:</strong> {s.description}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[var(--alert)]/30 bg-[var(--panel)] p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-mono uppercase font-bold text-[var(--alert)]">
                    TOP EXECUTION RISKS & GAPS
                  </h3>
                  <ProvenanceBadge type="inferred" />
                </div>
                <ul className="text-xs sm:text-sm text-[var(--text)] space-y-2">
                  {(report.topRisks || []).map((risk, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[var(--alert)]" aria-hidden="true">✕</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setCurrentStep('idea')}
                className="min-h-[44px] px-4 py-2 border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--text-dim)] hover:bg-[var(--glass)] active:scale-[0.98] text-xs font-mono uppercase text-[var(--text-dim)] hover:text-[var(--text)] rounded-lg transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                ← REFINE IDEA
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep('explore')}
                className="min-h-[48px] px-6 py-2.5 bg-[var(--brand)] text-[#101010] [data-theme='light']_:text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-[var(--brand)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 shadow-[0_0_12px_var(--amber-glow)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                EXPLORE VISUAL ARCHETYPES →
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: VISUAL CONCEPT EXPLORATION */}
        {currentStep === 'explore' && (
          <section aria-labelledby="step-explore-title" className="space-y-6">
            <div className="border-b border-[var(--line)] pb-4">
              <span className="text-xs font-mono uppercase text-[var(--text-dim)]">STEP 03</span>
              <h1 id="step-explore-title" className="text-2xl sm:text-3xl font-bold text-[var(--text)] mt-1">
                Select Your Visual Architecture & Aesthetic DNA
              </h1>
              <p className="text-sm text-[var(--text-dim)] mt-2 max-w-[80ch] leading-6">
                Choose the design language that fits your application domain. These tokens and principles will be baked directly into your generated coding prompt.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-mono text-[var(--text-dim)]">
                Selected: <span className="text-[var(--brand)]">{selectedArchetype.name}</span>
                {selectedArchetypeId === 'custom' && ' (your custom style)'}
              </p>
              <CustomizeToggle open={editExplore} label="Customize your own style" onToggle={() => {
                if (!customArchetype) setCustomArchetype({ ...selectedArchetype, id: 'custom', name: `Custom: ${selectedArchetype.name}`, palette: selectedArchetype.palette.map((p) => ({ ...p })), principles: [...selectedArchetype.principles] });
                setEditExplore((o) => !o);
              }} />
            </div>

            {editExplore && customArchetype && (
              <div className="rounded-xl border border-[var(--info)]/50 bg-[var(--panel)] p-4 sm:p-6 space-y-4" data-testid="style-editor">
                <div>
                  <h2 className="text-xs font-mono uppercase font-bold text-[var(--info)] tracking-wider">Your own visual style</h2>
                  <p className="text-xs text-[var(--text-dim)] mt-1">Started from "{selectedArchetypeId === 'custom' ? 'your last custom style' : selectedArchetype.name}". Everything here goes into the coding prompt.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block"><span className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">Style name</span>
                    <input className={editField} maxLength={80} value={customArchetype.name} onChange={(e) => setCustomArchetype({ ...customArchetype, name: e.target.value })} /></label>
                  <label className="block"><span className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">One-line feel</span>
                    <input className={editField} maxLength={160} value={customArchetype.tagline} onChange={(e) => setCustomArchetype({ ...customArchetype, tagline: e.target.value })} /></label>
                  {(['display', 'body', 'data'] as const).map((k) => (
                    <label key={k} className="block"><span className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">{k} font</span>
                      <input className={editField} maxLength={80} value={customArchetype.typography[k]} onChange={(e) => setCustomArchetype({ ...customArchetype, typography: { ...customArchetype.typography, [k]: e.target.value } })} /></label>
                  ))}
                </div>
                <div>
                  <span className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-2">Palette</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {customArchetype.palette.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="color" aria-label={`Colour ${i + 1}`} value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000'} className="h-9 w-12 rounded border border-[var(--line)] bg-transparent"
                          onChange={(e) => setCustomArchetype({ ...customArchetype, palette: customArchetype.palette.map((x, k) => (k === i ? { ...x, hex: e.target.value.toUpperCase() } : x)) })} />
                        <input aria-label={`Colour ${i + 1} name`} className={editField} maxLength={40} value={c.name}
                          onChange={(e) => setCustomArchetype({ ...customArchetype, palette: customArchetype.palette.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                        <button type="button" className={editButton} aria-label={`Remove colour ${i + 1}`} onClick={() => setCustomArchetype({ ...customArchetype, palette: customArchetype.palette.filter((_, k) => k !== i) })}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={`${editButton} mt-2`} disabled={customArchetype.palette.length >= 8}
                    onClick={() => setCustomArchetype({ ...customArchetype, palette: [...customArchetype.palette, { name: 'New colour', hex: '#888888' }] })}>+ Colour</button>
                </div>
                <div>
                  <span className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-2">Design principles</span>
                  <EditableList items={customArchetype.principles} label="principle" placeholder="Add a design rule…" max={10}
                    onChange={(principles) => setCustomArchetype({ ...customArchetype, principles })} />
                </div>
                <button type="button" className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--brand)] text-[var(--brand)] text-xs font-mono uppercase hover:bg-[var(--brand)]/10 active:scale-[0.98]"
                  onClick={() => { setSelectedArchetypeId('custom'); setEditExplore(false); }}>
                  Use my custom style ✓
                </button>
              </div>
            )}

            <VisualArchetypes
              selectedId={selectedArchetypeId}
              onSelect={setSelectedArchetypeId}
            />

            <div className="flex items-center justify-between pt-4 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setCurrentStep('assess')}
                className="min-h-[44px] px-4 py-2 border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--text-dim)] hover:bg-[var(--glass)] active:scale-[0.98] text-xs font-mono uppercase text-[var(--text-dim)] hover:text-[var(--text)] rounded-lg transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                ← BACK TO ASSESSMENT
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep('plan')}
                className="min-h-[48px] px-6 py-2.5 bg-[var(--brand)] text-[#101010] [data-theme='light']_:text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-[var(--brand)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 shadow-[0_0_12px_var(--amber-glow)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                FORMULATE PROJECT PLAN →
              </button>
            </div>
          </section>
        )}

        {/* STEP 4: PROJECT PLANNING & SCOPE */}
        {currentStep === 'plan' && (
          <section aria-labelledby="step-plan-title" className="space-y-6">
            <div className="border-b border-[var(--line)] pb-4">
              <span className="text-xs font-mono uppercase text-[var(--text-dim)]">STEP 04</span>
              <h1 id="step-plan-title" className="text-2xl sm:text-3xl font-bold text-[var(--text)] mt-1">
                Technical Stack & Feature Prioritization
              </h1>
              <p className="text-sm text-[var(--text-dim)] mt-2 max-w-[80ch] leading-6">
                Define the architecture boundaries, feature roadmap, and explicit non-goals to prevent scope creep.
              </p>
            </div>

            {/* Tech Stack Selectors */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-xs font-mono uppercase font-bold text-[var(--text)] tracking-wider">
                  ENGINEERING ARCHITECTURE STACK
                </h2>
                <CustomizeToggle open={editStack} label="Type your own stack" onToggle={() => setEditStack((o) => !o)} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(Object.keys(STACK_OPTIONS) as (keyof typeof STACK_OPTIONS)[]).map((k) => (
                  <div key={k}>
                    <label htmlFor={`stack-${k}`} className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">{STACK_OPTIONS[k].label}</label>
                    {editStack ? (
                      <>
                        <input id={`stack-${k}`} list={`stack-${k}-options`} maxLength={200} className={editField} value={techStack[k]}
                          placeholder="Type your own…" onChange={(e) => setTechStack({ ...techStack, [k]: e.target.value })} />
                        <datalist id={`stack-${k}-options`}>{STACK_OPTIONS[k].options.map((o) => <option key={o} value={o} />)}</datalist>
                      </>
                    ) : (
                      <select id={`stack-${k}`} value={techStack[k]} onChange={(e) => setTechStack({ ...techStack, [k]: e.target.value })}
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]">
                        {[...new Set([techStack[k], ...STACK_OPTIONS[k].options])].map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Feature Prioritization Checklist on 8px Grid */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 mb-4">
                <h2 className="text-xs font-mono uppercase font-bold text-[var(--text)] tracking-wider">
                  FEATURE ROADMAP & SCOPE
                </h2>
                {featuresTouched ? <ProvenanceBadge type="edited" detail="You changed the feature list" />
                  : report ? <ProvenanceBadge type="rule-based" detail="Seeded from the assessment's keep/cut scope plan" />
                  : <ProvenanceBadge type="template" detail="Starting feature list" />}
              </div>

              <div className="space-y-3 mb-4">
                {features.map((feat) => (
                  <div key={feat.id} className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border border-[var(--line)] bg-[var(--glass)]" data-feature={feat.title}>
                    <input type="checkbox" checked={feat.selected} aria-label={`Include ${feat.title}`}
                      onChange={() => editFeatures((prev) => prev.map((f) => (f.id === feat.id ? { ...f, selected: !f.selected } : f)))}
                      className="rounded border-[var(--line)] accent-[var(--brand)] w-4 h-4 cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--focus)]" />
                    <input aria-label="Feature title" maxLength={300} value={feat.title}
                      onChange={(e) => editFeatures((prev) => prev.map((f) => (f.id === feat.id ? { ...f, title: e.target.value } : f)))}
                      className={`flex-1 min-w-0 bg-transparent border border-transparent hover:border-[var(--line)] focus:border-[var(--brand)] rounded px-2 py-1.5 text-xs sm:text-sm font-sans focus:outline-none ${feat.selected ? 'text-[var(--text)]' : 'text-[var(--text-dim)] line-through'}`} />
                    <select aria-label="Priority" value={feat.priority}
                      onChange={(e) => editFeatures((prev) => prev.map((f) => (f.id === feat.id ? { ...f, priority: e.target.value as Priority } : f)))}
                      className={`text-[10px] font-mono px-1.5 py-1 rounded border bg-[var(--glass)] shrink-0 ${
                        feat.priority === 'P0' ? 'border-[var(--alert)] text-[var(--alert)] font-bold' : feat.priority === 'P1' ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--line)] text-[var(--text-dim)]'
                      }`}>
                      <option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option>
                    </select>
                    <button type="button" className={editButton} aria-label={`Remove ${feat.title}`} onClick={() => editFeatures((prev) => prev.filter((f) => f.id !== feat.id))}>✕</button>
                  </div>
                ))}
              </div>

              {/* Add Custom Feature Form */}
              <form onSubmit={handleAddCustomFeature} className="flex gap-2">
                <input
                  type="text"
                  value={newFeatureText}
                  onChange={(e) => setNewFeatureText(e.target.value)}
                  placeholder="Add custom feature (e.g. Export telemetry as CSV)..."
                  className="flex-1 bg-[var(--glass)] border border-[var(--line)] rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                />
                <button
                  type="submit"
                  disabled={!newFeatureText.trim()}
                  className="min-h-[44px] px-4 py-2 border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--text-dim)] hover:bg-[var(--glass)] active:scale-[0.98] text-[var(--text)] text-xs font-mono uppercase rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                >
                  ADD ITEM
                </button>
              </form>
            </div>

            {/* Constraints and explicit non-goals, both editable */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
                <h2 className="text-xs font-mono uppercase font-bold text-[var(--text)] tracking-wider mb-1">CONSTRAINTS</h2>
                <p className="text-xs text-[var(--text-dim)] mb-4">Rules every builder must follow.</p>
                <EditableList items={constraints} onChange={setConstraints} label="constraint" placeholder="Add a constraint…" marker={<span className="text-[var(--ok)]">✓</span>} />
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
                <h2 className="text-xs font-mono uppercase font-bold text-[var(--text)] tracking-wider mb-1">EXPLICIT NON-GOALS</h2>
                <p className="text-xs text-[var(--text-dim)] mb-4">What NOT to build, so nobody over-engineers.</p>
                <EditableList items={nonGoals} onChange={setNonGoals} label="non-goal" placeholder="Add a non-goal…" marker={<span className="text-[var(--alert)]">✕</span>} />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setCurrentStep('explore')}
                className="min-h-[44px] px-4 py-2 border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--text-dim)] hover:bg-[var(--glass)] active:scale-[0.98] text-xs font-mono uppercase text-[var(--text-dim)] hover:text-[var(--text)] rounded-lg transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                ← BACK TO EXPLORE
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep('council')}
                className="min-h-[48px] px-6 py-2.5 bg-[var(--brand)] text-[#101010] font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-[var(--brand)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 shadow-[0_0_12px_var(--amber-glow)] flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                <span>SEND TO THE COUNCIL →</span>
              </button>
            </div>
          </section>
        )}

        {/* STEP 5: COUNCIL REVIEW — agents try to break the plan */}
        {currentStep === 'council' && (
          <CouncilStep
            spec={spec}
            review={review}
            stale={councilStale}
            onReview={(r, key) => {
              setReview(r);
              if (key) {
                setReviewKey(key);
                setOverrideCouncil(false);
                setOverrideReason('');
              }
            }}
            onEditPlan={() => setCurrentStep('plan')}
            onContinue={() => setCurrentStep('approve')}
          />
        )}

        {/* STEP 6: THE HUMAN HAS THE KEY (HUMAN APPROVAL CHECKPOINT) */}
        {currentStep === 'approve' && (
          <section aria-labelledby="step-approve-title" className="space-y-6">
            <div className="border-b border-[var(--line)] pb-4">
              <span className="text-xs font-mono uppercase text-[var(--text-dim)]">STEP 06</span>
              <h1 id="step-approve-title" className="text-2xl sm:text-3xl font-bold text-[var(--text)] mt-1">
                Human Sign-Off Checkpoint
              </h1>
              <p className="text-sm text-[var(--text-dim)] mt-2 max-w-[80ch] leading-6">
                Consequential decisions are never made autonomously. Review the specification and sign off to generate your AI coding prompt.
              </p>
            </div>

            {/* The Signature "Needs-You" Approval Console */}
            <div
              className={`rounded-xl border p-4 sm:p-6 transition-all duration-300 ${
                humanApproved
                  ? 'border-[var(--ok)] bg-[var(--panel)]'
                  : 'border-[var(--text)] bg-[var(--panel)] needs-you-pulse'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <HexagonPrimitive
                    size={32}
                    active={!humanApproved}
                    completed={humanApproved}
                    requiresApproval={!humanApproved}
                  >
                    {humanApproved ? '✓' : '!'}
                  </HexagonPrimitive>
                  <div>
                    <h2 className="text-base font-bold text-[var(--text)] font-mono">
                      {humanApproved ? 'SPECIFICATION SIGNED & UNLOCKED' : 'NEEDS YOUR DECISION: OPERATOR SIGN-OFF'}
                    </h2>
                    <span className="text-xs font-mono text-[var(--text-dim)]">
                      {humanApproved
                        ? 'Operator confirmed technical boundaries'
                        : 'Review consequential decisions before prompt synthesis'}
                    </span>
                  </div>
                </div>

                <ProvenanceBadge
                  type="source-verified"
                  sourceLabel="Operator Key"
                  detail="Manual approval required before export"
                />
              </div>

              {/* What the council said */}
              <div className={`mb-6 p-4 rounded-xl border bg-[var(--glass)] ${verdict && !councilStale ? (verdict === 'approval-ready' ? 'border-[var(--ok)]/60' : verdict === 'needs-changes' ? 'border-[var(--brand)]/60' : 'border-[var(--alert)]/60') : 'border-[var(--line)]'}`} data-testid="approve-council">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="uppercase text-[var(--text-dim)]">Council:</span>
                  {verdict ? (
                    <>
                      <span className={`px-2 py-0.5 rounded border font-bold ${VERDICT_STYLE[verdict].cls}`}>{VERDICT_STYLE[verdict].label}</span>
                      <span className="text-[var(--text)] tabular-nums">solidity {review!.result!.solidity}/100</span>
                      {review!.result!.method === 'rule-based' && <ProvenanceBadge type="rule-based" />}
                      {councilStale && <span className="text-[var(--brand)]">· plan changed since the review</span>}
                    </>
                  ) : (
                    <span className="text-[var(--brand)]">{review?.status === 'RUNNING' ? 'still deliberating' : 'has not reviewed this plan'}</span>
                  )}
                  <button type="button" onClick={() => setCurrentStep('council')} className="ml-auto underline text-[var(--text-dim)] hover:text-[var(--text)]">
                    {verdict ? 'Open review' : 'Run the council'}
                  </button>
                </div>
                {verdict && !councilStale && review!.result!.blockers.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-[var(--text)]">
                    {review!.result!.blockers.map((b) => <li key={b} className="flex gap-2"><span className="text-[var(--alert)]" aria-hidden>✕</span>{b}</li>)}
                  </ul>
                )}
                {councilBlocks && !humanApproved && (
                  <div className="mt-4 border-t border-[var(--line)] pt-3 space-y-2">
                    <label className="flex items-start gap-2 text-xs font-mono text-[var(--text)] cursor-pointer">
                      <input type="checkbox" checked={overrideCouncil} onChange={(e) => setOverrideCouncil(e.target.checked)} className="mt-0.5 accent-[var(--brand)] w-4 h-4" />
                      <span>{verdict && !councilStale ? 'I have read the council\'s objections and approve anyway.' : 'Approve without a current council review.'} You hold the key; the reason is recorded with the decisions.</span>
                    </label>
                    {overrideCouncil && (
                      <input aria-label="Reason for approving anyway" className={editField} maxLength={300} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Why approve anyway? e.g. the race condition is out of scope for the demo" />
                    )}
                  </div>
                )}
              </div>

              {/* Specification Review Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--glass)] text-xs font-mono space-y-2">
                  <div className="text-[var(--text-dim)] uppercase">Target Problem:</div>
                  <div className="text-[var(--text)] font-semibold line-clamp-2">{ideaInput.idea}</div>
                  <div className="pt-2 text-[var(--text-dim)] uppercase">Visual Motif:</div>
                  <div className="text-[var(--brand)] font-semibold">{selectedArchetype.name}</div>
                </div>

                <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--glass)] text-xs font-mono space-y-2">
                  <div className="text-[var(--text-dim)] uppercase">Selected Stack:</div>
                  <div className="text-[var(--text)] font-semibold">{techStack.framework} · {techStack.styling}</div>
                  <div className="pt-2 text-[var(--text-dim)] uppercase">Selected Features:</div>
                  <div className="text-[var(--ok)] font-semibold">{features.filter((f) => f.selected).length} features confirmed</div>
                </div>
              </div>

              {/* Consequential Decisions Audit */}
              <div className="mb-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-mono uppercase font-bold text-[var(--text-dim)] tracking-wider">
                    CONSEQUENTIAL DECISION AUDIT:
                  </h3>
                  <CustomizeToggle open={editDecisions} label="Edit decisions" onToggle={() => setEditDecisions((o) => !o)} />
                </div>
                {decisions.map((d, i) => (
                  <div key={i} className="p-4 rounded-xl border border-[var(--line)] bg-[var(--glass)] flex items-start gap-3">
                    <span className="text-[var(--ok)] text-xs font-mono shrink-0" aria-hidden="true">✓</span>
                    {editDecisions ? (
                      <div className="flex-1 space-y-2">
                        <input aria-label={`Decision ${i + 1} question`} className={editField} maxLength={300} value={d.question}
                          onChange={(e) => setDecisions((prev) => prev.map((x, k) => (k === i ? { ...x, question: e.target.value } : x)))} />
                        <input aria-label={`Decision ${i + 1} answer`} className={editField} maxLength={500} value={d.answer}
                          onChange={(e) => setDecisions((prev) => prev.map((x, k) => (k === i ? { ...x, answer: e.target.value } : x)))} />
                      </div>
                    ) : (
                      <div className="text-xs font-mono flex-1">
                        <div className="text-[var(--text-dim)]">{d.question}</div>
                        <div className="text-[var(--text)] font-semibold mt-1">{d.answer}</div>
                      </div>
                    )}
                    {editDecisions && (
                      <button type="button" className={editButton} aria-label={`Remove decision ${i + 1}`} onClick={() => setDecisions((prev) => prev.filter((_, k) => k !== i))}>✕</button>
                    )}
                  </div>
                ))}
                {editDecisions && (
                  <button type="button" className={editButton} disabled={decisions.length >= 20}
                    onClick={() => setDecisions((prev) => [...prev, { question: 'New decision?', answer: 'Your answer', approved: true }])}>+ Decision</button>
                )}
              </div>

              {/* Sign-Off Action Button */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--line)]">
                <span className="text-xs font-mono text-[var(--text-dim)]">
                  {humanApproved ? 'Ready to synthesize instructions'
                    : councilBlocks && !(overrideCouncil && overrideReason.trim()) ? 'Fix the plan until the council says approval-ready, or approve anyway with a reason'
                    : 'Click to authorize prompt generation'}
                </span>

                <button
                  type="button"
                  disabled={!humanApproved && councilBlocks && !(overrideCouncil && overrideReason.trim())}
                  onClick={() => {
                    if (!humanApproved) {
                      const what = verdict && !councilStale ? `the council verdict "${VERDICT_STYLE[verdict].label}"` : 'a current council review';
                      setOverrideRecord(councilBlocks ? { question: `Approve against ${what}?`, answer: `Yes. Reason: ${overrideReason.trim()}`, approved: true } : null);
                    }
                    setApprovedKey(specKey);
                    setCurrentStep('generate');
                  }}
                  className="min-h-[48px] px-6 py-2.5 bg-[var(--ok)] text-[#101010] font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-[var(--ok)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 flex items-center gap-2 shadow-[0_0_15px_var(--resolved-glow)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                >
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M6 11.5L2.5 8l1.4-1.4L6 8.7l6.1-6.2L13.5 4z" />
                  </svg>
                  <span>CONFIRM & GENERATE PROMPT →</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* STEP 7: PROFESSIONAL PROMPT EXPORT */}
        {currentStep === 'generate' && (
          <section aria-labelledby="step-generate-title" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
              <div>
                <span className="text-xs font-mono uppercase text-[var(--text-dim)]">STEP 07</span>
                <h1 id="step-generate-title" className="text-2xl sm:text-3xl font-bold text-[var(--text)] mt-1">
                  AI Coding Prompt Blueprint Ready
                </h1>
                <p className="text-sm text-[var(--text-dim)] mt-1">
                  Ready to copy and paste into Claude 3.7 Sonnet, Cursor, Copilot, Windsurf, Bolt, or Gemini.
                </p>
              </div>

              <ProvenanceBadge
                type="source-verified"
                sourceLabel="Human Operator Key"
                interactive
                onClick={() => setShowLegend(true)}
                detail="Click to inspect Provenance Legend"
              />
            </div>

            <PromptGenerator
              idea={ideaInput.idea}
              report={report}
              archetype={selectedArchetype}
              techStack={techStack}
              features={features}
              constraints={constraints}
              nonGoals={nonGoals}
              decisions={overrideRecord ? [...decisions, overrideRecord] : decisions}
              council={review?.status === 'COMPLETED' && review.result && !councilStale ? review.result : null}
            />

            <div className="flex items-center justify-between pt-4 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setCurrentStep('plan')}
                className="min-h-[44px] px-4 py-2 border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--text-dim)] hover:bg-[var(--glass)] active:scale-[0.98] text-xs font-mono uppercase text-[var(--text-dim)] hover:text-[var(--text)] rounded-lg transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                ← MODIFY PLAN
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentStep('idea');
                  setApprovedKey(null);
                }}
                className="min-h-[44px] px-4 py-2 bg-[var(--panel)] border border-[var(--line)] hover:border-[var(--brand)] text-xs font-mono uppercase text-[var(--text)] rounded-lg transition-all duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                START NEW SPECIFICATION +
              </button>
            </div>
          </section>
        )}
      </main>

      {/* 3A.8 Provenance Legend Modal at z-40 */}
      <ProvenanceLegendModal
        isOpen={showLegend}
        onClose={() => setShowLegend(false)}
      />
    </div>
  );
}

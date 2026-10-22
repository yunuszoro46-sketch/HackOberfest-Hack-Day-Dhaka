import React, { useState, useEffect } from 'react';
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

export type StepId = 'idea' | 'assess' | 'explore' | 'plan' | 'approve' | 'generate';

const STEPS: { id: StepId; label: string; index: number }[] = [
  { id: 'idea', label: 'Idea', index: 1 },
  { id: 'assess', label: 'Assess', index: 2 },
  { id: 'explore', label: 'Explore', index: 3 },
  { id: 'plan', label: 'Plan', index: 4 },
  { id: 'approve', label: 'Approve', index: 5 },
  { id: 'generate', label: 'Prompt', index: 6 },
];

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

  const [features, setFeatures] = useState([
    { id: 'f1', title: 'Live Hardware LCD Hero Readout with Seven-Segment Counters', priority: 'P0' as const, selected: true },
    { id: 'f2', title: 'One-Click Plan Approval Bar within Natural Thumb Reach', priority: 'P0' as const, selected: true },
    { id: 'f3', title: '5-Second Undo Window for Consequential Actions', priority: 'P0' as const, selected: true },
    { id: 'f4', title: '3 A.M. Low-Light Dim-Mode Protocol with WCAG AA Contrast', priority: 'P1' as const, selected: true },
    { id: 'f5', title: 'Optional Spoken Readout of Assessment Results (Web Speech API)', priority: 'P1' as const, selected: true },
    { id: 'f6', title: 'Offline Network Simulation Mode with Action Retry Queue', priority: 'P2' as const, selected: true },
  ]);

  const [newFeatureText, setNewFeatureText] = useState('');

  const [constraints] = useState([
    'Zero unrequested execution or compilation code sandboxes',
    'WCAG AA 4.5:1 text contrast on dark background',
    'Minimum 44x44px touch targets on all interactive triggers',
    'Full keyboard focus ring visibility in amber',
  ]);

  const [nonGoals] = useState([
    'Heavy persistent autonomous coding workers',
    'Shell command execution sandboxes or container orchestrators',
    'Unsolicited AI chatbots or floating AI assistant widgets',
    'Generic gradient-wash SaaS card grids or pill badge sandwiches',
  ]);

  const [decisions, setDecisions] = useState([
    {
      question: 'Will the application execute user code or strictly generate blueprints?',
      answer: 'Strictly generate blueprints and prompt specifications for external AI tools.',
      approved: true,
    },
    {
      question: 'Should the UI use dark mode OLED with high-contrast amber tokens?',
      answer: 'Yes, using the TEAM:MATE amber console palette.',
      approved: true,
    },
    {
      question: 'Is human approval required before generating final AI prompts?',
      answer: 'Yes, "The Human Has the Key" rule mandates explicit user sign-off.',
      approved: true,
    },
  ]);

  // Step 5: Approval State
  const [humanApproved, setHumanApproved] = useState(false);

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
      setReportProvenance(modelUsed ? 'model' : 'rule-based');
      voiceDispatcher.speakAssessment(rep.overallScore, ideaInput.theme || 'concept');
    } catch {
      const rep = scoreIdea(ideaInput);
      setReport(rep);
      setReportProvenance('rule-based');
      voiceDispatcher.speakAssessment(rep.overallScore, ideaInput.theme || 'concept');
    } finally {
      setAssessing(false);
      setCurrentStep('assess');
    }
  };

  const handleAddCustomFeature = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeatureText.trim()) return;
    setFeatures((prev) => [
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

  const selectedArchetype = ARCHETYPES.find((a) => a.id === selectedArchetypeId) || ARCHETYPES[0];

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
        <ol className="max-w-6xl mx-auto flex items-center justify-between gap-2 min-w-[580px]">
          {STEPS.map((step) => {
            const isCurrent = currentStep === step.id;
            const stepOrder = ['idea', 'assess', 'explore', 'plan', 'approve', 'generate'];
            const isCompleted = stepOrder.indexOf(currentStep) > stepOrder.indexOf(step.id);
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

              <ProvenanceBadge
                type={reportProvenance}
                modelName={modelUsed}
                interactive
                onClick={() => setShowLegend(true)}
                detail="Click to inspect Provenance Legend"
              />
            </div>

            {/* Verdict Hero Banner */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-2 max-w-[80ch]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase text-[var(--text-dim)]">
                    COUNCIL VERDICT:
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
                  <ProvenanceBadge type="model" modelName={modelUsed} />
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
              <h2 className="text-xs font-mono uppercase font-bold text-[var(--text)] tracking-wider mb-4">
                ENGINEERING ARCHITECTURE STACK
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="stack-framework" className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">
                    FRONTEND FRAMEWORK
                  </label>
                  <select
                    id="stack-framework"
                    value={techStack.framework}
                    onChange={(e) => setTechStack({ ...techStack, framework: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                  >
                    <option value="React 19 (Vite SPA)">React 19 (Vite SPA)</option>
                    <option value="Next.js 15 (App Router)">Next.js 15 (App Router)</option>
                    <option value="Vue 3 (Vite)">Vue 3 (Vite)</option>
                    <option value="SvelteKit (Node adapter)">SvelteKit (Node adapter)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="stack-styling" className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">
                    STYLING SYSTEM
                  </label>
                  <select
                    id="stack-styling"
                    value={techStack.styling}
                    onChange={(e) => setTechStack({ ...techStack, styling: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                  >
                    <option value="Tailwind CSS v4 with custom CSS variables">Tailwind CSS v4 with custom CSS variables</option>
                    <option value="Vanilla CSS Modules + Design Tokens">Vanilla CSS Modules + Design Tokens</option>
                    <option value="Radix UI Primitives + Tailwind CSS">Radix UI Primitives + Tailwind CSS</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="stack-database" className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">
                    DATA LAYER & PERSISTENCE
                  </label>
                  <select
                    id="stack-database"
                    value={techStack.database}
                    onChange={(e) => setTechStack({ ...techStack, database: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                  >
                    <option value="In-Memory SQLite / Browser Storage">In-Memory SQLite / Browser Storage</option>
                    <option value="PostgreSQL (Drizzle ORM)">PostgreSQL (Drizzle ORM)</option>
                    <option value="Client-Side IndexedDB / LocalStorage">Client-Side IndexedDB / LocalStorage</option>
                    <option value="REST API with In-Memory Mocks">REST API with In-Memory Mocks</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="stack-state" className="block text-xs font-mono uppercase text-[var(--text-dim)] mb-1">
                    STATE MANAGEMENT
                  </label>
                  <select
                    id="stack-state"
                    value={techStack.stateManagement}
                    onChange={(e) => setTechStack({ ...techStack, stateManagement: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
                  >
                    <option value="React Context + Hooks">React Context + Hooks</option>
                    <option value="Zustand Store">Zustand Store</option>
                    <option value="TanStack Query + Local State">TanStack Query + Local State</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Feature Prioritization Checklist on 8px Grid */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 mb-4">
                <h2 className="text-xs font-mono uppercase font-bold text-[var(--text)] tracking-wider">
                  FEATURE ROADMAP & SCOPE
                </h2>
                <ProvenanceBadge type="template" detail="Curated feature breakdown based on selected archetype" />
              </div>

              <div className="space-y-3 mb-4">
                {features.map((feat) => (
                  <div
                    key={feat.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-[var(--line)] bg-[var(--glass)]"
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={feat.selected}
                        onChange={() => {
                          setFeatures((prev) =>
                            prev.map((f) => (f.id === feat.id ? { ...f, selected: !f.selected } : f))
                          );
                        }}
                        className="rounded border-[var(--line)] accent-[var(--brand)] w-4 h-4 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                      />
                      <span className={`text-xs sm:text-sm font-sans ${feat.selected ? 'text-[var(--text)]' : 'text-[var(--text-dim)] line-through'}`}>
                        {feat.title}
                      </span>
                    </label>

                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        feat.priority === 'P0'
                          ? 'border-[var(--alert)] text-[var(--alert)] bg-[var(--alert)]/10 font-bold'
                          : feat.priority === 'P1'
                          ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--brand)]/10 font-medium'
                          : 'border-[var(--line)] text-[var(--text-dim)]'
                      }`}
                    >
                      {feat.priority}
                    </span>
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

            {/* Explicit Non-Goals & Boundaries */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
              <h2 className="text-xs font-mono uppercase font-bold text-[var(--text)] tracking-wider mb-1">
                EXPLICIT NON-GOALS (PREVENTS SCOPE CREEP)
              </h2>
              <p className="text-xs text-[var(--text-dim)] mb-4 max-w-[80ch]">
                Explicit exclusions tell external coding models exactly what NOT to invent or over-engineer.
              </p>
              <ul className="text-xs font-mono space-y-2 text-[var(--text-dim)]">
                {nonGoals.map((ng, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-[var(--alert)] shrink-0" aria-hidden="true">✕</span>
                    <span>{ng}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setCurrentStep('explore')}
                className="min-h-[44px] px-4 py-2 border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--text-dim)] hover:bg-[var(--glass)] active:scale-[0.98] text-xs font-mono uppercase text-[var(--text-dim)] hover:text-[var(--text)] rounded-lg transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                ← BACK TO EXPLORE
              </button>

              {/* 3A.3 "Needs your decision" button */}
              <button
                type="button"
                onClick={() => setCurrentStep('approve')}
                className="min-h-[48px] px-6 py-2.5 bg-[var(--text)] text-[var(--glass)] font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-[var(--text)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 shadow-md flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
              >
                <span>THE HUMAN HAS THE KEY: REVIEW & APPROVE →</span>
              </button>
            </div>
          </section>
        )}

        {/* STEP 5: THE HUMAN HAS THE KEY (HUMAN APPROVAL CHECKPOINT) */}
        {currentStep === 'approve' && (
          <section aria-labelledby="step-approve-title" className="space-y-6">
            <div className="border-b border-[var(--line)] pb-4">
              <span className="text-xs font-mono uppercase text-[var(--text-dim)]">STEP 05</span>
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
                <h3 className="text-xs font-mono uppercase font-bold text-[var(--text-dim)] tracking-wider mb-2">
                  CONSEQUENTIAL DECISION AUDIT:
                </h3>
                {decisions.map((d, i) => (
                  <div key={i} className="p-4 rounded-xl border border-[var(--line)] bg-[var(--glass)] flex items-start gap-3">
                    <span className="text-[var(--ok)] text-xs font-mono shrink-0" aria-hidden="true">✓</span>
                    <div className="text-xs font-mono">
                      <div className="text-[var(--text-dim)]">{d.question}</div>
                      <div className="text-[var(--text)] font-semibold mt-1">{d.answer}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sign-Off Action Button */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--line)]">
                <span className="text-xs font-mono text-[var(--text-dim)]">
                  {humanApproved ? 'Ready to synthesize instructions' : 'Click to authorize prompt generation'}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setHumanApproved(true);
                    setCurrentStep('generate');
                  }}
                  className="min-h-[48px] px-6 py-2.5 bg-[var(--ok)] text-[#101010] [data-theme='light']_:text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-[var(--ok)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 flex items-center gap-2 shadow-[0_0_15px_var(--resolved-glow)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
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

        {/* STEP 6: PROFESSIONAL PROMPT EXPORT */}
        {currentStep === 'generate' && (
          <section aria-labelledby="step-generate-title" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
              <div>
                <span className="text-xs font-mono uppercase text-[var(--text-dim)]">STEP 06</span>
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
              decisions={decisions}
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
                  setHumanApproved(false);
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

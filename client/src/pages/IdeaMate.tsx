import { useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, CircleHelp, Clock3, ExternalLink, Loader2,
  Search, Sparkles, WandSparkles,
} from 'lucide-react';
import type { IdeaInput, IdeaReport } from '../../../shared/idea-report';
import type { IdeaResearchResult } from '../../../shared/idea-research';
import type { IdeaRunDetail } from '../../../shared/idea-run';
import { api, ApiError } from '../api';

const initialInput: IdeaInput = {
  idea: '',
  theme: '',
  hoursLeft: 150,
  teamSkills: '',
  targetJudges: '',
  mode: 'quick',
};

const verdictStyles = {
  Build: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  Pivot: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  Drop: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
};

const criterionLabels: Record<string, string> = {
  problemClarity: 'Problem clarity',
  originality: 'Originality',
  feasibility: 'Feasibility',
  demoAbility: 'Demo-ability',
  impact: 'Impact',
  technicalDepth: 'Technical depth',
  themeFit: 'Theme and judge fit',
};

function Section({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-mute">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return <ul className="grid gap-2 text-sm text-mute">{items.map((item) => <li key={item} className="flex gap-2"><span className="text-accent-ink" aria-hidden>•</span><span>{item}</span></li>)}</ul>;
}

function compareDelta(current: number, previous: number): string {
  const difference = current - previous;
  return difference > 0 ? `+${difference}` : String(difference);
}

function ResearchPanel({ result }: { result: IdeaResearchResult }) {
  return (
    <Section title="Reference research" description="Official API results with a link check. Summaries are original descriptions, not copied source text.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-line px-2.5 py-1 text-xs capitalize text-mute">{result.status} research</span>
        {result.cached && <span className="rounded-full border border-line px-2.5 py-1 text-xs text-mute">Cached</span>}
        <span className="text-xs text-mute">Completed {new Date(result.completedAt).toLocaleString()}</span>
      </div>
      <ul className="grid gap-3">
        {result.references.map((reference) => (
          <li key={reference.url} className="rounded-lg border border-line-soft bg-bg p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <a className="font-medium text-accent-ink underline decoration-accent/40 underline-offset-4" href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a>
              <span className="rounded-full border border-line px-2 py-0.5 text-2xs capitalize text-mute">{reference.similarity} similarity</span>
            </div>
            <p className="mt-2 text-sm text-mute">{reference.summary}</p>
            <p className="mt-2 text-xs text-mute">Learn: {reference.learning}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-2xs uppercase tracking-wide text-mute">{reference.provider} <ExternalLink className="h-3 w-3" aria-hidden /></span>
          </li>
        ))}
      </ul>
      {!result.references.length && <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-100">No reachable references were found. Check provider status below; no sources have been invented.</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {result.providers.map((provider) => (
          <div key={provider.provider} className="rounded-md border border-line-soft p-3 text-sm">
            <div className="flex justify-between gap-2"><strong className="capitalize">{provider.provider}</strong><span className="capitalize text-mute">{provider.status}</span></div>
            <p className="mt-1 text-xs text-mute">{provider.message}</p>
          </div>
        ))}
      </div>
      {!!result.unreachable.length && <details className="mt-4 text-sm text-mute"><summary>Links that could not be verified ({result.unreachable.length})</summary><ul className="mt-2 grid gap-2">{result.unreachable.map((item) => <li key={item.url} className="break-all">{item.url}: {item.reason}</li>)}</ul></details>}
    </Section>
  );
}

function ReportView({ report, previous, research, run }: { report: IdeaReport; previous: IdeaReport | null; research: IdeaResearchResult | null; run: IdeaRunDetail | null }) {
  const chairTurn = run?.turns.find((turn) => turn.round === 'synthesis' && turn.status === 'ok');
  const successfulTurns = run?.turns.filter((turn) => turn.status === 'ok') ?? [];
  const councilProviders = [...new Set(successfulTurns.map((turn) => `${turn.provider} · ${turn.model}`))];
  const soliditySource = report.analysis.method === 'council'
    ? chairTurn
      ? `${chairTurn.provider} · ${chairTurn.model}`
      : `Council fallback${councilProviders.length ? ` · ${councilProviders.join(', ')}` : ''}`
    : 'Rule-based template';
  const ideaCardSource = report.analysis.method === 'council' && chairTurn
    ? `${chairTurn.provider} · ${chairTurn.model}`
    : 'Rule-based fallback';

  return (
    <div className="grid gap-5">
      {previous && (
        <Section title="Iteration comparison" description="Score change from the report immediately before this run.">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line-soft p-4"><p className="text-xs text-mute">Previous</p><p className="mt-1 text-2xl font-semibold">{previous.overallScore}<span className="ml-1 text-sm text-mute">/100</span></p></div>
            <div className="rounded-lg border border-line-soft p-4"><p className="text-xs text-mute">Current</p><p className="mt-1 text-2xl font-semibold">{report.overallScore}<span className="ml-1 text-sm text-mute">/100</span></p></div>
            <div className="rounded-lg border border-line-soft p-4"><p className="text-xs text-mute">Change</p><p className={`mt-1 text-2xl font-semibold ${report.overallScore >= previous.overallScore ? 'text-emerald-300' : 'text-amber-200'}`}>{compareDelta(report.overallScore, previous.overallScore)} points</p></div>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {report.criteria.map((item) => {
              const oldScore = previous.criteria.find((old) => old.criterion === item.criterion)?.score;
              return <li key={item.criterion} className="flex items-center justify-between rounded-md bg-bg px-3 py-2 text-sm"><span>{criterionLabels[item.criterion]}</span><span className="font-mono text-mute">{oldScore ?? '—'} → {item.score} {oldScore !== undefined && <span className="text-accent-ink">({compareDelta(item.score, oldScore)})</span>}</span></li>;
            })}
          </ul>
        </Section>
      )}

      <Section title="Idea verdict" description={`A structured first-pass assessment, not a substitute for talking to users. Solidity source: ${soliditySource}.`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${verdictStyles[report.verdict]}`}>{report.verdict}</span>
            <p className="mt-3 text-sm text-mute">Overall solidity score</p>
            <p className="text-4xl font-semibold">{report.overallScore}<span className="ml-1 text-base text-mute">/100</span></p>
          </div>
          <p className="max-w-md text-sm text-mute">{report.analysis.limitation}</p>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {report.criteria.map((item) => (
            <div key={item.criterion} className="rounded-lg border border-line-soft bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{criterionLabels[item.criterion]}</span>
                <span className="font-mono text-sm">{item.score}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${item.score}%` }} /></div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full border border-line px-2 py-0.5 text-2xs">{item.evidenceLabel}</span><span className="text-xs text-mute">{item.evidence}</span></div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Idea card" description={`Cleaned-up idea summary. Source: ${ideaCardSource}.`}>
        <dl className="grid gap-4 sm:grid-cols-2">
          {Object.entries(report.ideaCard).map(([key, value]) => (
            <div key={key}><dt className="text-xs font-medium uppercase tracking-wide text-mute">{key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())}</dt><dd className="mt-1 text-sm">{value}</dd></div>
          ))}
        </dl>
      </Section>

      <Section title="Top risks"><List items={report.topRisks} /></Section>

      <Section title="Upgrade suggestions" description="Effort estimates are planning guesses; validate scope against the chosen MVP.">
        <div className="grid gap-4 lg:grid-cols-3">
          {([
            ['Must fix', report.upgradeSuggestions.mustFix],
            ['Nice to have', report.upgradeSuggestions.niceToHave],
            ['Wow factor', report.upgradeSuggestions.wowFactor],
          ] as const).map(([heading, suggestions]) => (
            <div key={heading}>
              <h3 className="mb-2 font-medium">{heading}</h3>
              <ul className="grid gap-2">
                {suggestions.map((suggestion) => <li key={suggestion.title} className="rounded-md border border-line-soft bg-bg p-3"><div className="flex items-start justify-between gap-2"><strong className="text-sm">{suggestion.title}</strong><span className="shrink-0 text-2xs text-mute">{suggestion.effortHours}h · {suggestion.impact} impact</span></div><p className="mt-2 text-xs text-mute">{suggestion.description}</p></li>)}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {research && <ResearchPanel result={research} />}

      <Section title="Scenario simulations">
        <div className="grid gap-5 lg:grid-cols-2">
          <div><h3 className="mb-2 font-medium">User walkthroughs</h3><ul className="grid gap-3">{report.userSimulations.map((simulation) => <li key={simulation.user} className="rounded-md border border-line-soft p-3"><strong className="text-sm">{simulation.user}</strong><p className="mt-2 text-xs text-mute">Goal: {simulation.goal}</p><p className="mt-1 text-xs text-amber-100">May get stuck: {simulation.getsStuckAt}</p><p className="mt-1 text-xs text-mute">Improve: {simulation.improvement}</p></li>)}</ul></div>
          <div><h3 className="mb-2 font-medium">Judge questions</h3><ol className="grid gap-2">{report.judgeQuestions.map((item, index) => <li key={item.question} className="rounded-md border border-line-soft p-3"><strong className="text-sm">{index + 1}. {item.question}</strong><p className="mt-1 text-xs text-mute">{item.suggestedAnswer}</p></li>)}</ol></div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div><h3 className="mb-2 font-medium">Failure plan</h3><ul className="grid gap-2">{report.failureSimulations.map((item) => <li key={item.scenario} className="rounded-md border border-line-soft p-3"><strong className="text-sm">{item.scenario}</strong><p className="mt-1 text-xs text-mute">{item.fallback}</p></li>)}</ul></div>
          <div><h3 className="mb-2 font-medium">If only half the time remains ({report.timeCrunch.cutLineHours}h)</h3><div className="rounded-md border border-line-soft p-3"><p className="mb-2 text-xs font-medium text-emerald-200">Keep</p><List items={report.timeCrunch.keep} /><p className="mb-2 mt-4 text-xs font-medium text-amber-200">Cut</p><List items={report.timeCrunch.cut} /></div></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">{report.impactScenarios.map((scenario) => <div key={scenario.outcome} className="rounded-md border border-line-soft p-3"><h3 className="font-medium capitalize">{scenario.outcome} case</h3><p className="mt-2 text-sm text-mute">{scenario.description}</p><p className="mt-2 text-xs text-mute">Assumes: {scenario.assumption}</p></div>)}</div>
      </Section>

      <Section title="System design recommendation">
        <div className="grid gap-3 lg:grid-cols-3">{report.systemDesign.options.map((option) => <div key={option.name} className={`rounded-md border p-4 ${option.name === report.systemDesign.selectedOption ? 'border-accent/70 bg-accent/5' : 'border-line-soft'}`}><div className="flex justify-between gap-2"><h3 className="font-medium">{option.name}</h3><span className="font-mono text-sm">{option.fitScore}</span></div><p className="mt-2 text-xs text-mute">{option.description}</p><p className="mt-3 text-xs font-medium">Advantages</p><List items={option.advantages} /><p className="mt-3 text-xs font-medium">Tradeoffs</p><List items={option.tradeoffs} /></div>)}</div>
        <p className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm"><strong>Selected:</strong> {report.systemDesign.selectedOption}. {report.systemDesign.decisionRecord.rationale}</p>
        <h3 className="mb-2 mt-5 font-medium">Architecture diagram (Mermaid)</h3>
        <pre className="overflow-x-auto rounded-md border border-line bg-bg p-4 text-xs text-accent-ink"><code>{report.systemDesign.mermaidDiagram}</code></pre>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div><h3 className="mb-2 font-medium">Basic data model</h3><ul className="grid gap-2">{report.systemDesign.dataModel.map((entity) => <li key={entity.entity} className="rounded-md border border-line-soft p-3 text-sm"><strong>{entity.entity}</strong><p className="mt-1 font-mono text-2xs text-mute">{entity.fields.join(' · ')}</p></li>)}</ul></div>
          <div><h3 className="mb-2 font-medium">Suggested endpoints</h3><ul className="grid gap-2">{report.systemDesign.endpoints.map((endpoint) => <li key={`${endpoint.method} ${endpoint.path}`} className="rounded-md border border-line-soft p-3"><code className="text-xs text-accent-ink">{endpoint.method} {endpoint.path}</code><p className="mt-1 text-xs text-mute">{endpoint.purpose}</p></li>)}</ul></div>
        </div>
        <div className="mt-5"><h3 className="mb-2 font-medium">Decision record</h3><p className="text-sm">{report.systemDesign.decisionRecord.decision}</p><List items={report.systemDesign.decisionRecord.consequences} /></div>
      </Section>

      <Section title="UI/UX direction">
        <div className="grid gap-5 lg:grid-cols-2">
          <div><h3 className="mb-2 font-medium">Principles</h3><List items={report.uiUxDirection.principles} /><h3 className="mb-2 mt-5 font-medium">Key screens</h3><List items={report.uiUxDirection.keyScreens} /></div>
          <div><h3 className="mb-2 font-medium">Main user flow</h3><ol className="grid gap-2">{report.uiUxDirection.mainFlow.map((step, index) => <li key={step} className="flex gap-2 text-sm text-mute"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line font-mono text-2xs">{index + 1}</span>{step}</li>)}</ol><h3 className="mb-2 mt-5 font-medium">Color and type</h3><p className="text-sm text-mute">{report.uiUxDirection.colorAndType}</p><h3 className="mb-2 mt-5 font-medium">Components</h3><List items={report.uiUxDirection.components} /></div>
        </div>
        <h3 className="mb-2 mt-5 font-medium">Design references</h3>
        <div className="grid gap-2 sm:grid-cols-3">{report.uiUxDirection.references.map((reference) => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="rounded-md border border-line-soft p-3 hover:border-accent/60"><span className="font-medium text-accent-ink underline">{reference.name}</span><p className="mt-1 text-xs text-mute">{reference.whyRelevant}</p></a>)}</div>
      </Section>

      <Section title="Analysis transparency">
        <p className="text-sm text-mute">This first-pass score and associated simulations use a {report.analysis.method} method. Research, when requested, is shown separately with its provider status and source links. Treat assumptions as prompts to validate, not facts.</p>
        <details className="mt-3 text-sm text-mute"><summary className="inline-flex items-center gap-1">Original idea and context <ChevronDown className="h-4 w-4" aria-hidden /></summary><p className="mt-2 whitespace-pre-wrap">{report.input.idea}</p><p className="mt-1">Theme: {report.input.theme || 'Not specified'} · Team: {report.input.teamSkills || 'Not specified'} · Judges: {report.input.targetJudges || 'Not specified'}</p></details>
      </Section>
    </div>
  );
}

export default function IdeaMate() {
  const [form, setForm] = useState<IdeaInput>(initialInput);
  const [report, setReport] = useState<IdeaReport | null>(null);
  const [previous, setPrevious] = useState<IdeaReport | null>(null);
  const [research, setResearch] = useState<IdeaResearchResult | null>(null);
  const [run, setRun] = useState<IdeaRunDetail | null>(null);
  const [reportRun, setReportRun] = useState<IdeaRunDetail | null>(null);
  const [pendingCouncil, setPendingCouncil] = useState(false);
  const [pendingResearch, setPendingResearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  function update<K extends keyof IdeaInput>(key: K, value: IdeaInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResearch(null);
    setPendingResearch(false);
    setRun(null);
    setProgress('Preparing the report run and checking available providers…');
    try {
      const maxCalls = form.mode === 'quick' ? 4 : 5;
      const next = await api.createIdeaRun(form, maxCalls);
      setRun(next);
      setPendingCouncil(true);
      setProgress('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to prepare the report run. Please try again.');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  async function approveCouncil() {
    if (!run) return;
    setPendingCouncil(false);
    setBusy(true);
    setError(null);
    setProgress('Starting the approved council run…');
    try {
      await api.approveIdeaRun(run.id);
      let latest = await api.ideaRun(run.id);
      setRun(latest);
      for (let attempt = 0; attempt < 240; attempt += 1) {
        if (latest.status === 'COMPLETED') {
          if (!latest.report) throw new Error('The completed run did not include a report.');
          setPrevious(report);
          setReport(latest.report);
          setReportRun(latest);
          setPendingResearch(latest.input.mode === 'deep');
          setProgress('');
          return;
        }
        if (latest.status === 'FAILED') throw new Error(latest.error || 'The report run failed.');
        if (latest.status === 'CANCELLED') {
          setProgress('');
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        latest = await api.ideaRun(run.id);
        setRun(latest);
        setProgress(`Council in progress: ${latest.turns.filter((turn) => turn.status !== 'skipped').length} of up to ${latest.maxCalls} calls recorded…`);
      }
      throw new Error('The report run is taking too long. Check its status and try again.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : 'Unable to complete the report. Please try again.');
      setProgress('');
      setPendingCouncil(false);
    } finally {
      setBusy(false);
    }
  }

  async function cancelCouncil() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelIdeaRun(run.id);
      setRun(await api.ideaRun(run.id));
      setPendingCouncil(false);
      setProgress('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to cancel the report run.');
    } finally {
      setBusy(false);
    }
  }

  async function useTemplateReport() {
    setPendingCouncil(false);
    setBusy(true);
    setError(null);
    setProgress('Building a clearly labeled rule-based report…');
    try {
      if (run && (run.status === 'AWAITING_APPROVAL' || run.status === 'RUNNING')) {
        await api.cancelIdeaRun(run.id);
      }
      const input = run?.input ?? form;
      const next = await api.createIdeaReport(input);
      setPrevious(report);
      setReport(next);
      setRun(null);
      setReportRun(null);
      if (input.mode === 'deep') setPendingResearch(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to create the template report. Please try again.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function approveResearch() {
    setPendingResearch(false);
    setBusy(true);
    setError(null);
    setProgress('Searching official sources and checking their links. Fetched content is treated as untrusted data.');
    try {
      const result = await api.researchIdea(report?.input ?? form);
      setResearch(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Research could not be completed. Your report is still available.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <header className="mb-7">
        <p className="kicker mb-2">Hackathon idea lab</p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight"><WandSparkles className="h-7 w-7 text-accent-ink" aria-hidden />IdeaMate</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">Turn a short idea into a practical, transparent report with risks, design guidance, and a path to a demo. Your context is customizable; start with just one sentence.</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.4fr)]">
        <form onSubmit={submit} className="card grid gap-4 p-5 lg:sticky lg:top-20">
          <div>
            <label className="label" htmlFor="idea-text">Your idea <span className="text-rose-300">*</span></label>
            <textarea id="idea-text" className="input min-h-28 resize-y" maxLength={500} required value={form.idea} onChange={(event) => update('idea', event.target.value)} placeholder="One sentence is enough: what problem should this solve, and for whom?" />
            <p className="mt-1 text-right text-2xs text-mute">{form.idea.length}/500</p>
          </div>

          <div>
            <span className="label">Report mode</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Report mode">
              {(['quick', 'deep'] as const).map((mode) => (
                <button key={mode} type="button" role="radio" aria-checked={form.mode === mode} onClick={() => update('mode', mode)} className={`rounded-md border p-3 text-left ${form.mode === mode ? 'border-accent bg-accent/10' : 'border-line bg-bg'}`}>
                  <span className="flex items-center justify-between font-medium capitalize">{mode}{form.mode === mode && <Check className="h-4 w-4 text-accent-ink" aria-hidden />}</span>
                  <span className="mt-1 block text-xs text-mute">{mode === 'quick' ? 'Structured assessment, no web research.' : 'Full report plus optional approved web research.'}</span>
                </button>
              ))}
            </div>
          </div>

          <details className="group rounded-md border border-line-soft p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">Customize context <ChevronDown className="h-4 w-4 text-mute transition group-open:rotate-180" aria-hidden /></summary>
            <div className="mt-4 grid gap-3">
              <div><label className="label" htmlFor="idea-theme">Theme / track</label><input id="idea-theme" className="input" maxLength={200} value={form.theme ?? ''} onChange={(event) => update('theme', event.target.value)} placeholder="Optional" /></div>
              <div><label className="label" htmlFor="idea-hours">Hours left</label><input id="idea-hours" className="input" type="number" min={1} max={1000} value={form.hoursLeft ?? ''} onChange={(event) => update('hoursLeft', event.target.value ? Number(event.target.value) : null)} /></div>
              <div><label className="label" htmlFor="idea-skills">Team size and skills</label><input id="idea-skills" className="input" maxLength={200} value={form.teamSkills ?? ''} onChange={(event) => update('teamSkills', event.target.value)} placeholder="e.g. 2 people, React + Node" /></div>
              <div><label className="label" htmlFor="idea-judges">Target judges / audience</label><input id="idea-judges" className="input" maxLength={200} value={form.targetJudges ?? ''} onChange={(event) => update('targetJudges', event.target.value)} placeholder="Optional" /></div>
            </div>
          </details>

          {form.mode === 'deep' && <p className="flex gap-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100"><CircleHelp className="h-4 w-4 shrink-0" aria-hidden />External research will not start automatically. You will review and approve it after seeing the initial report.</p>}
          {error && <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-400/5 p-3 text-sm text-rose-100"><AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden />{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={busy || pendingCouncil || !form.idea.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}{report ? 'Re-run with this idea' : 'Generate Idea Report'} <ArrowRight className="h-4 w-4" aria-hidden /></button>
          {progress && <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-mute"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{progress}</p>}
        </form>

        <div className="grid gap-5">
          {pendingCouncil && run && (
            <div className="card border-amber-400/30 p-5">
              <h2 className="font-semibold">Approve AI council run?</h2>
              <p className="mt-2 text-sm text-mute">
                {run.providers.length
                  ? `${run.input.mode === 'quick' ? 'Quick' : 'Deep'} mode may make up to ${run.maxCalls} model calls, including provider fallbacks.`
                  : 'No model providers are configured. If you continue, the run will produce a clearly labeled rule-based report with no model calls.'}
              </p>
              {run.providers.length > 0 && <p className="mt-2 text-xs text-mute">Configured providers: {run.providers.join(', ')}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => void approveCouncil()} disabled={busy}>Approve and run</button>
                <button type="button" className="btn-secondary" onClick={() => void useTemplateReport()} disabled={busy}>Use template report</button>
                <button type="button" className="btn-secondary" onClick={() => void cancelCouncil()} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
          {busy && !pendingCouncil && run?.status === 'RUNNING' && (
            <div className="card border-accent/30 p-5" role="status" aria-live="polite">
              <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-accent-ink" aria-hidden /><h2 className="font-semibold">Council working</h2></div>
              <p className="mt-2 text-sm text-mute">{progress || 'Generating report sections…'}</p>
              <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                {run.turns.map((turn) => <li key={turn.seq} className="rounded-md border border-line-soft p-3 text-xs"><strong className="capitalize">{turn.round}: {turn.role}</strong><span className="ml-2 capitalize text-mute">{turn.status}</span>{turn.provider && <p className="mt-1 text-mute">{turn.provider} · {turn.model}</p>}{turn.reason && <p className="mt-1 text-amber-100">{turn.reason}</p>}</li>)}
              </ol>
              <button type="button" className="btn-secondary mt-4" onClick={() => void cancelCouncil()}>Cancel run</button>
            </div>
          )}
          {!report && (
            <div className="card grid min-h-64 place-items-center p-8 text-center">
              <div><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface-2"><Search className="h-5 w-5 text-accent-ink" aria-hidden /></div><h2 className="mt-4 text-lg font-semibold">Your report will appear here</h2><p className="mx-auto mt-2 max-w-md text-sm text-mute">Get a score with evidence labels, user and judge simulations, a system design recommendation, and a practical build direction.</p><p className="mt-4 inline-flex items-center gap-1 text-xs text-mute"><Clock3 className="h-3.5 w-3.5" aria-hidden />Start with Quick mode; Deep research can be approved afterward.</p></div>
            </div>
          )}
          {pendingResearch && report && (
            <div className="card border-amber-400/30 p-5">
              <h2 className="font-semibold">Approve reference research?</h2>
              <p className="mt-2 text-sm text-mute">IdeaMate will query official GitHub and configured YouTube APIs, then check returned links. External results are untrusted data; they will not be treated as instructions. This can use provider quota.</p>
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={() => void approveResearch()} disabled={busy}><Search className="h-4 w-4" aria-hidden />Approve and start research</button><button type="button" className="btn-secondary" onClick={() => setPendingResearch(false)}>Skip research</button></div>
            </div>
          )}
          {report && <ReportView report={report} previous={previous} research={research} run={reportRun} />}
        </div>
      </div>
    </div>
  );
}

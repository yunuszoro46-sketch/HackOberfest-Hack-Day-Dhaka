import { useEffect, useRef, useState } from 'react';
import { Ban, Bot, Loader2, Users } from 'lucide-react';
import type { IdeaInput, IdeaReport } from '../../../shared/idea-report';
import type { IdeaRunDetail, IdeaRunTurn } from '../../../shared/idea-run';
import { api, ApiError } from '../api';

const ROLE_LABEL: Record<string, string> = {
  feasibility: 'Feasibility engineer',
  market: 'Market & user analyst',
  judge: 'Hackathon judge',
  critic: 'Critic',
  chair: 'Chair',
};

const FALLBACK_TEXT: Record<string, string> = {
  NOT_CONFIGURED: 'No AI provider is configured on the server',
  BUDGET: 'The call budget was too small for a council',
  NO_DRAFTS: 'Every council member failed',
};

const TURN_STYLE: Record<IdeaRunTurn['status'], string> = {
  ok: 'border-emerald-400/40 text-emerald-200',
  failed: 'border-rose-400/40 text-rose-200',
  skipped: 'border-amber-400/40 text-amber-200',
};

const open = (run: IdeaRunDetail | null) => run?.status === 'AWAITING_APPROVAL' || run?.status === 'RUNNING';

function turnText(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as { summary?: unknown; objections?: { point?: unknown }[] };
  if (typeof o.summary === 'string') return o.summary;
  if (Array.isArray(o.objections)) {
    const points = o.objections.map((x) => x.point).filter((p): p is string => typeof p === 'string');
    return points.length ? points.join(' · ') : 'No objections.';
  }
  return null;
}

function Turn({ turn }: { turn: IdeaRunTurn }) {
  const text = turnText(turn.output);
  const tokens = (turn.usage?.inputTokens ?? 0) + (turn.usage?.outputTokens ?? 0);
  return (
    <li className="rounded-md border border-line-soft bg-bg p-3" data-turn-role={turn.role} data-turn-status={turn.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xs text-mute">{turn.seq}</span>
        <strong className="text-sm">{ROLE_LABEL[turn.role] ?? turn.role}</strong>
        <span className="text-2xs capitalize text-mute">{turn.round}</span>
        <span className={`rounded-full border px-2 py-0.5 text-2xs ${TURN_STYLE[turn.status]}`}>{turn.status}</span>
        {turn.provider && <span className="rounded-full border border-line px-2 py-0.5 font-mono text-2xs" data-testid="turn-provider">{turn.provider} · {turn.model}</span>}
        <span className="ml-auto text-2xs text-mute">{tokens ? `${tokens} tokens · ` : ''}{(turn.durationMs / 1000).toFixed(1)}s</span>
      </div>
      {turn.reason && <p className="mt-2 text-xs text-amber-100">Reason: {turn.reason}</p>}
      {!!turn.attempts.length && <p className="mt-1 text-2xs text-mute">Fell back after: {turn.attempts.map((a) => `${a.provider} (${a.reason})`).join(', ')}</p>}
      {text && <p className="mt-2 text-xs text-mute">{text}</p>}
    </li>
  );
}

/** Approval-gated AI council review of the submitted idea, with its live turn transcript. */
export function CouncilPanel({ input, onReport }: { input: IdeaInput; onReport: (report: IdeaReport) => void }) {
  const [run, setRun] = useState<IdeaRunDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const delivered = useRef(false);

  useEffect(() => {
    if (!run || !open(run)) return;
    const timer = setTimeout(() => {
      api.ideaRun(run.id).then(setRun).catch((e) => setError(e instanceof ApiError ? e.message : 'Lost contact with the council run.'));
    }, 1000);
    return () => clearTimeout(timer);
  }, [run]);

  useEffect(() => {
    if (run?.status === 'COMPLETED' && run.report?.analysis.method === 'council' && !delivered.current) {
      delivered.current = true;
      onReport(run.report);
    }
  }, [run, onReport]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createIdeaRun(input);
      await api.approveIdeaRun(created.id);
      setRun(await api.ideaRun(created.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start the council.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!run) return;
    try {
      await api.cancelIdeaRun(run.id);
      setRun(await api.ideaRun(run.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel the council.');
    }
  }

  return (
    <section className="card p-5 sm:p-6" data-testid="council-panel" data-run-status={run?.status ?? 'IDLE'}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5 text-accent-ink" aria-hidden />AI council review</h2>
        {run && <span className="rounded-full border border-line px-2.5 py-1 text-xs text-mute">{run.status.replace('_', ' ').toLowerCase()}</span>}
      </div>
      {!run && (
        <>
          <p className="text-sm text-mute">Three AI reviewers (feasibility, market, judge) draft independently, a critic challenges them, and a chair writes the final scores. Nothing is sent until you approve; it uses up to 5 calls from the server's AI provider quota.</p>
          <button type="button" className="btn-primary mt-4" onClick={() => void start()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Bot className="h-4 w-4" aria-hidden />}Approve and run council</button>
        </>
      )}
      {run && (
        <>
          {open(run) && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Council is reviewing ({run.turns.length} of 5 turns)…</p>
              <button type="button" className="btn-secondary" onClick={() => void cancel()}><Ban className="h-4 w-4" aria-hidden />Cancel council</button>
            </div>
          )}
          {run.status === 'COMPLETED' && run.fallback && <p className="mb-3 rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-100">{FALLBACK_TEXT[run.fallback] ?? run.fallback}, so the rule-based report below stands.</p>}
          {run.status === 'COMPLETED' && !run.fallback && <p className="mb-3 text-sm text-emerald-200">The council's report is shown below, compared with the rule-based one.</p>}
          {run.status === 'CANCELLED' && <p className="mb-3 text-sm text-mute">Council cancelled. The rule-based report below stands.</p>}
          {run.status === 'FAILED' && <p className="mb-3 text-sm text-rose-100">Council failed: {run.error}</p>}
          {!!run.turns.length && <ol className="grid gap-2" aria-label="Council transcript">{run.turns.map((t) => <Turn key={t.seq} turn={t} />)}</ol>}
        </>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-100">{error}</p>}
    </section>
  );
}

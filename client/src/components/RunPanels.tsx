import { useState } from 'react';
import { Check, Loader2, Lock, Pause, Play, X } from 'lucide-react';
import { api } from '../api';
import { ErrorNote, ProviderBadge, RoleChip } from './ui';
import type { PendingDecision, ProjectSnapshot, Run, RunStatus } from '../../../shared/types';

export const AWAITING = 'Awaiting plan approval';

const RUN_STYLE: Record<RunStatus, { label: string; cls: string; dot: string }> = {
  AWAITING_APPROVAL: { label: 'Awaiting approval', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
  RUNNING: { label: 'Running', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40', dot: 'bg-indigo-400 animate-pulse' },
  PAUSED: { label: 'Paused', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/40', dot: 'bg-violet-400' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', dot: 'bg-slate-400' },
  FAILED: { label: 'Failed', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', dot: 'bg-rose-400' },
};

export function RunPill({ status }: { status: RunStatus }) {
  const s = RUN_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium ${s.cls}`} data-run-status={status}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden /> Run: {s.label}
    </span>
  );
}

export const isActiveRun = (r: Run | null | undefined) => !!r && ['AWAITING_APPROVAL', 'RUNNING', 'PAUSED'].includes(r.status);

export function commandLockReason(r: Run | null | undefined): string | null {
  if (!r) return null;
  if (r.status === 'AWAITING_APPROVAL') return 'Approve or discard the current plan before sending a new command.';
  if (r.status === 'RUNNING') return 'A run is in progress. Wait for it to finish, or pause/cancel it.';
  if (r.status === 'PAUSED') return 'The current run is paused. Resume or cancel it before sending a new command.';
  return null;
}

function useAction(onDone: () => Promise<void> | void) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setPending(key);
    setError(null);
    try {
      await fn();
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
    }
  };
  return { pending, error, run };
}

/** The plan waiting for approval: tasks in execution order, role, and why any are blocked. */
export function PlanApproval({ s, onChange }: { s: ProjectSnapshot; onChange: () => Promise<void> }) {
  const { pending, error, run } = useAction(onChange);
  const r = s.run;
  if (!r || r.status !== 'AWAITING_APPROVAL') return null;
  const tasks = s.tasks.filter((t) => t.runId === r.id).sort((a, b) => a.position - b.position);
  const cmd = s.commands.find((c) => c.id === r.commandId);
  return (
    <section className="card border-dashed border-amber-500/60 p-4" aria-labelledby="plan-h" data-testid="plan-approval">
      <p className="kicker text-amber-300">Proposed plan · not running</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 id="plan-h" className="text-sm font-semibold">Plan awaiting your approval</h2>
        <RunPill status={r.status} />
        <ProviderBadge provider={r.plannerProvider} />
      </div>
      {cmd && <p className="mt-1 text-xs text-mute">For: “{cmd.text}”</p>}
      <p className="mt-1 text-xs text-mute">Nothing runs until you approve. Limits: {r.maxTasks} task runs, {Math.round(r.maxRuntimeMs / 60000)} min.</p>
      <ol className="mt-3 space-y-1.5">
        {tasks.map((t, i) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line-soft bg-bg px-3 py-2 text-sm" data-plan-task={t.title}>
            <span className="w-6 font-mono text-xs text-mute">{String(i + 1).padStart(2, '0')}</span>
            <RoleChip role={t.role} />
            <span className="min-w-0 flex-1">{t.title}</span>
            {t.blockedReason && t.blockedReason !== AWAITING && (
              <span className="flex items-center gap-1 text-2xs text-amber-300"><Lock className="h-3 w-3" aria-hidden />blocked: {t.blockedReason}</span>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!!pending} onClick={() => run('approve', () => api.approveRun(r.id))}>
          {pending === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Approve plan
        </button>
        <button className="btn-secondary" disabled={!!pending} onClick={() => run('discard', () => api.cancelRun(r.id))}>
          {pending === 'discard' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />} Discard
        </button>
      </div>
      <ErrorNote error={error} />
    </section>
  );
}

function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Run status, progress, budget and the controls that are valid right now. */
export function RunControls({ s, onChange }: { s: ProjectSnapshot; onChange: () => Promise<void> }) {
  const { pending, error, run } = useAction(onChange);
  const r = s.run;
  if (!r) return <p className="text-sm text-mute">No run yet. Send a command to plan one.</p>;
  const tasks = s.tasks.filter((t) => t.runId === r.id);
  const done = tasks.filter((t) => t.status === 'REVIEW' || t.status === 'COMPLETED').length;
  const end = r.finishedAt ? new Date(r.finishedAt).getTime() : Date.now();
  const elapsed = r.startedAt ? end - new Date(r.startedAt).getTime() : 0;
  const btn = (key: string, label: string, Icon: typeof Play, enabled: boolean, fn: () => Promise<unknown>) => (
    <button className="btn-secondary flex-1" disabled={!enabled || !!pending} onClick={() => run(key, fn)}>
      {pending === key ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />} {label}
    </button>
  );
  return (
    <div data-testid="run-controls">
      <div className="flex flex-wrap items-center gap-2">
        <RunPill status={r.status} />
        <span className="text-sm" data-testid="run-progress">{done}/{tasks.length} tasks</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-mute">Elapsed / budget</dt><dd>{r.startedAt ? fmtDuration(elapsed) : 'not started'} / {fmtDuration(r.maxRuntimeMs)}</dd></div>
        <div><dt className="text-mute">Task runs / limit</dt><dd>{r.executed ?? 0} / {r.maxTasks}</dd></div>
      </dl>
      {r.summary && <p className="mt-2 text-xs text-mute">{r.summary}</p>}
      <div className="mt-3 flex gap-2">
        {btn('pause', 'Pause', Pause, r.status === 'RUNNING', () => api.pauseRun(r.id))}
        {btn('resume', 'Resume', Play, r.status === 'PAUSED' && s.pendingDecisions.length === 0, () => api.resumeRun(r.id))}
        {btn('cancel', 'Cancel', X, ['AWAITING_APPROVAL', 'RUNNING', 'PAUSED'].includes(r.status), () => api.cancelRun(r.id))}
      </div>
      {r.status === 'PAUSED' && s.pendingDecisions.length > 0 && <p className="mt-2 text-xs text-amber-300">Answer the decision below to continue.</p>}
      <ErrorNote error={error} />
    </div>
  );
}

export function DecisionCard({ d, title, onChange }: { d: PendingDecision; title?: string; onChange: () => Promise<void> }) {
  const { pending, error, run } = useAction(onChange);
  const [note, setNote] = useState('');
  return (
    <article className="card border-amber-500/40 p-4" data-testid="decision-card">
      <div className="flex flex-wrap items-center gap-2 text-2xs text-mute">
        <span className="font-medium uppercase tracking-wide text-amber-300">Decision needed</span>
        {title && <span>· {title}</span>}
        <ProviderBadge provider={d.provider} />
      </div>
      <p className="mt-1.5 text-sm">{d.question}</p>
      <p className="mt-1 text-xs text-mute">{d.context} · proposed: <strong className="text-ink">{d.proposed}</strong> · alternative: {d.alternatives.join(', ')}</p>
      <label htmlFor={`note-${d.id}`} className="mt-3 block text-xs text-mute">Instructions for the teammate (optional)</label>
      <textarea id={`note-${d.id}`} className="input mt-1 min-h-16" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <div className="mt-3 flex gap-2">
        <button className="btn-primary flex-1" disabled={!!pending} onClick={() => run('approve', () => api.resolveDecision(d.id, 'approve', note))}>
          {pending === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Approve (retry)
        </button>
        <button className="btn-secondary flex-1" disabled={!!pending} onClick={() => run('reject', () => api.resolveDecision(d.id, 'reject', note))}>
          {pending === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />} Reject (skip)
        </button>
      </div>
      <ErrorNote error={error} />
    </article>
  );
}

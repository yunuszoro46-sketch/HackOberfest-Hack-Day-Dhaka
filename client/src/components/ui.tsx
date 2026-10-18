import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Code2, Cpu, FileText, FlaskConical, Loader2, Search, Server, Bot, Clock, Play, Lock, Eye, CheckCircle2, XCircle } from 'lucide-react';
import type { AgentRole, TaskStatus } from '../../../shared/types';

export const STATUS_STYLE: Record<TaskStatus, { label: string; cls: string; dot: string }> = {
  QUEUED: { label: 'Queued', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', dot: 'bg-slate-400' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40', dot: 'bg-indigo-400 animate-pulse' },
  BLOCKED: { label: 'Blocked', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
  REVIEW: { label: 'Review', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/40', dot: 'bg-violet-400' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  FAILED: { label: 'Failed', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', dot: 'bg-rose-400' },
};

const STATUS_ICON: Record<TaskStatus, typeof Clock> = {
  QUEUED: Clock, IN_PROGRESS: Play, BLOCKED: Lock, REVIEW: Eye, COMPLETED: CheckCircle2, FAILED: XCircle,
};

/** Status = colour + icon + text label, so it never depends on colour alone. */
export function StatusBadge({ status }: { status: TaskStatus }) {
  const s = STATUS_STYLE[status];
  const Icon = STATUS_ICON[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium ${s.cls}`} data-status={status}>
      <Icon className={`h-3 w-3 ${status === 'IN_PROGRESS' ? 'animate-pulse' : ''}`} aria-hidden />
      {s.label}
    </span>
  );
}

export const ROLE_META: Record<AgentRole, { short: string; icon: typeof Code2; cls: string }> = {
  frontend: { short: 'Frontend', icon: Code2, cls: 'text-sky-300 bg-sky-500/10 border-sky-500/25' },
  backend: { short: 'Backend', icon: Server, cls: 'text-teal-300 bg-teal-500/10 border-teal-500/25' },
  aiml: { short: 'AI/ML', icon: Cpu, cls: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/25' },
  qa: { short: 'QA', icon: FlaskConical, cls: 'text-lime-300 bg-lime-500/10 border-lime-500/25' },
  researcher: { short: 'Research', icon: Search, cls: 'text-orange-300 bg-orange-500/10 border-orange-500/25' },
  docs: { short: 'Docs', icon: FileText, cls: 'text-pink-300 bg-pink-500/10 border-pink-500/25' },
};

export function RoleChip({ role }: { role: AgentRole }) {
  const m = ROLE_META[role];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium ${m.cls}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {m.short}
    </span>
  );
}

export function ProviderBadge({ provider }: { provider: string }) {
  const isModel = provider === 'gemma';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium ${isModel ? 'border-violet-500/40 text-violet-300' : 'border-line text-mute'}`}
      title={isModel ? 'Produced by the Gemma model' : 'Produced by a deterministic role template — no model involved'}
    >
      <Bot className="h-3 w-3" aria-hidden />
      {isModel ? 'gemma' : provider.startsWith('rules') ? provider : `${provider} · template`}
    </span>
  );
}

export function AsyncState({
  loading, error, empty, emptyText = 'Nothing here yet.', onRetry, children,
}: { loading: boolean; error: Error | null; empty?: boolean; emptyText?: ReactNode; onRetry?: () => void; children: ReactNode }) {
  if (loading)
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-2 p-6 text-sm text-mute">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    );
  if (error)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">{error.message}</span>
        {(error as { status?: number }).status === 404
          ? <Link to="/dashboard" className="btn-secondary btn-sm">Go to dashboard</Link>
          : onRetry && <button className="btn-secondary btn-sm" onClick={onRetry}>Try again</button>}
      </div>
    );
  if (empty) return <div className="p-6 text-center text-sm text-mute">{emptyText}</div>;
  return <>{children}</>;
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-rose-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
    </p>
  );
}

import { Link } from 'react-router';
import { BookOpen, Bot, Eye, Settings2, Sparkles } from 'lucide-react';
import { api } from '../../api';
import { useAsync, useNow } from '../../hooks';
import { RunPill } from '../RunPanels';
import { STATUS_STYLE } from '../ui';
import { TASK_STATUSES, type ProjectSnapshot } from '../../../../shared/types';

/**
 * Telemetry strip: project identity, connection freshness and real counts.
 * "Live" is only claimed while polls are succeeding; otherwise it shows the age of the last good update.
 */
export function OpsBar({ s, loadedAt, error, pollMs }: { s: ProjectSnapshot; loadedAt: number | null; error: Error | null; pollMs: number }) {
  const now = useNow(1000);
  const age = loadedAt ? Math.max(0, Math.round((now - loadedAt) / 1000)) : null;
  const stale = !!error || (age !== null && age * 1000 > pollMs * 3);
  const files = new Set(s.artifacts.map((a) => a.path)).size;

  return (
    <header className="border-b border-line-soft pb-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="kicker">Project</p>
          <h1 className="truncate text-xl font-semibold tracking-tight">{s.project.name}</h1>
          <p className="truncate text-sm text-mute">{s.project.goal || 'No goal set'}</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2" aria-label="Project">
          <Link to={`/projects/${s.project.id}/supervise`} className="btn-secondary btn-sm"><Eye className="h-3.5 w-3.5" aria-hidden /> Supervise</Link>
          <Link to={`/projects/${s.project.id}/context`} className="btn-secondary btn-sm"><BookOpen className="h-3.5 w-3.5" aria-hidden /> Context</Link>
          <Link to={`/projects/${s.project.id}/agents`} className="btn-secondary btn-sm"><Settings2 className="h-3.5 w-3.5" aria-hidden /> Edit team</Link>
        </nav>
      </div>

      <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-2xs uppercase tracking-[0.12em] text-mute" data-testid="ops-bar">
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${stale ? 'bg-amber-400' : 'bg-live'}`} aria-hidden />
          <dt className="sr-only">Connection</dt>
          <dd className={stale ? 'text-amber-300' : 'text-ink'}>
            {stale ? `Stale · last update ${age ?? '?'}s ago` : `Live · updated ${age ?? 0}s ago`}
          </dd>
        </div>
        {s.run && <div><dt className="sr-only">Run</dt><dd><RunPill status={s.run.status} /></dd></div>}
        <div><dt className="inline">Agents </dt><dd className="inline text-ink">{s.agents.length}</dd></div>
        <div><dt className="inline">Tasks </dt><dd className="inline text-ink">{s.tasks.length}</dd></div>
        {TASK_STATUSES.filter((st) => s.tasks.some((t) => t.status === st)).map((st) => (
          <div key={st} className="flex items-center gap-1">
            <dt className="inline">{STATUS_STYLE[st].label} </dt>
            <dd className="inline text-ink">{s.tasks.filter((t) => t.status === st).length}</dd>
          </div>
        ))}
        <div><dt className="inline">Files </dt><dd className="inline text-ink">{files}</dd></div>
        <ExecutionMode />
      </dl>
    </header>
  );
}

/** Says up front whether a model or the role templates will execute tasks. QA and docs never use a model. */
function ExecutionMode() {
  const health = useAsync(() => api.health(), []);
  const ex = health.data?.execution;
  if (!ex) return null;
  const model = ex.mode === 'model';
  const Icon = model ? Sparkles : Bot;
  return (
    <div className="flex items-center gap-1.5 normal-case tracking-normal" data-testid="execution-mode" data-mode={ex.mode} title={ex.warning ?? (model ? 'Builders write code with a model; QA and docs are deterministic.' : 'Role templates write the files; no model is used.')}>
      <dt className="sr-only">Execution</dt>
      <dd className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${model ? 'border-violet-500/40 text-violet-200' : ex.warning ? 'border-amber-500/40 text-amber-200' : 'border-line text-mute'}`}>
        <Icon className="h-3 w-3" aria-hidden />
        {model ? `Builders: ${ex.models.join(' → ') || 'model'} · QA: real checks` : ex.warning ? 'Templates (no model key set)' : 'Templates · no model'}
      </dd>
    </div>
  );
}

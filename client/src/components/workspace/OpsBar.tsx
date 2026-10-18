import { Link } from 'react-router';
import { BookOpen, Eye, Settings2 } from 'lucide-react';
import { useNow } from '../../hooks';
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
        <div className="flex items-center gap-1.5" role="status" aria-live="polite">
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
      </dl>
    </header>
  );
}

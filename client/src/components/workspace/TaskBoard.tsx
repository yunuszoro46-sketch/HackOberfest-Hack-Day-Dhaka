import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, FileCode2, Inbox, ListTodo, Loader2, Lock, Play, RotateCcw, Users } from 'lucide-react';
import { api } from '../../api';
import { ProviderBadge, ROLE_META, RoleChip, StatusBadge } from '../ui';
import { AWAITING } from '../RunPanels';
import { TASK_STATUSES, type AgentRun, type Artifact, type ProjectSnapshot, type Task, type TaskStatus } from '../../../../shared/types';

const LANE_EDGE: Record<TaskStatus, string> = {
  QUEUED: 'border-t-slate-400', IN_PROGRESS: 'border-t-indigo-400', BLOCKED: 'border-t-amber-400',
  REVIEW: 'border-t-violet-400', COMPLETED: 'border-t-emerald-400', FAILED: 'border-t-rose-400',
};

export function TaskBoard({ s, onChange }: { s: ProjectSnapshot; onChange: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const artifactsByTask = useMemo(() => {
    const m = new Map<string, Artifact[]>();
    for (const a of s.artifacts) m.set(a.taskId, [...(m.get(a.taskId) ?? []), a]);
    return m;
  }, [s.artifacts]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium"><ListTodo className="h-4 w-4 text-mute" aria-hidden /> Tasks</h2>
        <span className="text-xs text-mute">{s.tasks.length} total</span>
      </div>
      {error && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{error}</span>
          {/team/i.test(error) && <Link to={`/projects/${s.project.id}/agents`} className="underline">Edit team</Link>}
        </div>
      )}
      {s.tasks.length === 0 ? (
        <div className="card p-8 text-center text-sm text-mute">No tasks yet. Send your team a command above.</div>
      ) : (
        <>
          {/* All six states always visible with label + count; only non-empty states get a column. */}
          <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Tasks per status" data-testid="status-strip">
            {TASK_STATUSES.map((status) => {
              const n = s.tasks.filter((t) => t.status === status).length;
              return (
                <li key={status} className={`flex items-center gap-1.5 ${n ? '' : 'opacity-60'}`} data-status-count={status}>
                  <StatusBadge status={status} /><span className="font-mono text-2xs text-ink">{n}</span>
                </li>
              );
            })}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {TASK_STATUSES.filter((status) => s.tasks.some((t) => t.status === status)).map((status) => {
              const tasks = s.tasks.filter((t) => t.status === status);
              return (
                <section key={status} className={`rounded-lg border border-line border-t-2 bg-surface/60 p-2 ${LANE_EDGE[status]}`} aria-label={`${status} tasks`} data-column={status}>
                  <div className="flex items-center justify-between px-1.5 py-1">
                    <StatusBadge status={status} />
                    <span className="font-mono text-xs text-mute">{tasks.length}</span>
                  </div>
                  <div className="mt-1 space-y-2">
                    {tasks.map((t) => (
                      <TaskCard key={t.id} t={t} artifacts={artifactsByTask.get(t.id) ?? []} act={act} projectId={s.project.id}
                        run={s.runs.filter((r) => r.taskId === t.id).at(-1)} onTeam={s.agents.some((a) => a.role === t.role)}
                        decisionPending={s.pendingDecisions.some((d) => d.taskId === t.id)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function TaskCard({ t, artifacts, act, run, onTeam, projectId, decisionPending }: {
  t: Task; artifacts: Artifact[]; act: (fn: () => Promise<unknown>) => Promise<void>; run?: AgentRun; onTeam: boolean; projectId: string; decisionPending: boolean;
}) {
  const parked = t.blockedReason === AWAITING || t.blockedReason === 'Run cancelled';
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const go = async (fn: () => Promise<unknown>) => {
    setPending(true);
    try { await act(fn); } finally { setPending(false); }
  };
  const latest = useMemo(() => {
    const m = new Map<string, Artifact>();
    for (const a of artifacts) m.set(a.path, a);
    return [...m.values()];
  }, [artifacts]);
  return (
    <article className="rounded-lg border border-line bg-surface p-3" data-task-title={t.title} data-task-status={t.status}>
      <div className="flex items-center gap-2">
        <RoleChip role={t.role} />
        {t.attempts > 0 && <span className="text-2xs text-mute">attempt {t.attempts}</span>}
        {run && <span className="ml-auto"><ProviderBadge provider={run.provider} /></span>}
      </div>
      <h3 className="mt-1.5 text-sm font-medium leading-snug">{t.title}</h3>
      {t.status === 'IN_PROGRESS' && <p className="mt-1 flex items-center gap-1.5 text-xs text-indigo-300"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Working…</p>}
      {t.status === 'BLOCKED' && t.blockedReason && <p className="mt-1 flex items-start gap-1 text-xs text-amber-300"><Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{t.blockedReason}</p>}
      {t.status === 'FAILED' && t.lastError && <p className="mt-1 line-clamp-3 text-xs text-rose-300" title={t.lastError}>{t.lastError}</p>}
      {(t.status === 'REVIEW' || t.status === 'COMPLETED') && t.summary && <p className="mt-1 line-clamp-3 text-xs text-mute">{t.summary}</p>}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {t.status === 'REVIEW' && (
          <button className="btn-sm btn border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" disabled={pending} onClick={() => go(() => api.patchTask(t.id, { status: 'COMPLETED' }))}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />} Approve
          </button>
        )}
        {t.status === 'BLOCKED' && onTeam && !parked && (
          <button className="btn-sm btn border border-amber-500/40 text-amber-300 hover:bg-amber-500/10" disabled={pending} onClick={() => go(() => api.patchTask(t.id, { status: 'QUEUED' }))}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />} Unblock
          </button>
        )}
        {t.status === 'BLOCKED' && !onTeam && (
          <Link to={`/projects/${projectId}/agents`} className="btn-sm btn border border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
            <Users className="h-3.5 w-3.5" aria-hidden /> Add {ROLE_META[t.role].short} to team
          </Link>
        )}
        {t.status === 'FAILED' && decisionPending && (
          <a href="#needs-h" className="btn-sm btn border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"><Inbox className="h-3.5 w-3.5" aria-hidden /> Decide in the inbox above</a>
        )}
        {t.status === 'FAILED' && !decisionPending && (
          <button className="btn-sm btn border border-rose-500/40 text-rose-300 hover:bg-rose-500/10" disabled={pending} onClick={() => go(() => api.retry(t.id))}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />} Retry
          </button>
        )}
        {latest.length > 0 && (
          <button className="btn-sm btn-secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <FileCode2 className="h-3.5 w-3.5" aria-hidden /> Open artifacts ({latest.length})
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-2 space-y-1">
          {latest.map((a) => (
            <li key={a.id}><Link to={`/artifacts/${a.id}`} className="block truncate py-3 font-mono text-2xs text-accent-ink hover:underline sm:py-0.5">{a.path}</Link></li>
          ))}
        </ul>
      )}
    </article>
  );
}

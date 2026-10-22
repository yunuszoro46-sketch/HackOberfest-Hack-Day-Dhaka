import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Activity, ArrowLeft, FileCode2, Inbox, ListTodo, Loader2, Send, Users } from 'lucide-react';
import { api } from '../api';
import { clock, useAsync, useNow } from '../hooks';
import { AsyncState, ErrorNote, ProviderBadge, RoleChip, StatusBadge } from '../components/ui';
import { RunControls, RunPill, commandLockReason } from '../components/RunPanels';
import { NeedsYou } from '../components/workspace/NeedsYou';
import { Announcer } from '../components/Announcer';
import { HandoffTrail } from '../components/workspace/HandoffTrail';
import { TASK_STATUSES, type ProjectSnapshot } from '../../../shared/types';

/** Mobile-first supervision view: run, decisions, agents, tasks, recent activity, deliverables, command. */
export default function Supervise() {
  const { id = '' } = useParams();
  const snap = useAsync(() => api.snapshot(id), [id], (d) => (d?.run?.status === 'RUNNING' || d?.busy ? 2000 : 6000));
  const s = snap.data;

  const r = s?.run;
  const pollMs = r?.status === 'RUNNING' || s?.busy ? 2000 : 6000;
  const now = useNow(1000);
  const age = snap.loadedAt ? Math.round((now - snap.loadedAt) / 1000) : null;
  const stale = !!snap.error || (age !== null && age * 1000 > pollMs * 3);
  const runTasks = s && r ? s.tasks.filter((t) => t.runId === r.id) : [];
  const done = runTasks.filter((t) => t.status === 'REVIEW' || t.status === 'COMPLETED').length;

  return (
    <div className="mx-auto max-w-xl px-4 pb-8">
      <Announcer s={s} />
      {s && (
        <div className="sticky top-14 z-10 -mx-4 border-b border-line-soft bg-bg/90 px-4 py-2 backdrop-blur" data-testid="supervise-status">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {r ? <RunPill status={r.status} /> : <span className="kicker">No run yet</span>}
            {r && <span className="font-mono text-xs text-ink">{done}/{runTasks.length} tasks</span>}
            {(s.pendingDecisions.length > 0 || r?.status === 'AWAITING_APPROVAL') && (
              <a href="#needs-h" className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-amber-300 underline"><Inbox className="h-3.5 w-3.5" aria-hidden />{s.pendingDecisions.length + (r?.status === 'AWAITING_APPROVAL' ? 1 : 0)} waiting</a>
            )}
            <span className={`ml-auto flex items-center gap-1.5 font-mono text-2xs ${stale ? 'text-amber-300' : 'text-mute'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-amber-400' : 'bg-live'}`} aria-hidden />{stale ? `stale ${age ?? '?'}s` : `live · ${age ?? 0}s`}
            </span>
          </div>
        </div>
      )}
      <Link to={`/projects/${id}`} className="btn-ghost btn-sm -ml-2 mt-3"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Full workspace</Link>
      {!s ? (
        <AsyncState loading={snap.loading} error={snap.error} onRetry={snap.reload}>{null}</AsyncState>
      ) : (
        <div className="mt-2 space-y-4">
          <header>
            <p className="kicker">Supervision</p>
            <h1 className="text-xl font-semibold">{s.project.name}</h1>
            <p className="text-xs text-mute">In-app approval inbox (no push notifications) · refreshes every {pollMs / 1000}s</p>
          </header>

          <NeedsYou s={s} onChange={snap.reload} />
          {s.pendingDecisions.length === 0 && r?.status !== 'AWAITING_APPROVAL' && (
            <p className="flex items-center gap-2 rounded-lg border border-line-soft p-3 text-sm text-mute"><Inbox className="h-4 w-4" aria-hidden />Nothing needs your decision.</p>
          )}

          <section className={`card border-l-4 p-4 ${r?.status === 'RUNNING' ? 'border-l-indigo-400' : r?.status === 'PAUSED' ? 'border-l-violet-400' : 'border-l-line'}`} aria-labelledby="sup-run-h">
            <h2 id="sup-run-h" className="kicker mb-2">{r?.status === 'AWAITING_APPROVAL' ? 'Proposed run' : 'Current run'}</h2>
            <RunControls s={s} onChange={snap.reload} />
          </section>

          <HandoffTrail s={s} compact />
          <Agents s={s} />
          <Tasks s={s} />
          <Recent s={s} />
          <Files s={s} />
          <CommandBox s={s} onSent={snap.reload} />
        </div>
      )}
    </div>
  );
}

function Agents({ s }: { s: ProjectSnapshot }) {
  return (
    <section className="card" aria-labelledby="ag-h">
      <h2 id="ag-h" className="panel-head text-sm font-medium"><Users className="h-4 w-4 text-mute" aria-hidden /> Agents</h2>
      {s.agents.length === 0 ? <p className="p-4 text-sm text-mute">No teammates. <Link className="text-accent-ink underline" to={`/projects/${s.project.id}/agents`}>Add some</Link>.</p> : (
        <ul className="divide-y divide-line">
          {s.agents.map((a) => {
            const working = s.tasks.find((t) => t.role === a.role && t.status === 'IN_PROGRESS');
            const lastRun = s.runs.filter((x) => x.role === a.role).at(-1);
            const task = working ?? (lastRun ? s.tasks.find((t) => t.id === lastRun.taskId) : undefined);
            return (
              <li key={a.id} className="px-4 py-2.5 text-sm" data-agent={a.role}>
                <div className="flex items-center gap-2">
                  <RoleChip role={a.role} />
                  <span className={`text-xs ${working ? 'text-indigo-300' : 'text-mute'}`}>{working ? 'Working' : 'Idle'}</span>
                  {lastRun && <span className="ml-auto"><ProviderBadge provider={lastRun.provider} /></span>}
                </div>
                {task ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <StatusBadge status={task.status} />
                    <span className="min-w-0 flex-1 truncate text-xs">{working ? 'On' : 'Last'}: {task.title}</span>
                    <span className="font-mono text-2xs text-mute">attempt {task.attempts}</span>
                  </div>
                ) : <p className="mt-1 text-xs text-mute">No tasks yet.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Tasks({ s }: { s: ProjectSnapshot }) {
  const runTasks = s.run ? s.tasks.filter((t) => t.runId === s.run!.id) : s.tasks;
  return (
    <section className="card" aria-labelledby="tk-h">
      <h2 id="tk-h" className="panel-head text-sm font-medium"><ListTodo className="h-4 w-4 text-mute" aria-hidden /> Tasks in this run</h2>
      {runTasks.length === 0 ? <p className="p-4 text-sm text-mute">No tasks yet.</p> : (
        <ul className="divide-y divide-line">
          {TASK_STATUSES.flatMap((st) => runTasks.filter((t) => t.status === st)).map((t) => (
            <li key={t.id} className="px-4 py-2.5" data-task-title={t.title} data-task-status={t.status}>
              <div className="flex items-center gap-2"><StatusBadge status={t.status} /><RoleChip role={t.role} />{t.attempts > 1 && <span className="text-2xs text-mute">attempt {t.attempts}</span>}</div>
              <p className="mt-1 text-sm">{t.title}</p>
              {(t.blockedReason || t.lastError) && <p className={`mt-0.5 text-xs ${t.status === 'FAILED' ? 'text-rose-300' : 'text-amber-300'}`}>{t.status === 'FAILED' ? t.lastError : t.blockedReason}{t.status === 'FAILED' && t.blockedReason ? ` · ${t.blockedReason}` : ''}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Recent({ s }: { s: ProjectSnapshot }) {
  const rows = s.activity.slice(0, 10);
  return (
    <section className="card" aria-labelledby="ac-h">
      <h2 id="ac-h" className="panel-head text-sm font-medium"><Activity className="h-4 w-4 text-mute" aria-hidden /> Last 10 activity</h2>
      <ol className="divide-y divide-line">
        {rows.map((e) => (
          <li key={e.id} className="px-4 py-2 text-xs">
            <div className="flex justify-between gap-2 text-2xs text-mute"><span className="truncate">{e.actor}</span><time className="shrink-0 font-mono" dateTime={e.createdAt}>{clock(e.createdAt)}</time></div>
            <p className="mt-0.5 break-words">{e.message}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Files({ s }: { s: ProjectSnapshot }) {
  const runs = new Map(s.runs.map((r) => [r.id, r]));
  const latest = [...new Map(s.artifacts.map((a) => [a.path, a])).values()].sort((a, b) => (a.path === 'reports/qa-report.md' ? -1 : b.path === 'reports/qa-report.md' ? 1 : 0));
  return (
    <section className="card" aria-labelledby="fl-h">
      <h2 id="fl-h" className="panel-head text-sm font-medium"><FileCode2 className="h-4 w-4 text-mute" aria-hidden /> Deliverables</h2>
      {latest.length === 0 ? <p className="p-4 text-sm text-mute">No files yet.</p> : (
        <ul className="divide-y divide-line">
          {latest.map((a) => (
            <li key={a.id}>
              <Link to={`/artifacts/${a.id}`} className="flex min-h-10 items-center gap-2 px-4 py-2 hover:bg-surface-2" data-artifact={a.path}>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-accent-ink">{a.path === 'reports/qa-report.md' ? 'QA report — ' : ''}{a.path}</span>
                {runs.get(a.runId) && <ProviderBadge provider={runs.get(a.runId)!.provider} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommandBox({ s, onSent }: { s: ProjectSnapshot; onSent: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = commandLockReason(s.run) ?? (s.agents.length === 0 ? 'Add teammates before sending a command.' : null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || lock) return;
    setBusy(true);
    setError(null);
    try {
      await api.command(s.project.id, text);
      setText('');
      await onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card p-4" aria-label="New command">
      <label htmlFor="sup-cmd" className="label">New command</label>
      <textarea id="sup-cmd" className="input min-h-16" value={text} onChange={(e) => setText(e.target.value)} disabled={!!lock || busy} maxLength={2000}
        placeholder={lock ? '' : 'e.g. "simulate a failure, implement booking validation"'} />
      {lock && <p className="mt-1 text-xs text-amber-300" data-testid="command-lock">{lock}</p>}
      <button className="btn-primary mt-2 w-full" disabled={!!lock || busy || !text.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Plan it
      </button>
      <ErrorNote error={error} />
    </form>
  );
}

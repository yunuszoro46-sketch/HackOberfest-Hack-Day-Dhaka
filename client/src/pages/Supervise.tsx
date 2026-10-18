import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Activity, ArrowLeft, FileCode2, Inbox, ListTodo, Loader2, Send, Users } from 'lucide-react';
import { api } from '../api';
import { timeAgo, useAsync } from '../hooks';
import { AsyncState, ErrorNote, ProviderBadge, RoleChip, StatusBadge } from '../components/ui';
import { DecisionCard, PlanApproval, RunControls, commandLockReason } from '../components/RunPanels';
import { TASK_STATUSES, type ProjectSnapshot } from '../../../shared/types';

/** Mobile-first supervision view: run, decisions, agents, tasks, recent activity, deliverables, command. */
export default function Supervise() {
  const { id = '' } = useParams();
  const snap = useAsync(() => api.snapshot(id), [id], (d) => (d?.run?.status === 'RUNNING' || d?.busy ? 2000 : 6000));
  const s = snap.data;

  return (
    <div className="mx-auto max-w-xl px-4 py-5">
      <Link to={`/projects/${id}`} className="btn-ghost btn-sm -ml-2"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Full workspace</Link>
      {!s ? (
        <AsyncState loading={snap.loading} error={snap.error} onRetry={snap.reload}>{null}</AsyncState>
      ) : (
        <div className="mt-2 space-y-4">
          <header>
            <h1 className="text-xl font-semibold">{s.project.name}</h1>
            <p className="text-xs text-mute">Supervision · in-app approval inbox (no push notifications) · updates every {s.run?.status === 'RUNNING' ? '2' : '6'}s</p>
          </header>

          {s.pendingDecisions.length > 0 && <div data-testid="decision-inbox">
            <section aria-labelledby="inbox-h" className="space-y-3">
            <h2 id="inbox-h" className="flex items-center gap-2 text-sm font-medium"><Inbox className="h-4 w-4 text-mute" aria-hidden /> Decisions <span className="text-xs font-normal text-mute">{s.pendingDecisions.length} pending</span></h2>
            {s.pendingDecisions.map((d) => <DecisionCard key={d.id} d={d} title={s.tasks.find((t) => t.id === d.taskId)?.title} onChange={snap.reload} />)}
          </section>
          </div>}
          <section className={`card border-l-4 p-4 ${s.run?.status === 'RUNNING' ? 'border-l-indigo-400' : s.run?.status === 'PAUSED' ? 'border-l-violet-400' : 'border-l-line'}`} aria-label="Run"><RunControls s={s} onChange={snap.reload} /></section>

          <PlanApproval s={s} onChange={snap.reload} />
          {s.pendingDecisions.length === 0 && <p className="card p-4 text-sm text-mute"><Inbox className="mr-1.5 inline h-4 w-4" aria-hidden />Nothing needs your decision.</p>}


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
      <h2 id="ag-h" className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium"><Users className="h-4 w-4 text-mute" aria-hidden /> Agents</h2>
      {s.agents.length === 0 ? <p className="p-4 text-sm text-mute">No teammates. <Link className="text-accent-ink underline" to={`/projects/${s.project.id}/agents`}>Add some</Link>.</p> : (
        <ul className="divide-y divide-line">
          {s.agents.map((a) => {
            const working = s.tasks.find((t) => t.role === a.role && t.status === 'IN_PROGRESS');
            return (
              <li key={a.id} className="flex items-center gap-2 px-4 py-2.5 text-sm" data-agent={a.role}>
                <RoleChip role={a.role} />
                <span className="min-w-0 flex-1 truncate text-xs">{working ? `Working on “${working.title}”` : 'Idle'}</span>
                {working && <StatusBadge status="IN_PROGRESS" />}
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
      <h2 id="tk-h" className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium"><ListTodo className="h-4 w-4 text-mute" aria-hidden /> Tasks in this run</h2>
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
      <h2 id="ac-h" className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium"><Activity className="h-4 w-4 text-mute" aria-hidden /> Last 10 activity</h2>
      <ol className="divide-y divide-line">
        {rows.map((e) => (
          <li key={e.id} className="px-4 py-2 text-xs">
            <div className="flex justify-between gap-2 text-2xs text-mute"><span className="truncate">{e.actor}</span><span className="shrink-0">{timeAgo(e.createdAt)}</span></div>
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
      <h2 id="fl-h" className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium"><FileCode2 className="h-4 w-4 text-mute" aria-hidden /> Deliverables</h2>
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
        placeholder={lock ? '' : 'e.g. "simulate a failure"'} />
      {lock && <p className="mt-1 text-xs text-amber-300" data-testid="command-lock">{lock}</p>}
      <button className="btn-primary mt-2 w-full" disabled={!!lock || busy || !text.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Plan it
      </button>
      <ErrorNote error={error} />
    </form>
  );
}

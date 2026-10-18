import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  Activity, AlertTriangle, BookOpen, Eye, Inbox, CheckCircle2, FileCode2, FileText, FlaskConical, ListTodo, Loader2, Lock, Play,
  RotateCcw, Send, Settings2, Sparkles, StickyNote, Terminal, Users,
} from 'lucide-react';
import { api } from '../api';
import { timeAgo, useAsync } from '../hooks';
import { AsyncState, ErrorNote, ProviderBadge, ROLE_META, RoleChip, StatusBadge } from '../components/ui';
import { AWAITING, PlanApproval, RunPill, commandLockReason } from '../components/RunPanels';
import {
  TASK_STATUSES, type ActivityEvent, type AgentRole, type AgentRun, type Artifact, type Command, type ProjectSnapshot, type Task,
} from '../../../shared/types';

const DEMO = 'Build a room availability interface, implement booking validation, test edge cases, and document the result.';
const ROLE_TITLES: Record<AgentRole, string> = {
  frontend: 'Frontend Engineer', backend: 'Backend Engineer', aiml: 'AI/ML Engineer', qa: 'QA Engineer', researcher: 'Researcher', docs: 'Documentation Writer',
};

const isActive = (s?: ProjectSnapshot) => !!s && (s.busy || s.run?.status === 'RUNNING' || s.tasks.some((t) => t.status === 'IN_PROGRESS'));

type Tab = 'board' | 'team' | 'activity' | 'files';

export default function Workspace() {
  const { id = '' } = useParams();
  const snap = useAsync(() => api.snapshot(id), [id], (d) => (isActive(d) ? 1500 : 6000));
  const [tab, setTab] = useState<Tab>('board');
  const s = snap.data;

  if (!s) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <AsyncState loading={snap.loading} error={snap.error} onRetry={snap.reload}>{null}</AsyncState>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof ListTodo }[] = [
    { key: 'board', label: 'Tasks', icon: ListTodo },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'activity', label: 'Activity', icon: Activity },
    { key: 'files', label: 'Files', icon: FileCode2 },
  ];
  const show = (t: Tab) => (tab === t ? 'block' : 'hidden lg:block');

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{s.project.name}</h1>
          <p className="truncate text-sm text-mute">{s.project.goal || 'No goal set'}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link to={`/projects/${id}/supervise`} className="btn-secondary btn-sm"><Eye className="h-3.5 w-3.5" aria-hidden /> Supervise</Link>
          <Link to={`/projects/${id}/context`} className="btn-secondary btn-sm"><BookOpen className="h-3.5 w-3.5" aria-hidden /> Context</Link>
          <Link to={`/projects/${id}/agents`} className="btn-secondary btn-sm"><Settings2 className="h-3.5 w-3.5" aria-hidden /> Edit team</Link>
        </div>
      </div>

      <CommandBar projectId={id} lock={commandLockReason(s.run)} hasAgents={s.agents.length > 0} onSent={snap.reload} latest={s.commands[0]} taskCount={s.commands[0] ? s.tasks.filter((t) => t.commandId === s.commands[0].id).length : 0} commandCount={s.commands.length} />

      {s.run?.status === 'AWAITING_APPROVAL' && <div className="mt-4"><PlanApproval s={s} onChange={snap.reload} /></div>}
      {s.run && s.run.status !== 'AWAITING_APPROVAL' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <RunPill status={s.run.status} />
          <span className="text-mute">{s.tasks.filter((t) => t.runId === s.run!.id && (t.status === 'REVIEW' || t.status === 'COMPLETED')).length}/{s.tasks.filter((t) => t.runId === s.run!.id).length} tasks</span>
          {s.pendingDecisions.length > 0 && (
            <Link to={`/projects/${id}/supervise`} className="inline-flex min-h-10 items-center gap-1 text-amber-300 underline sm:min-h-0" data-testid="decision-banner">
              <Inbox className="h-3.5 w-3.5" aria-hidden /> {s.pendingDecisions.length} decision{s.pendingDecisions.length === 1 ? '' : 's'} waiting
            </Link>
          )}
          <Link to={`/projects/${id}/supervise`} className="inline-flex min-h-10 items-center text-accent-ink hover:underline sm:min-h-0">Supervise run →</Link>
        </div>
      )}

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 lg:hidden" role="tablist" aria-label="Workspace sections">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-surface-2 text-ink' : 'text-mute'}`}>
            <t.icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_320px]">
        <aside className={show('team')}><Roster s={s} /></aside>
        <section className={`min-w-0 ${show('board')}`}><Board s={s} onChange={snap.reload} /></section>
        <aside className="min-w-0 space-y-4">
          <div className={show('files')}><Deliverables s={s} /></div>
          <div className={show('activity')}><Feed events={s.activity} /></div>
        </aside>
      </div>
    </div>
  );
}

function CommandBar({ projectId, lock, hasAgents, onSent, latest, taskCount, commandCount }: {
  projectId: string; lock: string | null; hasAgents: boolean; onSent: () => Promise<void>; latest?: Command; taskCount: number; commandCount: number;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.command(projectId, text);
      setText('');
      await onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-3" aria-label="Command the team">
      <label htmlFor="command" className="sr-only">Command for your team</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          id="command"
          className="input min-h-[52px] flex-1 resize-y"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e); }}
          placeholder={hasAgents ? 'Tell your team what to do… e.g. "' + DEMO + '"' : 'Add teammates first, then give a command.'}
          disabled={busy || !!lock}
        />
        <button type="submit" className="btn-primary sm:w-40" disabled={busy || !text.trim() || !hasAgents || !!lock}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send to team
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mute">
        {lock && <span className="text-amber-300" data-testid="command-lock">{lock}</span>}
        {!text && hasAgents && !lock && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setText(DEMO)}><Sparkles className="h-3 w-3" aria-hidden /> Use demo command</button>
        )}
        {!hasAgents && <Link to={`/projects/${projectId}/agents`} className="text-accent-ink underline">Pick your teammates</Link>}
        <span className="hidden sm:inline">Ctrl/⌘ + Enter to send</span>
      </div>
      <ErrorNote error={error} />
      {latest && (
        <div className="mt-3 rounded-lg border border-line bg-bg p-3" role="status" data-testid="planner-note">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-mute">
            <span className="font-medium uppercase tracking-wide">Leader's last command</span>
            <span>· {timeAgo(latest.createdAt)}</span>
            {commandCount > 1 && <Link to={`/projects/${projectId}/context`} className="inline-flex min-h-10 items-center text-accent-ink hover:underline sm:min-h-0">all {commandCount} commands</Link>}
          </div>
          <p className="mt-1 text-sm text-ink">“{latest.text}”</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mute">
            <Sparkles className="h-3.5 w-3.5 text-accent-ink" aria-hidden /> Planned by
            <ProviderBadge provider={latest.plannerProvider} />
            <span>into {taskCount} task{taskCount === 1 ? '' : 's'}</span>
          </div>
          {latest.plannerNote && <p className="mt-1 text-xs text-mute">{latest.plannerNote}</p>}
        </div>
      )}
    </form>
  );
}

function Roster({ s }: { s: ProjectSnapshot }) {
  const missing = [...new Set(s.tasks.filter((t) => t.status === 'BLOCKED' && !s.agents.some((a) => a.role === t.role)).map((t) => t.role))];
  return (
    <div className="card">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium"><Users className="h-4 w-4 text-mute" aria-hidden /> Team</h2>
      <AsyncState loading={false} error={null} empty={s.agents.length === 0} emptyText={<Link className="text-accent-ink underline" to={`/projects/${s.project.id}/agents`}>Add teammates</Link>}>
        <ul className="divide-y divide-line">
          {s.agents.map((a) => {
            const mine = s.tasks.filter((t) => t.role === a.role);
            const working = mine.find((t) => t.status === 'IN_PROGRESS');
            const queued = mine.filter((t) => t.status === 'QUEUED').length;
            const blocked = mine.filter((t) => t.status === 'BLOCKED').length;
            const lastRun = s.runs.filter((r) => r.role === a.role).at(-1);
            const lastTask = working ?? (lastRun ? s.tasks.find((t) => t.id === lastRun.taskId) : undefined);
            const Icon = ROLE_META[a.role].icon;
            return (
              <li key={a.id} className="px-4 py-3" data-agent={a.role}>
                <div className="flex items-center gap-2">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border ${ROLE_META[a.role].cls}`}><Icon className="h-3.5 w-3.5" aria-hidden /></span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{ROLE_TITLES[a.role]}</span>
                  {working
                    ? <span className="flex items-center gap-1 text-2xs text-indigo-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" aria-hidden />Working</span>
                    : <span className="text-2xs text-mute">Idle</span>}
                </div>
                {lastTask ? (
                  <div className="mt-2 rounded-md border border-line bg-bg px-2.5 py-2">
                    <p className="text-2xs text-mute">{working ? 'Working on' : 'Last task'}</p>
                    <p className="truncate text-xs text-ink" title={lastTask.title}>{lastTask.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={lastTask.status} />
                      <span className="text-2xs text-mute">attempt {lastTask.attempts}</span>
                      {lastRun && lastRun.taskId === lastTask.id && <ProviderBadge provider={lastRun.provider} />}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-mute">No tasks yet.</p>
                )}
                {(queued > 0 || blocked > 0) && (
                  <p className="mt-1.5 text-2xs text-mute">
                    {queued > 0 && <span>{queued} queued</span>}
                    {queued > 0 && blocked > 0 && ' · '}
                    {blocked > 0 && <span className="text-amber-300">{blocked} blocked</span>}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </AsyncState>
      {missing.length > 0 && (
        <div className="border-t border-line px-4 py-3 text-xs">
          <p className="mb-1.5 flex items-center gap-1 text-amber-300"><Lock className="h-3 w-3" aria-hidden /> Tasks waiting for:</p>
          {missing.map((r) => <p key={r} className="text-mute">{ROLE_TITLES[r]}</p>)}
          <Link to={`/projects/${s.project.id}/agents`} className="mt-2 inline-flex min-h-10 items-center text-accent-ink underline sm:min-h-0">Add to team</Link>
        </div>
      )}
    </div>
  );
}

function Board({ s, onChange }: { s: ProjectSnapshot; onChange: () => Promise<void> }) {
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
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {TASK_STATUSES.map((status) => {
            const tasks = s.tasks.filter((t) => t.status === status);
            return (
              <section key={status} className="rounded-xl border border-line bg-surface/60 p-2" aria-label={`${status} tasks`} data-column={status}>
                <div className="flex items-center justify-between px-1.5 py-1">
                  <StatusBadge status={status} />
                  <span className="text-xs text-mute">{tasks.length}</span>
                </div>
                <div className="mt-1 space-y-2">
                  {tasks.length === 0 && <p className="px-1.5 py-2 text-xs text-mute">None</p>}
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
          <Link to={`/projects/${projectId}/supervise`} className="btn-sm btn border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"><Inbox className="h-3.5 w-3.5" aria-hidden /> Decide in Supervise</Link>
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

function Feed({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="card flex max-h-[60vh] flex-col">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium"><Activity className="h-4 w-4 text-mute" aria-hidden /> Activity</h2>
      {events.length === 0 ? (
        <p className="p-6 text-center text-sm text-mute">Nothing has happened yet.</p>
      ) : (
        <ol className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-live="polite" aria-label="Activity feed">
          {events.map((e) =>
            e.type === 'tool_call' ? (
              <li key={e.id} className="flex items-start gap-2 rounded-md bg-bg/60 px-2 py-1 font-mono text-2xs text-mute">
                <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-accent-ink/80" aria-hidden />
                <span className="min-w-0 break-words"><span className="text-ink/70">{e.actor.split(' ')[0]}</span> {e.message}</span>
              </li>
            ) : (
              <li key={e.id} className="rounded-md px-2 py-1.5 text-xs">
                <div className="flex justify-between gap-2 text-2xs text-mute">
                  <span className="truncate">{e.actor}</span>
                  <time dateTime={e.createdAt} className="shrink-0">{timeAgo(e.createdAt)}</time>
                </div>
                <p className={`mt-0.5 break-words ${e.type === 'leader_action' ? 'text-emerald-300' : /FAILED|failed/.test(e.message) ? 'text-rose-300' : ''}`}>{e.message}</p>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}

const KIND_ICON = { code: FileCode2, test: FlaskConical, report: CheckCircle2, doc: FileText, note: StickyNote } as const;

function Deliverables({ s }: { s: ProjectSnapshot }) {
  const runs = new Map(s.runs.map((r) => [r.id, r]));
  const latest = [...new Map(s.artifacts.map((a) => [a.path, a])).values()].reverse();
  return (
    <section className="card" aria-labelledby="deliverables-h">
      <h2 id="deliverables-h" className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium">
        <FileCode2 className="h-4 w-4 text-mute" aria-hidden /> Deliverables
        <span className="ml-auto text-xs font-normal text-mute">{latest.length} file{latest.length === 1 ? '' : 's'}</span>
      </h2>
      {latest.length === 0 ? (
        <p className="p-6 text-center text-sm text-mute">Files your teammates write will appear here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {latest.map((a) => {
            const run = runs.get(a.runId);
            const Icon = KIND_ICON[a.kind];
            return (
              <li key={a.id}>
                <Link to={`/artifacts/${a.id}`} className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-surface-2" data-artifact={a.path}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-ink">{a.path}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-2xs text-mute">
                      <span>{a.kind} · {(a.size / 1024).toFixed(1)} KB</span>
                      {run && <span>· {ROLE_META[run.role].short} #{run.attempt} {run.status}</span>}
                      {run && <ProviderBadge provider={run.provider} />}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

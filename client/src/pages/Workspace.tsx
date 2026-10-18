import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  Activity, AlertTriangle, BookOpen, CheckCircle2, FileCode2, FileText, FlaskConical, ListTodo, Loader2, Lock, Play,
  RotateCcw, Send, Settings2, Sparkles, StickyNote, Terminal, Users,
} from 'lucide-react';
import { api } from '../api';
import { timeAgo, useAsync } from '../hooks';
import { AsyncState, ErrorNote, ProviderBadge, ROLE_META, RoleChip, StatusBadge } from '../components/ui';
import {
  TASK_STATUSES, type ActivityEvent, type AgentRole, type Artifact, type CommandResponse, type ProjectSnapshot, type Task,
} from '../../../shared/types';

const DEMO = 'Build a room availability interface, implement booking validation, test edge cases, and document the result.';
const ROLE_TITLES: Record<AgentRole, string> = {
  frontend: 'Frontend Engineer', backend: 'Backend Engineer', aiml: 'AI/ML Engineer', qa: 'QA Engineer', researcher: 'Researcher', docs: 'Documentation Writer',
};

const isActive = (s?: ProjectSnapshot) => !!s && (s.busy || s.tasks.some((t) => t.status === 'QUEUED' || t.status === 'IN_PROGRESS'));

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
          <Link to={`/projects/${id}/context`} className="btn-secondary btn-sm"><BookOpen className="h-3.5 w-3.5" aria-hidden /> Context</Link>
          <Link to={`/projects/${id}/agents`} className="btn-secondary btn-sm"><Settings2 className="h-3.5 w-3.5" aria-hidden /> Edit team</Link>
        </div>
      </div>

      <CommandBar projectId={id} hasAgents={s.agents.length > 0} onSent={snap.reload} />

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 lg:hidden" role="tablist" aria-label="Workspace sections">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-surface-2 text-ink' : 'text-mute'}`}>
            <t.icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)_320px]">
        <aside className={show('team')}><Roster s={s} /></aside>
        <section className={`min-w-0 ${show('board')}`}><Board s={s} onChange={snap.reload} /></section>
        <aside className={`min-w-0 ${show('activity')}`}><Feed events={s.activity} /></aside>
      </div>
      <div className={`mt-4 ${show('files')}`}><Deliverables s={s} /></div>
    </div>
  );
}

function CommandBar({ projectId, hasAgents, onSent }: { projectId: string; hasAgents: boolean; onSent: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<CommandResponse | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.command(projectId, text);
      setLast(r);
      setText('');
      onSent();
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
          disabled={busy}
        />
        <button type="submit" className="btn-primary sm:w-40" disabled={busy || !text.trim() || !hasAgents}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send to team
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mute">
        {!text && hasAgents && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setText(DEMO)}><Sparkles className="h-3 w-3" aria-hidden /> Use demo command</button>
        )}
        {!hasAgents && <Link to={`/projects/${projectId}/agents`} className="text-accent-ink underline">Pick your teammates</Link>}
        <span className="hidden sm:inline">Ctrl/⌘ + Enter to send</span>
      </div>
      <ErrorNote error={error} />
      {last && (
        <div className="mt-2 rounded-lg border border-line bg-bg p-3 text-sm" role="status" data-testid="planner-note">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-mute">
            <Sparkles className="h-3.5 w-3.5 text-violet" aria-hidden /> Planner
            <ProviderBadge provider={last.plannerProvider} />
            <span>· {last.tasks.length} task{last.tasks.length === 1 ? '' : 's'}</span>
          </div>
          <p>{last.plannerNote}</p>
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
            const Icon = ROLE_META[a.role].icon;
            return (
              <li key={a.id} className="px-4 py-3" data-agent={a.role}>
                <div className="flex items-center gap-2">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border ${ROLE_META[a.role].cls}`}><Icon className="h-3.5 w-3.5" aria-hidden /></span>
                  <span className="truncate text-sm font-medium">{ROLE_TITLES[a.role]}</span>
                </div>
                <p className="mt-1.5 text-xs">
                  {working ? (
                    <span className="flex items-center gap-1.5 text-indigo-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" aria-hidden /> Working on “{working.title}”</span>
                  ) : (
                    <span className="text-mute">{queued ? `Idle · ${queued} queued` : 'Idle'}</span>
                  )}
                </p>
                {blocked > 0 && <p className="mt-0.5 text-xs text-amber-300">{blocked} blocked</p>}
              </li>
            );
          })}
        </ul>
      </AsyncState>
      {missing.length > 0 && (
        <div className="border-t border-line px-4 py-3 text-xs">
          <p className="mb-1.5 flex items-center gap-1 text-amber-300"><Lock className="h-3 w-3" aria-hidden /> Tasks waiting for:</p>
          {missing.map((r) => <p key={r} className="text-mute">{ROLE_TITLES[r]}</p>)}
          <Link to={`/projects/${s.project.id}/agents`} className="mt-2 inline-block text-accent-ink underline">Add to team</Link>
        </div>
      )}
    </div>
  );
}

function Board({ s, onChange }: { s: ProjectSnapshot; onChange: () => void }) {
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
      onChange();
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
                  {tasks.map((t) => <TaskCard key={t.id} t={t} artifacts={artifactsByTask.get(t.id) ?? []} act={act} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskCard({ t, artifacts, act }: { t: Task; artifacts: Artifact[]; act: (fn: () => Promise<unknown>) => void }) {
  const [open, setOpen] = useState(false);
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
      </div>
      <h3 className="mt-1.5 text-sm font-medium leading-snug">{t.title}</h3>
      {t.status === 'IN_PROGRESS' && <p className="mt-1 flex items-center gap-1.5 text-xs text-indigo-300"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Working…</p>}
      {t.status === 'BLOCKED' && t.blockedReason && <p className="mt-1 flex items-start gap-1 text-xs text-amber-300"><Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{t.blockedReason}</p>}
      {t.status === 'FAILED' && t.lastError && <p className="mt-1 line-clamp-3 text-xs text-rose-300" title={t.lastError}>{t.lastError}</p>}
      {(t.status === 'REVIEW' || t.status === 'COMPLETED') && t.summary && <p className="mt-1 line-clamp-3 text-xs text-mute">{t.summary}</p>}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {t.status === 'REVIEW' && (
          <button className="btn-sm btn border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" onClick={() => act(() => api.patchTask(t.id, { status: 'COMPLETED' }))}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Approve
          </button>
        )}
        {t.status === 'BLOCKED' && (
          <button className="btn-sm btn border border-amber-500/40 text-amber-300 hover:bg-amber-500/10" onClick={() => act(() => api.patchTask(t.id, { status: 'QUEUED' }))}>
            <Play className="h-3.5 w-3.5" aria-hidden /> Unblock
          </button>
        )}
        {t.status === 'FAILED' && (
          <button className="btn-sm btn border border-rose-500/40 text-rose-300 hover:bg-rose-500/10" onClick={() => act(() => api.retry(t.id))}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
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
            <li key={a.id}><Link to={`/artifacts/${a.id}`} className="block truncate font-mono text-2xs text-accent-ink hover:underline">{a.path}</Link></li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Feed({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="card flex max-h-[70vh] flex-col lg:sticky lg:top-20">
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
    <section aria-labelledby="deliverables-h">
      <h2 id="deliverables-h" className="mb-2 flex items-center gap-2 text-sm font-medium"><FileCode2 className="h-4 w-4 text-mute" aria-hidden /> Deliverables <span className="text-xs font-normal text-mute">{latest.length} file{latest.length === 1 ? '' : 's'}</span></h2>
      {latest.length === 0 ? (
        <div className="card p-6 text-center text-sm text-mute">Files your teammates write will appear here.</div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {latest.map((a) => {
            const run = runs.get(a.runId);
            const Icon = KIND_ICON[a.kind];
            return (
              <li key={a.id}>
                <Link to={`/artifacts/${a.id}`} className="card flex items-start gap-3 p-3 transition hover:border-accent/50" data-artifact={a.path}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{a.path}</p>
                    <p className="mt-0.5 text-2xs text-mute">
                      {a.kind} · {(a.size / 1024).toFixed(1)} KB{run ? ` · ${ROLE_META[run.role].short} run ${run.status}` : ''}
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

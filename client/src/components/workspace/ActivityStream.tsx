import { useState } from 'react';
import { Link } from 'react-router';
import { Activity, ArrowRightLeft, FileCode2, Flag, Inbox, ListTodo, Terminal, UserCheck } from 'lucide-react';
import { clock } from '../../hooks';
import { StatusBadge } from '../ui';
import { TASK_STATUSES, type ActivityEvent, type ActivityType, type TaskStatus } from '../../../../shared/types';

type Filter = 'all' | 'tasks' | 'tools' | 'handoffs' | 'decisions' | 'files';

const GROUP: Record<ActivityType, Exclude<Filter, 'all'> | null> = {
  project_created: null, agents_updated: null, command_received: 'tasks', plan_created: 'tasks', task_created: 'tasks',
  task_status: 'tasks', run_started: 'tasks', run_finished: 'tasks', 'run.status': 'tasks', tool_call: 'tools',
  artifact_created: 'files', decision_added: 'decisions', leader_action: 'decisions', 'decision.requested': 'decisions',
  'decision.resolved': 'decisions', 'agent.handoff': 'handoffs', system: null,
};

const ICON: Partial<Record<ActivityType, typeof Activity>> = {
  tool_call: Terminal, artifact_created: FileCode2, 'agent.handoff': ArrowRightLeft, 'decision.requested': Inbox,
  'decision.resolved': UserCheck, leader_action: UserCheck, 'run.status': Flag, command_received: ListTodo, plan_created: ListTodo,
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'tasks', label: 'Tasks' }, { key: 'tools', label: 'Tools' },
  { key: 'handoffs', label: 'Handoffs' }, { key: 'decisions', label: 'Decisions' }, { key: 'files', label: 'Files' },
];

const isStatus = (v: unknown): v is TaskStatus => typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v);

/** Timestamped stream of persisted activity events, newest first, with real filters. */
export function ActivityStream({ events }: { events: ActivityEvent[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const shown = filter === 'all' ? events : events.filter((e) => GROUP[e.type] === filter);
  return (
    <section className="card flex max-h-[70vh] flex-col" aria-labelledby="stream-h">
      <div className="panel-head">
        <Activity className="h-4 w-4 text-mute" aria-hidden />
        <h2 id="stream-h" className="text-sm font-medium">Activity</h2>
        <span className="ml-auto font-mono text-2xs text-mute">{shown.length} event{shown.length === 1 ? '' : 's'}</span>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-line-soft px-3 py-2" role="group" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
            className={`min-h-8 rounded px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.1em] max-sm:min-h-10 ${filter === f.key ? 'bg-surface-2 text-ink ring-1 ring-line' : 'text-mute hover:text-ink'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="p-6 text-center text-sm text-mute">{events.length === 0 ? 'Nothing has happened yet.' : 'No events of this type yet.'}</p>
      ) : (
        <ol className="flex-1 overflow-y-auto py-1" aria-label="Activity events">
          {shown.map((e) => {
            const Icon = ICON[e.type] ?? Activity;
            const to = e.data?.to;
            const artifactId = e.type === 'artifact_created' ? (e.data?.artifactId as string | undefined) : undefined;
            const tone = e.type === 'decision.requested' ? 'text-amber-300' : e.type === 'leader_action' || e.type === 'decision.resolved' ? 'text-emerald-300'
              : e.type === 'agent.handoff' ? 'text-accent-ink' : /FAILED|failed/.test(e.message) ? 'text-rose-300' : 'text-ink';
            return (
              <li key={e.id} className={`grid grid-cols-[auto_1fr] gap-x-2.5 px-3 py-1.5 ${e.type === 'tool_call' ? 'opacity-90' : ''}`} data-activity-type={e.type}>
                <Icon className={`mt-0.5 h-3.5 w-3.5 ${e.type === 'tool_call' ? 'text-mute' : tone}`} aria-hidden />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-2xs text-mute">
                    <time dateTime={e.createdAt}>{clock(e.createdAt)}</time>
                    <span className="truncate">{e.actor}</span>
                    {e.type === 'task_status' && isStatus(to) && <span className="ml-auto shrink-0"><StatusBadge status={to} /></span>}
                  </div>
                  {artifactId ? (
                    <Link to={`/artifacts/${artifactId}`} className="mt-0.5 block break-words font-mono text-xs text-accent-ink hover:underline">{e.message}</Link>
                  ) : (
                    <p className={`mt-0.5 break-words ${e.type === 'tool_call' ? 'font-mono text-2xs text-mute' : `text-xs ${tone}`}`}>{e.message}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

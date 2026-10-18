import { Link } from 'react-router';
import { Lock, Users } from 'lucide-react';
import { AsyncState, ProviderBadge, ROLE_META, StatusBadge } from '../ui';
import { ROLE_TITLES } from './roles';
import type { ProjectSnapshot } from '../../../../shared/types';

export function TeamRoster({ s }: { s: ProjectSnapshot }) {
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

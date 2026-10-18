import { Link } from 'react-router';
import { Activity, FolderKanban, Plus } from 'lucide-react';
import { api } from '../api';
import { timeAgo, useAsync } from '../hooks';
import { AsyncState, RoleChip, StatusBadge } from '../components/ui';
import { TASK_STATUSES } from '../../../shared/types';

export default function Dashboard() {
  const projects = useAsync(() => api.projects(), [], 6000);
  const activity = useAsync(() => api.recentActivity(), [], 6000);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link to="/projects/new" className="btn-primary ml-auto"><Plus className="h-4 w-4" aria-hidden /> New project</Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="projects-h">
          <h2 id="projects-h" className="mb-3 flex items-center gap-2 text-sm font-medium text-mute"><FolderKanban className="h-4 w-4" aria-hidden /> Projects</h2>
          <AsyncState loading={projects.loading} error={projects.error} onRetry={projects.reload} empty={projects.data?.length === 0}
            emptyText={<span>No projects yet. <Link className="text-accent underline" to="/projects/new">Create your first one</Link>.</span>}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {projects.data?.map((p) => (
                <li key={p.id}>
                  <Link to={p.agents?.length ? `/projects/${p.id}` : `/projects/${p.id}/agents`} className="card block p-4 transition hover:border-accent/50">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{p.name}</h3>
                      <span className="text-xs text-mute">{timeAgo(p.createdAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-mute">{p.goal || 'No goal set'}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.agents?.length ? p.agents.map((a) => <RoleChip key={a.id} role={a.role} />) : <span className="text-xs text-amber-300">No teammates yet</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {TASK_STATUSES.filter((s) => p.taskCounts?.[s]).map((s) => (
                        <span key={s} className="inline-flex items-center gap-1"><StatusBadge status={s} /><span className="text-xs text-mute">{p.taskCounts![s]}</span></span>
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </AsyncState>
        </section>
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-3 flex items-center gap-2 text-sm font-medium text-mute"><Activity className="h-4 w-4" aria-hidden /> Recent activity</h2>
          <div className="card">
            <AsyncState loading={activity.loading} error={activity.error} onRetry={activity.reload} empty={activity.data?.length === 0} emptyText="No activity yet.">
              <ul className="divide-y divide-line">
                {activity.data?.map((e) => (
                  <li key={e.id} className="px-4 py-2.5 text-sm">
                    <div className="flex justify-between gap-2 text-xs text-mute"><span className="truncate">{e.projectName} · {e.actor}</span><span className="shrink-0">{timeAgo(e.createdAt)}</span></div>
                    <p className="mt-0.5 break-words">{e.message}</p>
                  </li>
                ))}
              </ul>
            </AsyncState>
          </div>
        </section>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Activity, FileCode2, ListTodo, Network, Users } from 'lucide-react';
import { api } from '../api';
import { useAsync } from '../hooks';
import { AsyncState } from '../components/ui';
import { RunControls, commandLockReason } from '../components/RunPanels';
import { OpsBar } from '../components/workspace/OpsBar';
import { NeedsYou } from '../components/workspace/NeedsYou';
import { CommandSurface } from '../components/workspace/CommandSurface';
import { MissionMap } from '../components/workspace/MissionMap';
import { TeamRoster } from '../components/workspace/TeamRoster';
import { TaskBoard } from '../components/workspace/TaskBoard';
import { ActivityStream } from '../components/workspace/ActivityStream';
import { Deliverables } from '../components/workspace/Deliverables';
import { Announcer } from '../components/Announcer';
import type { ProjectSnapshot } from '../../../shared/types';

const isActive = (s?: ProjectSnapshot) => !!s && (s.busy || s.run?.status === 'RUNNING' || s.tasks.some((t) => t.status === 'IN_PROGRESS'));
const pollFor = (s?: ProjectSnapshot) => (isActive(s) ? 1500 : 6000);

type Tab = 'board' | 'map' | 'team' | 'activity' | 'files';

/** The operations room: command → plan → run, with agents, tasks, activity and deliverables around it. */
export default function Workspace() {
  const { id = '' } = useParams();
  const snap = useAsync(() => api.snapshot(id), [id], pollFor);
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
    { key: 'map', label: 'Map', icon: Network },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'activity', label: 'Activity', icon: Activity },
    { key: 'files', label: 'Files', icon: FileCode2 },
  ];
  const show = (t: Tab) => (tab === t ? 'block' : 'hidden lg:block');
  const run = s.run;
  const latest = s.commands[0];

  return (
    <div className="mx-auto max-w-[1560px] px-4 py-5">
      <Announcer s={s} />
      <OpsBar s={s} loadedAt={snap.loadedAt} error={snap.error} pollMs={pollFor(s)} />

      <div className="mt-4 space-y-4">
        <NeedsYou s={s} onChange={snap.reload} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <CommandSurface projectId={id} lock={commandLockReason(run)} hasAgents={s.agents.length > 0} onSent={snap.reload}
            latest={latest} taskCount={latest ? s.tasks.filter((t) => t.commandId === latest.id).length : 0} commandCount={s.commands.length} />
          {run && run.status !== 'AWAITING_APPROVAL' && (
            <section className={`card border-l-4 p-4 ${run.status === 'RUNNING' ? 'border-l-indigo-400' : run.status === 'PAUSED' ? 'border-l-violet-400' : 'border-l-line'}`} aria-labelledby="run-h" data-testid="run-panel">
              <div className="mb-2 flex items-center gap-2">
                <h2 id="run-h" className="kicker">{run.status === 'RUNNING' ? 'Executing run' : run.status === 'PAUSED' ? 'Paused run' : 'Last run'}</h2>
                <Link to={`/projects/${id}/supervise`} className="ml-auto inline-flex min-h-10 items-center text-xs text-accent-ink hover:underline sm:min-h-0">Supervise →</Link>
              </div>
              <RunControls s={s} onChange={snap.reload} />
            </section>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 lg:hidden" role="tablist" aria-label="Workspace sections">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-surface-2 text-ink' : 'text-mute'}`}>
            <t.icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
          </button>
        ))}
      </div>

      <div className={`mt-4 ${show('map')}`}><MissionMap s={s} /></div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_340px]">
        <aside className={show('team')}><TeamRoster s={s} /></aside>
        <section className={`min-w-0 ${show('board')}`}><TaskBoard s={s} onChange={snap.reload} /></section>
        <aside className="min-w-0 space-y-4">
          <div className={show('activity')}><ActivityStream events={s.activity} /></div>
          <div className={show('files')}><Deliverables s={s} /></div>
        </aside>
      </div>
    </div>
  );
}

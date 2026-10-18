import { Link } from 'react-router';
import { CheckCircle2, FileCode2, FileText, FlaskConical, StickyNote } from 'lucide-react';
import { api } from '../../api';
import { useAsync } from '../../hooks';
import type { Artifact } from '../../../../shared/types';

const ICON = { code: FileCode2, test: FlaskConical, report: CheckCircle2, doc: FileText, note: StickyNote } as const;

/** The project's files (latest version per path), for switching between deliverables. */
export function FileNav({ projectId, currentPath }: { projectId: string; currentPath: string }) {
  const list = useAsync(() => api.artifacts(projectId), [projectId]);
  const latest = [...new Map((list.data ?? []).map((a: Artifact) => [a.path, a])).values()].sort((a, b) => a.path.localeCompare(b.path));
  return (
    <nav className="card" aria-label="Project files">
      <p className="panel-head kicker">Files</p>
      {list.loading ? <p className="p-3 text-xs text-mute">Loading…</p>
        : list.error ? <p className="p-3 text-xs text-rose-300">{list.error.message}</p>
        : (
          <ul className="py-1">
            {latest.map((a) => {
              const Icon = ICON[a.kind];
              const here = a.path === currentPath;
              return (
                <li key={a.id}>
                  <Link to={`/artifacts/${a.id}`} aria-current={here ? 'page' : undefined}
                    className={`flex min-h-9 items-center gap-2 px-3 py-1.5 font-mono text-2xs max-sm:min-h-10 ${here ? 'bg-surface-2 text-ink' : 'text-mute hover:bg-surface-2 hover:text-ink'}`}>
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{a.path}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </nav>
  );
}

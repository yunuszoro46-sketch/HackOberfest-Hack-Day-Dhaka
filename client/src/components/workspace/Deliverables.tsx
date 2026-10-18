import { Link } from 'react-router';
import { CheckCircle2, FileCode2, FileText, FlaskConical, StickyNote } from 'lucide-react';
import { ProviderBadge, ROLE_META } from '../ui';
import type { ProjectSnapshot } from '../../../../shared/types';

const KIND_ICON = { code: FileCode2, test: FlaskConical, report: CheckCircle2, doc: FileText, note: StickyNote } as const;

export function Deliverables({ s }: { s: ProjectSnapshot }) {
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

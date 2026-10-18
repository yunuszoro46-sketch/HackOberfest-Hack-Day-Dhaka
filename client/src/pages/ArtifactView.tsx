import { Link, useParams } from 'react-router';
import { ArrowLeft, FileCode2 } from 'lucide-react';
import { api } from '../api';
import { timeAgo, useAsync } from '../hooks';
import { AsyncState, ProviderBadge, RoleChip, StatusBadge } from '../components/ui';
import { parseQa } from '../components/artifact/qa';
import { QaInspector } from '../components/artifact/QaInspector';
import { FileNav } from '../components/artifact/FileNav';

/** Artifact inspector: file list, provenance, QA summary (for reports) and the stored file with line numbers. */
export default function ArtifactView() {
  const { id = '' } = useParams();
  const a = useAsync(() => api.artifact(id), [id]);
  const d = a.data;
  const lines = d?.content.split('\n') ?? [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const qa = d && d.kind === 'report' ? parseQa(d.content) : null;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <AsyncState loading={a.loading} error={a.error} onRetry={a.reload}>
        {d && (
          <>
            <Link to={`/projects/${d.projectId}`} className="btn-ghost btn-sm -ml-2 mb-3"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to workspace</Link>
            <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="hidden lg:block"><FileNav projectId={d.projectId} currentPath={d.path} /></div>
              <div className="min-w-0">
                <header className="card mb-4 p-4">
                  <p className="kicker">Artifact</p>
                  <h1 className="mt-1 flex items-center gap-2 break-all font-mono text-xl"><FileCode2 className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden />{d.path}</h1>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="kicker">Kind · size</dt><dd className="mt-0.5">{d.kind} · {d.size.toLocaleString()} bytes · {lines.length} lines</dd></div>
                    <div><dt className="kicker">Produced by</dt><dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {d.run ? <><RoleChip role={d.run.role} /> attempt {d.run.attempt} <ProviderBadge provider={d.run.provider} /></> : 'unknown'}
                    </dd></div>
                    <div><dt className="kicker">Run status</dt><dd className="mt-0.5">{d.run ? <span className={d.run.status === 'succeeded' ? 'text-emerald-300' : d.run.status === 'failed' ? 'text-rose-300' : 'text-indigo-300'}>{d.run.status}{d.run.error ? ` — ${d.run.error}` : ''}</span> : '—'}</dd></div>
                    <div><dt className="kicker">Task</dt><dd className="mt-0.5 flex flex-wrap items-center gap-1.5">{d.task ? <><span className="truncate">{d.task.title}</span><StatusBadge status={d.task.status} /></> : '—'}</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-mute">Saved {timeAgo(d.createdAt)} · served from the database copy</p>
                </header>

                {qa && <QaInspector qa={qa} />}

                <section className="card overflow-hidden" aria-label="File content">
                  <p className="panel-head kicker">{qa ? 'Full report' : 'Content'}</p>
                  <pre className="max-h-[70vh] overflow-auto p-0 font-mono text-xs leading-relaxed" data-testid="artifact-content" tabIndex={0}>
                    <code className="block min-w-max py-3">
                      {lines.map((l, i) => (
                        <span key={i} className="flex hover:bg-surface-2/60">
                          <span className="w-12 shrink-0 select-none pr-4 text-right text-mute/70" aria-hidden>{i + 1}</span>
                          <span className="whitespace-pre pr-4">{l || ' '}</span>
                        </span>
                      ))}
                    </code>
                  </pre>
                </section>
                <div className="mt-4 lg:hidden"><FileNav projectId={d.projectId} currentPath={d.path} /></div>
              </div>
            </div>
          </>
        )}
      </AsyncState>
    </div>
  );
}

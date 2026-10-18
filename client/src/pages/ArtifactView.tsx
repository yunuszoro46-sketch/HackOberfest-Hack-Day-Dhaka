import { Link, useParams } from 'react-router';
import { ArrowLeft, FileCode2 } from 'lucide-react';
import { api } from '../api';
import { timeAgo, useAsync } from '../hooks';
import { AsyncState, ProviderBadge, RoleChip, StatusBadge } from '../components/ui';

export default function ArtifactView() {
  const { id = '' } = useParams();
  const a = useAsync(() => api.artifact(id), [id]);
  const d = a.data;
  const lines = d?.content.split('\n') ?? [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AsyncState loading={a.loading} error={a.error} onRetry={a.reload}>
        {d && (
          <>
            <Link to={`/projects/${d.projectId}`} className="btn-ghost btn-sm -ml-2 mb-3"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to workspace</Link>
            <div className="card mb-4 p-4">
              <h1 className="flex items-center gap-2 break-all font-mono text-lg"><FileCode2 className="h-5 w-5 shrink-0 text-accent" aria-hidden />{d.path}</h1>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-xs text-mute">Kind · size</dt><dd>{d.kind} · {d.size.toLocaleString()} bytes</dd></div>
                <div><dt className="text-xs text-mute">Produced by</dt><dd className="flex flex-wrap items-center gap-1.5">
                  {d.run ? <><RoleChip role={d.run.role} /> attempt {d.run.attempt} <ProviderBadge provider={d.run.provider} /></> : 'unknown'}
                </dd></div>
                <div><dt className="text-xs text-mute">Run status</dt><dd>{d.run ? <span className={d.run.status === 'succeeded' ? 'text-emerald-300' : d.run.status === 'failed' ? 'text-rose-300' : 'text-indigo-300'}>{d.run.status}</span> : '—'}</dd></div>
                <div><dt className="text-xs text-mute">Task</dt><dd className="flex flex-wrap items-center gap-1.5">{d.task ? <><span className="truncate">{d.task.title}</span><StatusBadge status={d.task.status} /></> : '—'}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-mute">Saved {timeAgo(d.createdAt)} · served from the database copy</p>
            </div>
            <div className="card overflow-hidden">
              <pre className="max-h-[70vh] overflow-auto p-0 text-[12.5px] leading-relaxed" data-testid="artifact-content">
                <code className="block min-w-max py-3">
                  {lines.map((l, i) => (
                    <span key={i} className="flex">
                      <span className="w-12 shrink-0 select-none pr-4 text-right text-mute/50" aria-hidden>{i + 1}</span>
                      <span className="whitespace-pre pr-4">{l || ' '}</span>
                    </span>
                  ))}
                </code>
              </pre>
            </div>
          </>
        )}
      </AsyncState>
    </div>
  );
}

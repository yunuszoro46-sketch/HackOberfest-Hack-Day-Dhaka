import { Link, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileCode2 } from 'lucide-react';
import { api } from '../api';
import { timeAgo, useAsync } from '../hooks';
import { AsyncState, ProviderBadge, RoleChip, StatusBadge } from '../components/ui';

/** Pulls the verdict and test counts out of a QA report. Only shows what the report itself says. */
function parseQa(content: string) {
  const verdict = /\*\*Verdict: (PASS|FAIL)\*\*(?: \((\d+)\/(\d+) checks passed\))?/.exec(content);
  if (!verdict) return null;
  const runTests = content.split('### run-tests')[1] ?? '';
  const num = (re: RegExp) => { const m = re.exec(runTests); return m ? Number(m[1]) : null; };
  return {
    verdict: verdict[1] as 'PASS' | 'FAIL',
    checksPassed: verdict[2] ? Number(verdict[2]) : null,
    checksTotal: verdict[3] ? Number(verdict[3]) : null,
    testsPassed: num(/^# pass (\d+)/m),
    testsFailed: num(/^# fail (\d+)/m),
    exit: /^exit (\S+)/m.exec(runTests)?.[1] ?? null,
    command: /^\$ (.+)$/m.exec(runTests)?.[1] ?? null,
  };
}

export default function ArtifactView() {
  const { id = '' } = useParams();
  const a = useAsync(() => api.artifact(id), [id]);
  const d = a.data;
  const lines = d?.content.split('\n') ?? [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const qa = d && d.kind === 'report' ? parseQa(d.content) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AsyncState loading={a.loading} error={a.error} onRetry={a.reload}>
        {d && (
          <>
            <Link to={`/projects/${d.projectId}`} className="btn-ghost btn-sm -ml-2 mb-3"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to workspace</Link>
            <div className="card mb-4 p-4">
              <h1 className="flex items-center gap-2 break-all font-mono text-xl"><FileCode2 className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden />{d.path}</h1>
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
            {qa && (
              <section aria-label="QA summary" data-testid="qa-summary"
                className={`card mb-4 grid gap-4 p-4 sm:grid-cols-4 ${qa.verdict === 'PASS' ? 'border-emerald-500/40' : 'border-rose-500/40'}`}>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-mute">Verdict</p>
                  <p className={`mt-1 flex items-center gap-1.5 text-xl font-semibold ${qa.verdict === 'PASS' ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {qa.verdict === 'PASS' ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <AlertTriangle className="h-5 w-5" aria-hidden />} {qa.verdict}
                  </p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-mute">Checks</p>
                  <p className="mt-1 text-xl font-semibold">{qa.checksPassed ?? '?'} / {qa.checksTotal ?? '?'} <span className="text-xs font-normal text-mute">passed</span></p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wide text-mute">Test suite</p>
                  <p className="mt-1 text-xl font-semibold">
                    {qa.testsPassed === null ? <span className="text-sm font-normal text-mute">not run</span> : <>{qa.testsPassed} <span className="text-xs font-normal text-mute">passed</span> · {qa.testsFailed} <span className="text-xs font-normal text-mute">failed</span></>}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-2xs uppercase tracking-wide text-mute">Exit code</p>
                  <p className="mt-1 text-xl font-semibold">{qa.exit ?? '—'}</p>
                  {qa.command && <p className="truncate font-mono text-2xs text-mute" title={qa.command}>$ {qa.command}</p>}
                </div>
              </section>
            )}
            <div className="card overflow-hidden">
              <pre className="max-h-[70vh] overflow-auto p-0 text-xs leading-relaxed" data-testid="artifact-content">
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

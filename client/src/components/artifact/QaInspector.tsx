import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { QaSummary } from './qa';

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-line-soft bg-bg/60 p-3">
      <p className="kicker">{label}</p>
      <div className="mt-1 text-xl font-semibold">{children}</div>
    </div>
  );
}

/** QA verdict, counts, exit code, per-check results and raw command output (failed checks open by default). */
export function QaInspector({ qa }: { qa: QaSummary }) {
  const pass = qa.verdict === 'PASS';
  return (
    <section aria-label="QA summary" data-testid="qa-summary" className={`card mb-4 p-4 ${pass ? 'border-emerald-500/40' : 'border-rose-500/50'}`}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Verdict">
          <span className={`flex items-center gap-1.5 ${pass ? 'text-emerald-300' : 'text-rose-300'}`}>
            {pass ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <AlertTriangle className="h-5 w-5" aria-hidden />} {qa.verdict}
          </span>
        </Tile>
        <Tile label="Checks">{qa.checksPassed ?? '?'} / {qa.checksTotal ?? '?'} <span className="text-xs font-normal text-mute">passed</span></Tile>
        <Tile label="Test suite">
          {qa.testsPassed === null ? <span className="text-sm font-normal text-mute">not run</span>
            : <>{qa.testsPassed} <span className="text-xs font-normal text-mute">passed</span> · <span className={qa.testsFailed ? 'text-rose-300' : ''}>{qa.testsFailed}</span> <span className="text-xs font-normal text-mute">failed</span></>}
        </Tile>
        <Tile label="Exit code">
          <span className={qa.exit === '0' ? '' : qa.exit ? 'text-rose-300' : ''}>{qa.exit ?? '—'}</span>
          {qa.command && <p className="truncate font-mono text-2xs font-normal text-mute" title={qa.command}>$ {qa.command}</p>}
        </Tile>
      </div>

      {qa.checks.length > 0 && (
        <div className="mt-4">
          <h2 className="kicker mb-2">Checks</h2>
          <ul className="divide-y divide-line-soft rounded-md border border-line-soft" data-testid="qa-checks">
            {qa.checks.map((c) => (
              <li key={c.name}>
                <details open={!c.passed} className="group">
                  <summary className="flex min-h-10 list-none items-start gap-2 px-3 py-2 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                    {c.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden />}
                    <span className="sr-only">{c.passed ? 'Passed:' : 'Failed:'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-all font-mono text-xs text-ink">{c.name}</span>
                      <span className={`block text-xs ${c.passed ? 'text-mute' : 'text-rose-300'}`}>{c.detail}</span>
                    </span>
                    {c.output && <span className="shrink-0 font-mono text-2xs text-mute group-open:hidden">show output</span>}
                    {c.output && <span className="hidden shrink-0 font-mono text-2xs text-mute group-open:inline">hide output</span>}
                  </summary>
                  {c.output && (
                    <pre className="mx-3 mb-3 max-h-80 overflow-auto rounded border border-line-soft bg-bg p-3 font-mono text-2xs leading-relaxed text-ink/90">{c.output}</pre>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

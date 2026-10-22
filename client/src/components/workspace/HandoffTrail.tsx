import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleHelp, GitPullRequestArrow, UserCheck, XCircle } from 'lucide-react';
import { ProviderBadge, RoleChip } from '../ui';
import type { ActivityEvent, AgentRole, ProjectSnapshot } from '../../../../shared/types';

interface HandoffData {
  fromTaskId?: string;
  toTaskId?: string;
  fromRole?: AgentRole;
  toRole?: AgentRole;
  paths?: string[];
  provider?: string;
  checks?: string[];
  unknowns?: string[];
  summary?: string;
  handoff?: 'work' | 'failure';
  note?: string | null;
  runId?: string;
}

const passed = (c: string) => /\bexit 0\b|: PASS\b/.test(c) && !/: FAIL\b/.test(c);

/**
 * The supervision trail of the latest run: every handoff with what was passed on, what the sender actually
 * checked, and what is still unknown, interleaved with failures and the leader's decisions. Built from the
 * recorded activity, so it shows only what happened.
 */
export function HandoffTrail({ s, compact = false }: { s: ProjectSnapshot; compact?: boolean }) {
  const run = s.run;
  if (!run || run.status === 'AWAITING_APPROVAL') return null;
  const tasks = new Map(s.tasks.map((t) => [t.id, t]));
  const inRun = (e: ActivityEvent) => {
    const d = (e.data ?? {}) as HandoffData;
    return d.runId === run.id || (e.taskId ? tasks.get(e.taskId)?.runId === run.id : false);
  };
  const events = (s.trail ?? []).filter(inRun);
  const latestArtifact = new Map(s.artifacts.map((a) => [a.path, a.id]));
  const handoffs = events.filter((e) => e.type === 'agent.handoff');
  const failures = handoffs.filter((e) => (e.data as HandoffData | null)?.handoff === 'failure').length;

  return (
    <section className="card" aria-labelledby="trail-h" data-testid="handoff-trail">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <GitPullRequestArrow className="h-4 w-4 text-accent-ink" aria-hidden />
        <h2 id="trail-h" className="text-sm font-medium">Handoffs &amp; recovery</h2>
        <span className="font-mono text-2xs text-mute">{handoffs.length} handoff{handoffs.length === 1 ? '' : 's'}{failures ? ` · ${failures} sent back after QA` : ''}</span>
        {!compact && <p className="w-full text-xs text-mute">What each teammate passed on, what they actually checked before passing it, what they could not resolve, and what you decided.</p>}
      </div>
      {events.length === 0 ? (
        <p className="p-4 text-sm text-mute">Handoffs appear here as teammates finish: the files passed on, the checks that ran, and open questions.</p>
      ) : (
        <ol className="space-y-2 p-3">
          {events.map((e) => {
            const d = (e.data ?? {}) as HandoffData;
            if (e.type === 'decision.requested') {
              return (
                <li key={e.id} className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-200" data-trail="failure">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span><strong className="font-medium">Run paused.</strong> {e.message}</span>
                </li>
              );
            }
            if (e.type === 'decision.resolved') {
              return (
                <li key={e.id} className="flex items-start gap-2 rounded-md border border-indigo-500/30 bg-indigo-500/[0.06] px-3 py-2 text-xs text-indigo-200" data-trail="decision">
                  <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span><strong className="font-medium">You:</strong> {e.message}</span>
                </li>
              );
            }
            const failure = d.handoff === 'failure';
            const from = d.fromRole ?? (d.fromTaskId ? tasks.get(d.fromTaskId)?.role : undefined);
            const to = d.toRole ?? (d.toTaskId ? tasks.get(d.toTaskId)?.role : undefined);
            const toTask = d.toTaskId ? tasks.get(d.toTaskId) : undefined;
            return (
              <li key={e.id} className={`rounded-md border px-3 py-2.5 ${failure ? 'border-rose-500/40' : 'border-line-soft'} bg-bg`} data-trail={failure ? 'sent-back' : 'handoff'}>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {from && <RoleChip role={from} />}
                  <ArrowRight className="h-3 w-3 text-mute" aria-hidden />
                  {to && <RoleChip role={to} />}
                  <span className="min-w-0 truncate text-mute">{failure ? 'failure report' : 'handoff'}{toTask ? ` → “${toTask.title}”` : ''}</span>
                  {d.provider && <span className="ml-auto"><ProviderBadge provider={d.provider} /></span>}
                </div>
                {d.summary && <p className="mt-1.5 text-xs text-ink">{d.summary}</p>}
                {d.note && <p className="mt-1 text-xs text-indigo-200">Your note: {d.note}</p>}
                {!compact && (
                  <dl className="mt-2 grid gap-2 text-2xs sm:grid-cols-3">
                    <div>
                      <dt className="kicker">Passed on</dt>
                      <dd className="mt-0.5 space-y-0.5">
                        {(d.paths ?? []).length ? d.paths!.map((p) => (
                          <div key={p} className="truncate font-mono">
                            {latestArtifact.has(p) ? <Link className="text-accent-ink hover:underline" to={`/artifacts/${latestArtifact.get(p)}`}>{p}</Link> : p}
                          </div>
                        )) : <span className="text-mute">no files</span>}
                      </dd>
                    </div>
                    <div>
                      <dt className="kicker">Checked before handoff</dt>
                      <dd className="mt-0.5 space-y-0.5">
                        {d.checks === undefined ? <span className="text-mute">not recorded</span>
                          : d.checks.length === 0 ? <span className="text-amber-300">{failure ? 'see QA report' : 'nothing was run'}</span>
                          : d.checks.map((c) => (
                            <div key={c} className={`flex items-start gap-1 ${passed(c) ? 'text-lime-300' : 'text-rose-300'}`}>
                              {passed(c) ? <CheckCircle2 className="mt-px h-3 w-3 shrink-0" aria-hidden /> : <XCircle className="mt-px h-3 w-3 shrink-0" aria-hidden />}
                              <span className="break-all font-mono">{c}</span>
                            </div>
                          ))}
                      </dd>
                    </div>
                    <div>
                      <dt className="kicker">Still unknown</dt>
                      <dd className="mt-0.5 space-y-0.5">
                        {d.unknowns?.length ? d.unknowns.map((u) => (
                          <div key={u} className="flex items-start gap-1 text-amber-200"><CircleHelp className="mt-px h-3 w-3 shrink-0" aria-hidden />{u}</div>
                        )) : <span className="text-mute">{d.unknowns === undefined ? 'not recorded' : 'nothing flagged'}</span>}
                      </dd>
                    </div>
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

import { Inbox } from 'lucide-react';
import { DecisionCard, PlanApproval } from '../RunPanels';
import type { ProjectSnapshot } from '../../../../shared/types';

/**
 * Human decision inbox: everything that is waiting on the leader, in one place at the top.
 * Implemented decision types: plan approval (approve/discard) and task-failure decisions (retry/skip).
 * In-app only; there are no push notifications.
 */
export function NeedsYou({ s, onChange }: { s: ProjectSnapshot; onChange: () => Promise<void> }) {
  const plan = s.run?.status === 'AWAITING_APPROVAL' ? 1 : 0;
  const total = plan + s.pendingDecisions.length;
  if (total === 0) return null;
  return (
    <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.04] p-3 sm:p-4" aria-labelledby="needs-h" data-testid="decision-inbox">
      <h2 id="needs-h" className="flex flex-wrap items-center gap-2 text-sm font-medium text-amber-300">
        <Inbox className="h-4 w-4" aria-hidden /> Needs you
        <span className="font-mono text-2xs uppercase tracking-[0.12em] text-amber-200/80">
          {[plan ? '1 plan to approve' : null, s.pendingDecisions.length ? `${s.pendingDecisions.length} failure decision${s.pendingDecisions.length === 1 ? '' : 's'} — run paused` : null].filter(Boolean).join(' · ')}
        </span>
      </h2>
      <PlanApproval s={s} onChange={onChange} />
      {s.pendingDecisions.map((d) => <DecisionCard key={d.id} d={d} title={s.tasks.find((t) => t.id === d.taskId)?.title} onChange={onChange} />)}
    </section>
  );
}

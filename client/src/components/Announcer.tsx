import { useEffect, useRef, useState } from 'react';
import type { ProjectSnapshot } from '../../../shared/types';

/**
 * One polite live region per page that announces meaningful changes only:
 * the run's status, and how many decisions are waiting. Ticking clocks and counters stay silent.
 */
export function Announcer({ s }: { s: ProjectSnapshot | undefined }) {
  const runStatus = s?.run?.status ?? null;
  const waiting = (s?.pendingDecisions.length ?? 0) + (runStatus === 'AWAITING_APPROVAL' ? 1 : 0);
  const [message, setMessage] = useState('');
  const prev = useRef<{ runStatus: string | null; waiting: number } | null>(null);

  useEffect(() => {
    if (!s) return;
    const before = prev.current;
    prev.current = { runStatus, waiting };
    if (!before) return; // don't announce the initial state on page load
    const runChanged = before.runStatus !== runStatus && !!runStatus;
    const waitingChanged = waiting !== before.waiting;
    if (!runChanged && !waitingChanged) return;
    const parts: string[] = [];
    if (runChanged) parts.push(`Run ${runStatus!.replace('_', ' ').toLowerCase()}.`);
    // Always state what is waiting, so a plan approval replaced by a failure decision is not missed.
    if (waiting) parts.push(`${waiting} item${waiting === 1 ? ' needs' : 's need'} your decision.`);
    else if (waitingChanged) parts.push('Nothing needs your decision.');
    setMessage(parts.join(' '));
  }, [s, runStatus, waiting]);

  return <p className="sr-only" role="status" aria-live="polite" data-testid="announcer">{message}</p>;
}

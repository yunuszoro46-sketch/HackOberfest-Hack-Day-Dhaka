import { useEffect, useState } from 'react';
import { api } from '../../api';
import {
  DEFAULT_REVIEW_AGENTS,
  REVIEW_AGENTS,
  REVIEW_AGENT_IDS,
  type PlanReview,
  type PlanSpec,
  type ReviewAgentId,
  type ReviewVerdict,
} from '../../../../shared/plan-review';
import { HexagonPrimitive } from './HexagonIdentity';
import { ProvenanceBadge } from './ProvenanceBadge';
import { SevenSegmentDisplay } from './SevenSegment';
import { CustomizeToggle, editField } from './EditableList';

export const VERDICT_STYLE: Record<ReviewVerdict, { label: string; cls: string; lcd: 'resolved' | 'amber' | 'alert' }> = {
  'approval-ready': { label: 'APPROVAL-READY', cls: 'border-[var(--ok)] text-[var(--ok)] bg-[var(--ok)]/10', lcd: 'resolved' },
  'needs-changes': { label: 'NEEDS CHANGES', cls: 'border-[var(--brand)] text-[var(--brand)] bg-[var(--brand)]/10', lcd: 'amber' },
  'not-ready': { label: 'NOT READY', cls: 'border-[var(--alert)] text-[var(--alert)] bg-[var(--alert)]/10', lcd: 'alert' },
};

const primary =
  'min-h-[48px] px-6 py-2.5 bg-[var(--brand)] text-[#101010] font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-[var(--brand)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_var(--amber-glow)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]';
const secondary =
  'min-h-[44px] px-4 py-2 border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--text-dim)] hover:bg-[var(--glass)] active:scale-[0.98] text-xs font-mono uppercase text-[var(--text-dim)] hover:text-[var(--text)] rounded-lg transition-all duration-150 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]';
const card = 'rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6';
const h3 = 'text-xs font-mono uppercase font-bold tracking-wider';

/**
 * Step 5: a few agents try to break the plan, list pros and cons, score how solid it is and say whether it is
 * ready for the human to approve. The leader picks the agents and can point them at a concern.
 */
export function CouncilStep({
  spec, review, stale, onReview, onEditPlan, onContinue,
}: {
  spec: PlanSpec;
  review: PlanReview | null;
  /** The plan changed after this review was run. */
  stale: boolean;
  onReview: (r: PlanReview, specKey: string) => void;
  onEditPlan: () => void;
  onContinue: () => void;
}) {
  const [agents, setAgents] = useState<ReviewAgentId[]>(review?.agents ?? [...DEFAULT_REVIEW_AGENTS]);
  const [focus, setFocus] = useState(review?.focus ?? '');
  const [models, setModels] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(!review);
  const running = review?.status === 'RUNNING';

  useEffect(() => {
    api.llmStatus().then((s) => setModels(s.providers.filter((p) => p.configured).map((p) => `${p.id}:${p.model}`))).catch(() => setModels([]));
  }, []);

  // Poll while the council is deliberating.
  useEffect(() => {
    if (!review || review.status !== 'RUNNING') return;
    const t = setInterval(() => {
      api.planReview(review.id).then((r) => onReview(r, '')).catch((e) => setError((e as Error).message));
    }, 1200);
    return () => clearInterval(t);
  }, [review?.id, review?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const convene = async () => {
    setError(null);
    try {
      const r = await api.startPlanReview({ spec, agents, focus: focus.trim() || null });
      onReview(r, JSON.stringify(spec));
      setSetupOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = (id: ReviewAgentId) => setAgents((a) => (a.includes(id) ? a.filter((x) => x !== id) : REVIEW_AGENT_IDS.filter((x) => x === id || a.includes(x))));
  const res = review?.result;
  const turnFor = (a: ReviewAgentId | 'chair') => review?.turns.find((t) => t.agent === a);

  return (
    <section aria-labelledby="step-council-title" className="space-y-6" data-testid="council-step">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <span className="text-xs font-mono uppercase text-[var(--text-dim)]">STEP 05</span>
          <h1 id="step-council-title" className="text-2xl sm:text-3xl font-bold text-[var(--text)] mt-1">Council Review: Try to Break It</h1>
          <p className="text-sm text-[var(--text-dim)] mt-2 max-w-[80ch] leading-6">
            A few agents attack your plan from different angles, list its pros and cons, and score how solid it is. The chair says whether it is ready for your approval. You still hold the key.
          </p>
        </div>
        {review && !running && <CustomizeToggle open={setupOpen} onToggle={() => setSetupOpen((o) => !o)} label="Change council" />}
      </div>

      {stale && review && !running && (
        <p role="status" className="rounded-lg border border-[var(--brand)]/50 bg-[var(--brand)]/10 px-4 py-3 text-xs font-mono text-[var(--brand)]">
          The plan changed after this review. Re-run the council so the verdict matches what you will approve.
        </p>
      )}

      {(setupOpen || !review) && !running && (
        <div className={card} data-testid="council-setup">
          <h2 className={`${h3} text-[var(--text)] mb-1`}>Who sits on the council</h2>
          <p className="text-xs text-[var(--text-dim)] mb-4">Pick the agents. A chair always weighs their opinions at the end.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REVIEW_AGENT_IDS.map((id) => {
              const on = agents.includes(id);
              return (
                <button key={id} type="button" aria-pressed={on} onClick={() => toggle(id)} data-agent={id}
                  className={`text-left rounded-lg border p-3.5 transition-all active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${on ? 'border-[var(--brand)] bg-[var(--glass)]' : 'border-[var(--line)] bg-[var(--panel)] opacity-70 hover:opacity-100'}`}>
                  <div className="flex items-center gap-2">
                    <HexagonPrimitive size={24} active={on} completed={on}>{on ? '✓' : ''}</HexagonPrimitive>
                    <span className="text-sm font-semibold text-[var(--text)]">{REVIEW_AGENTS[id].title}</span>
                  </div>
                  <p className="text-xs text-[var(--text-dim)] mt-1.5 leading-5">{REVIEW_AGENTS[id].brief}</p>
                </button>
              );
            })}
          </div>
          <label htmlFor="council-focus" className="block text-xs font-mono uppercase text-[var(--text-dim)] mt-5 mb-1">Ask the council to look hard at (optional)</label>
          <textarea id="council-focus" rows={2} maxLength={500} className={editField} value={focus} onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. Will booking survive two people clicking at the same time? Is this different enough from the university portal?" />
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs font-mono text-[var(--text-dim)]" data-testid="council-estimate">
              {models === null ? 'Checking model providers…'
                : models.length ? `${agents.length} agent${agents.length === 1 ? '' : 's'} + chair = up to ${agents.length + 1} model calls via ${models.join(' → ')}`
                : 'No model provider configured: the council runs labelled rule-based checks instead.'}
            </p>
            <button type="button" className={primary} disabled={agents.length === 0} onClick={convene}>
              {review ? 'Re-run council →' : 'Convene council →'}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs font-mono text-[var(--alert)]">{error}</p>}

      {running && review && (
        <div className={card} aria-live="polite" data-testid="council-running">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className={`${h3} text-[var(--brand)]`}>The council is deliberating…</h2>
            <button type="button" className={secondary} onClick={() => api.cancelPlanReview(review.id).then((r) => onReview(r, '')).catch((e) => setError((e as Error).message))}>Cancel</button>
          </div>
          <ol className="space-y-2">
            {[...review.agents, 'chair' as const].map((a) => {
              const t = turnFor(a);
              return (
                <li key={a} className="flex items-center gap-3 text-xs font-mono">
                  <span className={`w-20 shrink-0 ${t?.status === 'ok' ? 'text-[var(--ok)]' : t ? 'text-[var(--alert)]' : 'text-[var(--text-dim)] lcd-skeleton rounded px-1'}`}>
                    {t ? (t.status === 'ok' ? 'DONE' : t.status.toUpperCase()) : 'WAITING'}
                  </span>
                  <span className="text-[var(--text)]">{a === 'chair' ? 'Chair' : REVIEW_AGENTS[a].title}</span>
                  {t?.provider && <span className="text-[var(--text-dim)]">{t.provider}:{t.model}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {review?.status === 'CANCELLED' && <p className="text-xs font-mono text-[var(--text-dim)]">Review cancelled. Change the council and run it again.</p>}
      {review?.status === 'FAILED' && <p role="alert" className="text-xs font-mono text-[var(--alert)]">The review failed: {review.error}</p>}

      {res && review && (
        <div className="space-y-4" data-testid="council-result" data-verdict={res.verdict}>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2 max-w-[80ch]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono uppercase text-[var(--text-dim)]">Council verdict:</span>
                <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase border ${VERDICT_STYLE[res.verdict].cls}`} data-testid="council-verdict">{VERDICT_STYLE[res.verdict].label}</span>
                {res.method === 'council'
                  ? <ProvenanceBadge type="model" modelName={[...new Set(review.turns.filter((t) => t.provider).map((t) => `${t.provider}:${t.model}`))].join(', ')} />
                  : <ProvenanceBadge type="rule-based" detail="Heuristic checks on the plan; no model was used" />}
              </div>
              <p className="text-sm sm:text-base text-[var(--text)] leading-6">{res.summary}</p>
              {res.notes.map((n) => <p key={n} className="text-xs font-mono text-[var(--text-dim)]">{n}</p>)}
            </div>
            <div className="shrink-0 flex flex-col items-center sm:items-end">
              <span className="text-xs font-mono uppercase text-[var(--text-dim)] mb-1">Solidity</span>
              <div className="lcd-display p-3 rounded-xl border border-[var(--line)]">
                <SevenSegmentDisplay value={String(res.solidity).padStart(2, '0')} size="lg" color={VERDICT_STYLE[res.verdict].lcd} label={`Solidity ${res.solidity} out of 100`} />
              </div>
              <span className="text-xs font-mono text-[var(--text-dim)] mt-1">out of 100</span>
            </div>
          </div>

          {(res.blockers.length > 0 || res.requiredChanges.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`${card} border-[var(--alert)]/40`}>
                <h3 className={`${h3} text-[var(--alert)] mb-3`}>Blockers before approval</h3>
                {res.blockers.length ? (
                  <ul className="space-y-2 text-xs sm:text-sm text-[var(--text)]">{res.blockers.map((b) => <li key={b} className="flex gap-2"><span className="text-[var(--alert)]" aria-hidden>✕</span>{b}</li>)}</ul>
                ) : <p className="text-xs font-mono text-[var(--text-dim)]">No blockers.</p>}
              </div>
              <div className={card}>
                <h3 className={`${h3} text-[var(--brand)] mb-3`}>Changes the council asks for</h3>
                <ol className="space-y-2 text-xs sm:text-sm text-[var(--text)] list-decimal pl-4">{res.requiredChanges.map((c) => <li key={c}>{c}</li>)}</ol>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`${card} border-[var(--ok)]/30`}>
              <h3 className={`${h3} text-[var(--ok)] mb-3`}>Pros</h3>
              <ul className="space-y-2 text-xs sm:text-sm text-[var(--text)]">{res.pros.map((p) => <li key={p} className="flex gap-2"><span className="text-[var(--ok)]" aria-hidden>+</span>{p}</li>)}</ul>
              {res.pros.length === 0 && <p className="text-xs font-mono text-[var(--text-dim)]">None named.</p>}
            </div>
            <div className={`${card} border-[var(--alert)]/30`}>
              <h3 className={`${h3} text-[var(--alert)] mb-3`}>Cons</h3>
              <ul className="space-y-2 text-xs sm:text-sm text-[var(--text)]">{res.cons.map((c) => <li key={c} className="flex gap-2"><span className="text-[var(--alert)]" aria-hidden>−</span>{c}</li>)}</ul>
              {res.cons.length === 0 && <p className="text-xs font-mono text-[var(--text-dim)]">None named.</p>}
            </div>
          </div>

          <div className={card}>
            <h3 className={`${h3} text-[var(--text)] mb-1`}>Attempts to break it</h3>
            <p className="text-xs text-[var(--text-dim)] mb-4">Each attack, how serious it is, and whether the plan as written already survives it.</p>
            <ul className="space-y-3" data-testid="break-attempts">
              {res.breakAttempts.map((b, i) => (
                <li key={i} className={`rounded-lg border p-3.5 bg-[var(--glass)] ${b.holds ? 'border-[var(--line)]' : b.severity === 'high' ? 'border-[var(--alert)]/60' : 'border-[var(--brand)]/40'}`} data-holds={b.holds}>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className={`font-bold ${b.holds ? 'text-[var(--ok)]' : 'text-[var(--alert)]'}`}>{b.holds ? '✓ HOLDS' : '✕ BREAKS'}</span>
                    <span className={`px-1.5 rounded border ${b.severity === 'high' ? 'border-[var(--alert)] text-[var(--alert)]' : b.severity === 'medium' ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--line)] text-[var(--text-dim)]'}`}>{b.severity.toUpperCase()}</span>
                    <span className="text-[var(--text-dim)]">{REVIEW_AGENTS[b.agent].title}</span>
                  </div>
                  <p className="text-sm text-[var(--text)] mt-1.5">{b.attack}</p>
                  <p className="text-xs text-[var(--text-dim)] mt-1">{b.holds ? 'Why it holds / keep it that way: ' : 'Fix: '}{b.mitigation}</p>
                </li>
              ))}
              {res.breakAttempts.length === 0 && <li className="text-xs font-mono text-[var(--text-dim)]">No attacks recorded.</li>}
            </ul>
          </div>

          <div className={card}>
            <h3 className={`${h3} text-[var(--text)] mb-3`}>Where each agent stands</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {review.agents.map((a) => {
                const t = turnFor(a);
                return (
                  <li key={a} className="rounded-lg border border-[var(--line)] bg-[var(--glass)] p-3 text-xs font-mono">
                    <div className="text-[var(--text)] font-semibold">{REVIEW_AGENTS[a].title}</div>
                    {t?.output ? (
                      <div className="mt-1 text-[var(--text-dim)]">
                        <span className={t.output.stance === 'support' ? 'text-[var(--ok)]' : t.output.stance === 'oppose' ? 'text-[var(--alert)]' : 'text-[var(--brand)]'}>{t.output.stance.toUpperCase()}</span>
                        {' · '}solidity {t.output.solidity} · {t.provider}:{t.model}
                      </div>
                    ) : (
                      <div className="mt-1 text-[var(--text-dim)]">{t ? `${t.status} (${t.reason ?? 'no reason'})` : 'no turn'}{res.method === 'rule-based' ? ' · rule-based checks used' : ''}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--line)]">
        <button type="button" className={secondary} onClick={onEditPlan}>← Edit plan</button>
        <button type="button" className={primary} disabled={running} onClick={onContinue}>
          {res ? 'Continue to approval →' : 'Skip council, go to approval →'}
        </button>
      </div>
    </section>
  );
}

import { Bot, Sparkles } from 'lucide-react';

const REASONS = ['AUTH', 'RATE_LIMIT', 'TIMEOUT', 'BAD_JSON', 'SCHEMA', 'MODEL_NOT_FOUND', 'NETWORK', 'UPSTREAM'] as const;

export type PlannerInfo =
  | { kind: 'gemma'; model: string | null }
  | { kind: 'fallback'; reason: string }
  | { kind: 'rules' };

/** Reads the stored plannerProvider. Only allow-listed reason codes are ever displayed. */
export function plannerInfo(provider: string): PlannerInfo {
  if (provider.startsWith('gemma:')) return { kind: 'gemma', model: provider.slice('gemma:'.length) || null };
  if (provider === 'gemma') return { kind: 'gemma', model: null };
  if (provider.startsWith('rules (fallback')) {
    const code = /\b([A-Z_]{4,})\)\s*$/.exec(provider)?.[1];
    return { kind: 'fallback', reason: code && (REASONS as readonly string[]).includes(code) ? code : 'error' };
  }
  return { kind: 'rules' };
}

/** One honest line: who planned this. Never names a model when the rules made the plan. */
export function PlannerLine({ provider, className = '' }: { provider: string; className?: string }) {
  const info = plannerInfo(provider);
  const text = info.kind === 'gemma' ? `Planned by Gemma${info.model ? ` (${info.model})` : ''}`
    : info.kind === 'fallback' ? `Rule-based plan — Gemma unavailable: ${info.reason}`
    : 'Rule-based plan (provider: mock)';
  const Icon = info.kind === 'gemma' ? Sparkles : Bot;
  const tone = info.kind === 'gemma' ? 'border-violet-500/40 text-violet-200' : info.kind === 'fallback' ? 'border-amber-500/40 text-amber-200' : 'border-line text-mute';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-2xs font-medium ${tone} ${className}`} data-testid="planner-line" data-planner={info.kind}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />{text}
    </span>
  );
}

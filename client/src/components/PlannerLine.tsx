import { Bot, Sparkles } from 'lucide-react';

const REASONS = ['AUTH', 'RATE_LIMIT', 'QUOTA', 'BUDGET', 'TIMEOUT', 'BAD_JSON', 'SCHEMA', 'MODEL_NOT_FOUND', 'NETWORK', 'UPSTREAM', 'NOT_CONFIGURED'] as const;

export type PlannerInfo =
  | { kind: 'model'; name: string; model: string | null }
  | { kind: 'fallback'; reason: string }
  | { kind: 'rules' };

/** Reads the stored plannerProvider ("gemma:<model>", "<provider>:<model>", "rules", "rules (fallback: … CODE)"). Only allow-listed reason codes are ever displayed. */
export function plannerInfo(provider: string): PlannerInfo {
  if (provider.startsWith('rules (fallback')) {
    const code = /\b([A-Z_]{4,})\)\s*$/.exec(provider)?.[1];
    return { kind: 'fallback', reason: code && (REASONS as readonly string[]).includes(code) ? code : 'error' };
  }
  if (provider === 'gemma') return { kind: 'model', name: 'Gemma', model: null };
  const at = provider.indexOf(':');
  if (at > 0 && !provider.startsWith('rules')) {
    const name = provider.slice(0, at);
    return { kind: 'model', name: name === 'gemma' ? 'Gemma' : name.charAt(0).toUpperCase() + name.slice(1), model: provider.slice(at + 1) || null };
  }
  return { kind: 'rules' };
}

/** One honest line: who planned this. Never names a model when the rules made the plan. */
export function PlannerLine({ provider, className = '' }: { provider: string; className?: string }) {
  const info = plannerInfo(provider);
  const text = info.kind === 'model' ? `Planned by ${info.name}${info.model ? ` (${info.model})` : ''}`
    : info.kind === 'fallback' ? `Rule-based plan — model planner unavailable: ${info.reason}`
    : 'Rule-based plan (provider: mock)';
  const Icon = info.kind === 'model' ? Sparkles : Bot;
  const tone = info.kind === 'model' ? 'border-violet-500/40 text-violet-200' : info.kind === 'fallback' ? 'border-amber-500/40 text-amber-200' : 'border-line text-mute';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-2xs font-medium ${tone} ${className}`} data-testid="planner-line" data-planner={info.kind}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />{text}
    </span>
  );
}

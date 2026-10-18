import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { api } from '../../api';
import { timeAgo } from '../../hooks';
import { ErrorNote, ProviderBadge } from '../ui';
import type { Command } from '../../../../shared/types';

export const DEMO = 'Build a room availability interface, implement booking validation, test edge cases, and document the result.';

export function CommandSurface({ projectId, lock, hasAgents, onSent, latest, taskCount, commandCount }: {
  projectId: string; lock: string | null; hasAgents: boolean; onSent: () => Promise<void>; latest?: Command; taskCount: number; commandCount: number;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.command(projectId, text);
      setText('');
      await onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card relative overflow-hidden border-accent/50 p-4" aria-label="Command the team">
      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-ink/70 to-transparent" />
      <div className="mb-2 flex items-baseline gap-3">
        <p className="kicker text-accent-ink">Command</p>
        <label htmlFor="command" className="text-sm font-medium">Command for your team</label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          id="command"
          className="input min-h-[76px] flex-1 resize-y bg-bg/80 text-[0.9375rem] leading-6"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e); }}
          placeholder={hasAgents ? 'Tell your team what to do… e.g. "' + DEMO + '"' : 'Add teammates first, then give a command.'}
          disabled={busy || !!lock}
        />
        <button type="submit" className="btn-primary sm:w-40" disabled={busy || !text.trim() || !hasAgents || !!lock}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send to team
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mute">
        {lock && <span className="text-amber-300" data-testid="command-lock">{lock}</span>}
        {!text && hasAgents && !lock && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setText(DEMO)}><Sparkles className="h-3 w-3" aria-hidden /> Use demo command</button>
        )}
        {!hasAgents && <Link to={`/projects/${projectId}/agents`} className="text-accent-ink underline">Pick your teammates</Link>}
        <span className="hidden sm:inline">Ctrl/⌘ + Enter to send</span>
      </div>
      <ErrorNote error={error} />
      {latest && (
        <div className="mt-3 rounded-md border border-line-soft bg-bg/60 p-3" role="status" data-testid="planner-note">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-mute">
            <span className="kicker">Leader's last command</span>
            <span>· {timeAgo(latest.createdAt)}</span>
            {commandCount > 1 && <Link to={`/projects/${projectId}/context`} className="inline-flex min-h-10 items-center text-accent-ink hover:underline sm:min-h-0">all {commandCount} commands</Link>}
          </div>
          <p className="mt-1 text-sm text-ink">“{latest.text}”</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mute">
            <Sparkles className="h-3.5 w-3.5 text-accent-ink" aria-hidden /> Planned by
            <ProviderBadge provider={latest.plannerProvider} />
            <span>into {taskCount} task{taskCount === 1 ? '' : 's'}</span>
          </div>
          {latest.plannerNote && <p className="mt-1 text-xs text-mute">{latest.plannerNote}</p>}
        </div>
      )}
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Loader2, Plus, ScrollText, Target } from 'lucide-react';
import { api } from '../api';
import { timeAgo, useAsync } from '../hooks';
import { AsyncState, ErrorNote } from '../components/ui';
import { PlannerLine } from '../components/PlannerLine';

export default function Context() {
  const { id = '' } = useParams();
  const snap = useAsync(() => api.snapshot(id), [id]);
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('A decision needs a title.');
    setBusy(true);
    setError(null);
    try {
      await api.addDecision(id, { title, rationale });
      setTitle('');
      setRationale('');
      await snap.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const s = snap.data;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to={`/projects/${id}`} className="btn-ghost btn-sm -ml-2 mb-3"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to workspace</Link>
      <AsyncState loading={snap.loading} error={snap.error} onRetry={snap.reload}>
        {s && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5 lg:col-span-2">
              <h1 className="text-xl font-semibold">{s.project.name} — project context</h1>
              <p className="mt-1 text-sm text-mute">Every teammate reads this before working. The Documentation agent writes only from it.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-mute"><Target className="h-3.5 w-3.5" aria-hidden /> Goal</h2><p className="mt-1 whitespace-pre-wrap text-sm">{s.project.goal || '—'}</p></div>
                <div><h2 className="text-xs font-medium uppercase tracking-wide text-mute">Constraints</h2><p className="mt-1 whitespace-pre-wrap text-sm">{s.project.constraints || '—'}</p></div>
              </div>
            </section>

            <section className="card p-5" aria-labelledby="decisions-h">
              <h2 id="decisions-h" className="font-semibold">Decisions</h2>
              {s.decisions.length === 0 ? <p className="mt-2 text-sm text-mute">No decisions recorded yet.</p> : (
                <ul className="mt-3 space-y-3">
                  {s.decisions.map((d) => (
                    <li key={d.id} className="rounded-lg border border-line bg-bg p-3">
                      <p className="text-sm font-medium">{d.title}</p>
                      {d.rationale && <p className="mt-0.5 text-sm text-mute">{d.rationale}</p>}
                      <p className="mt-1 text-2xs text-mute">by {d.madeBy} · {timeAgo(d.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={add} className="mt-4 space-y-2 border-t border-line pt-4" noValidate>
                <label htmlFor="d-title" className="label">Record a decision</label>
                <input id="d-title" className="input" placeholder="e.g. Store bookings in local state" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
                <label htmlFor="d-why" className="sr-only">Rationale</label>
                <textarea id="d-why" className="input min-h-16" placeholder="Why? (optional)" value={rationale} onChange={(e) => setRationale(e.target.value)} maxLength={2000} />
                <ErrorNote error={error} />
                <button className="btn-secondary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Add decision</button>
              </form>
            </section>

            <section className="card p-5" aria-labelledby="commands-h">
              <h2 id="commands-h" className="flex items-center gap-2 font-semibold"><ScrollText className="h-4 w-4 text-mute" aria-hidden /> Command history</h2>
              {s.commands.length === 0 ? <p className="mt-2 text-sm text-mute">No commands yet.</p> : (
                <ul className="mt-3 space-y-3">
                  {s.commands.map((c) => (
                    <li key={c.id} className="rounded-lg border border-line bg-bg p-3">
                      <p className="text-sm">“{c.text}”</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-mute"><PlannerLine provider={c.plannerProvider} /> {timeAgo(c.createdAt)}</div>
                      {c.plannerNote && <p className="mt-1 text-xs text-mute">{c.plannerNote}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </AsyncState>
    </div>
  );
}

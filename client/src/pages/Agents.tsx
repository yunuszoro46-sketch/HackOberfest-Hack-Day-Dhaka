import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowRight, CheckCircle2, Loader2, Wrench } from 'lucide-react';
import { api } from '../api';
import { useAsync } from '../hooks';
import { AsyncState, ErrorNote, ROLE_META } from '../components/ui';
import type { AgentRole } from '../../../shared/types';

export default function Agents() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const data = useAsync(() => Promise.all([api.roles(), api.project(id)]), [id]);
  const [selected, setSelected] = useState<Set<AgentRole>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data.data) setSelected(new Set(data.data[1].agents.map((a) => a.role)));
  }, [data.data]);

  const toggle = (r: AgentRole) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(r)) n.delete(r); else n.add(r);
    return n;
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const order = data.data![0].map((r) => r.role);
      await api.setAgents(id, order.filter((r) => selected.has(r)));
      nav(`/projects/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-medium uppercase tracking-wider text-accent">Step 2 of 2</p>
      <h1 className="mt-1 text-2xl font-semibold">Build your team{data.data ? ` for ${data.data[1].name}` : ''}</h1>
      <p className="mt-1 text-sm text-mute">Choose who works on this project. Tasks for roles you don't pick are kept, but blocked until you add that teammate.</p>
      <AsyncState loading={data.loading} error={data.error} onRetry={data.reload}>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="AI teammates">
          {data.data?.[0].map((r) => {
            const on = selected.has(r.role);
            const Icon = ROLE_META[r.role].icon;
            return (
              <button
                key={r.role}
                type="button"
                aria-pressed={on}
                data-role={r.role}
                onClick={() => toggle(r.role)}
                className={`card relative p-5 text-left transition ${on ? 'border-accent ring-1 ring-accent/60' : 'hover:border-accent/40'}`}
              >
                {on && <CheckCircle2 className="absolute right-4 top-4 h-5 w-5 text-accent" aria-hidden />}
                <span className={`mb-3 grid h-10 w-10 place-items-center rounded-lg border ${ROLE_META[r.role].cls}`}><Icon className="h-5 w-5" aria-hidden /></span>
                <h2 className="font-semibold">{r.title}</h2>
                <p className="mt-0.5 text-sm text-mute">{r.tagline}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {r.responsibilities.map((x) => <li key={x} className="flex gap-2"><span className="text-accent" aria-hidden>•</span>{x}</li>)}
                </ul>
                <div className="mt-4 flex flex-wrap gap-1">
                  {r.tools.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-mute"><Wrench className="h-2.5 w-2.5" aria-hidden />{t}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-line bg-bg/90 py-4 backdrop-blur">
          <span className="text-sm text-mute">{selected.size} teammate{selected.size === 1 ? '' : 's'} selected</span>
          <ErrorNote error={error} />
          <button className="btn-primary ml-auto" disabled={selected.size === 0 || busy} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Continue to workspace <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </AsyncState>
    </div>
  );
}

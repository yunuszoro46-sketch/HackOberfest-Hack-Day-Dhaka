import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../api';
import { ErrorNote } from '../components/ui';

export default function CreateProject() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [constraints, setConstraints] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Give the project a name.');
    setBusy(true);
    setError(null);
    try {
      const p = await api.createProject({ name, goal, constraints });
      nav(`/projects/${p.id}/agents`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-xs font-medium uppercase tracking-wider text-accent-ink">Step 1 of 2</p>
      <h1 className="mt-1 text-2xl font-semibold">Create a project</h1>
      <p className="mt-1 text-sm text-mute">Your teammates read the goal and constraints before every task.</p>
      <form onSubmit={submit} className="card mt-6 space-y-5 p-5" noValidate>
        <div>
          <label htmlFor="name" className="label">Project name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="StudySpace" maxLength={100} required autoFocus />
        </div>
        <div>
          <label htmlFor="goal" className="label">Goal</label>
          <textarea id="goal" className="input min-h-20" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Book study rooms on campus" maxLength={2000} />
        </div>
        <div>
          <label htmlFor="constraints" className="label">Constraints</label>
          <textarea id="constraints" className="input min-h-20" value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="React + TypeScript, no external services" maxLength={2000} />
        </div>
        <ErrorNote error={error} />
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Continue to team <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}

import { Link } from 'react-router';
import { ArrowRight, FileCode2, Sparkles, Users } from 'lucide-react';

const STEPS = [
  { icon: Users, title: 'Build your team', body: 'Pick specialised AI teammates — frontend, backend, QA, docs and more.' },
  { icon: Sparkles, title: 'Give a command', body: 'Describe the work in plain language. TeamMate splits it into assigned tasks.' },
  { icon: FileCode2, title: 'Review real deliverables', body: 'Teammates write files and run real tests. You approve, retry or unblock.' },
];

export default function Landing() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-3xl rounded-full bg-accent/20 blur-3xl" />
      <section className="relative mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:pt-28">
        <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-mute">
          <Sparkles className="h-3.5 w-3.5 text-violet" aria-hidden /> Built for hackathon teams
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Don't just chat with AI.
          <br />
          <span className="bg-gradient-to-r from-accent to-violet bg-clip-text text-transparent">Build with AI teammates.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-mute sm:text-lg">
          TeamMate turns one command from the team leader into assigned tasks, real files and test results — with every step visible and every status under your control.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/projects/new" className="btn-primary px-5 py-2.5 text-base">
            Build Your Team <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/dashboard" className="btn-secondary px-5 py-2.5 text-base">Open dashboard</Link>
        </div>
      </section>
      <section className="relative mx-auto grid max-w-5xl gap-4 px-4 pb-24 sm:grid-cols-3" aria-label="How it works">
        {STEPS.map((s, i) => (
          <div key={s.title} className="card p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface-2">
                <s.icon className="h-4.5 w-4.5 text-accent-ink" aria-hidden />
              </span>
              <span className="text-xs font-medium text-mute">Step {i + 1}</span>
            </div>
            <h2 className="font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-mute">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

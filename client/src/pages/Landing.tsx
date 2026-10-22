import { Link } from 'react-router';
import { ArrowRight, GitPullRequestArrow, Lightbulb, ShieldCheck, Sparkles, Wrench } from 'lucide-react';

const STEPS = [
  { icon: ShieldCheck, title: 'Approve the plan', body: 'Your command becomes assigned tasks. Nothing runs until you approve them.' },
  { icon: GitPullRequestArrow, title: 'Watch the handoffs', body: 'Each teammate passes on its files, the checks it really ran, and what it could not resolve.' },
  { icon: Wrench, title: 'Decide on failures', body: 'When QA fails, you send it back with a note or skip it. The fix is re-verified by the same real tests.' },
];

const CONTRAST: [string, string][] = [
  ['One agent reports its own success', 'QA runs real commands; its verdict comes from exit codes, not a model'],
  ['You review a finished diff at the end', 'You approve the plan up front and decide every failure'],
  ['Context lives in one long chat', 'Structured handoffs: files, checks run, open questions'],
  ['Hard to tell what the model did', 'Every file is labelled: model, template, or deterministic'],
];

export default function Landing() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-3xl rounded-full bg-accent/20 blur-3xl" />
      <section className="relative mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:pt-28">
        <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-mute">
          <Sparkles className="h-3.5 w-3.5 text-violet" aria-hidden /> Supervised AI teammates
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Don't just chat with AI.
          <br />
          <span className="bg-gradient-to-r from-accent to-violet bg-clip-text text-transparent">Build with AI teammates.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-mute sm:text-lg">
          Coding agents work alone and report back. TeamMate gives you a small AI team you supervise: you approve the plan, see every handoff between teammates, and decide what happens when QA finds a bug.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/ideas" className="btn-primary px-5 py-2.5 text-base">
            Try IdeaMate <Lightbulb className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/projects/new" className="btn-primary px-5 py-2.5 text-base">
            Build Your Team <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/dashboard" className="btn-secondary px-5 py-2.5 text-base">Open dashboard</Link>
        </div>
      </section>
      <section className="relative mx-auto grid max-w-5xl gap-4 px-4 pb-12 sm:grid-cols-3" aria-label="How it works">
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
      <section className="relative mx-auto max-w-5xl px-4 pb-24" aria-labelledby="contrast-h">
        <h2 id="contrast-h" className="text-center text-lg font-semibold">Not another autonomous coding agent</h2>
        <div className="card mt-4 overflow-hidden">
          <div className="grid grid-cols-2 gap-4 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium text-mute">
            <span>Typical coding agent</span><span>TeamMate</span>
          </div>
          <ul className="divide-y divide-line">
            {CONTRAST.map(([them, us]) => (
              <li key={us} className="grid grid-cols-2 gap-4 px-4 py-3 text-sm">
                <span className="text-mute">{them}</span><span className="text-ink">{us}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

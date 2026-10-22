import { Link, NavLink, Outlet } from 'react-router';
import { Lightbulb, Users } from 'lucide-react';
import { ThemeSelector } from './ThemeSelector';

export default function Layout() {
  const nav = ({ isActive }: { isActive: boolean }) => `inline-flex min-h-10 items-center rounded-md px-2.5 py-1.5 text-sm sm:min-h-0 ${isActive ? 'bg-surface-2 text-ink font-semibold' : 'text-mute hover:text-ink'}`;
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex min-h-10 items-center gap-2 font-semibold tracking-tight text-ink">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)] text-[#101010] font-bold">
                <Users className="h-4 w-4" aria-hidden />
              </span>
              TeamMate
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 max-sm:w-full max-sm:justify-between">
            <nav className="flex items-center gap-1 max-sm:order-last max-sm:w-full max-sm:justify-between" aria-label="Main">
              <NavLink to="/" end className={nav}>Plan</NavLink>
              <NavLink to="/dashboard" className={nav}>Dashboard</NavLink>
              <NavLink to="/ideas" className={nav}><Lightbulb className="mr-1.5 h-4 w-4" aria-hidden />IdeaMate</NavLink>
              <NavLink to="/projects/new" className={nav}>New project</NavLink>
            </nav>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              title="Open Command Palette (Cmd+K / Ctrl+K)"
              className="hidden md:inline-flex min-h-8 items-center gap-1 px-2 py-1 text-2xs font-mono text-mute hover:text-ink rounded border border-line bg-surface-2 transition-all active:scale-[0.98]"
            >
              <span>⌘K</span>
            </button>
            <ThemeSelector compact />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

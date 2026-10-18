import { Link, NavLink, Outlet } from 'react-router';
import { Users } from 'lucide-react';

export default function Layout() {
  const nav = ({ isActive }: { isActive: boolean }) => `inline-flex min-h-10 items-center rounded-md px-2.5 py-1.5 text-sm sm:min-h-0 ${isActive ? 'bg-surface-2 text-ink' : 'text-mute hover:text-ink'}`;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="flex min-h-10 items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-violet">
              <Users className="h-4 w-4 text-white" aria-hidden />
            </span>
            TeamMate
          </Link>
          <nav className="ml-auto flex items-center gap-1" aria-label="Main">
            <NavLink to="/dashboard" className={nav}>Dashboard</NavLink>
            <NavLink to="/projects/new" className={nav}>New project</NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

import React from 'react';
import { useTheme } from '../hooks/useTheme';

interface ThemeSelectorProps {
  compact?: boolean;
  className?: string;
}

export function ThemeSelector({ compact = false, className = '' }: ThemeSelectorProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Appearance Mode"
      className={`inline-flex items-center gap-1 p-1 bg-[var(--panel)] border border-[var(--line)] rounded-lg shrink-0 ${className}`}
    >
      {/* Dark (Console Amber Hardware) */}
      <button
        type="button"
        onClick={() => setTheme('dark')}
        title="Switch to Dark Console Mode"
        aria-label="Switch to Dark Console Mode"
        aria-pressed={theme === 'dark'}
        className={`min-h-[36px] min-w-[36px] px-2.5 py-1 rounded text-xs font-mono flex items-center justify-center gap-1.5 transition-colors duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)] ${
          theme === 'dark'
            ? 'bg-[var(--glass)] text-[var(--brand)] font-bold shadow-sm border border-[var(--line)]'
            : 'text-[var(--text-dim)] hover:text-[var(--text)]'
        }`}
      >
        <svg
          className="w-3.5 h-3.5 fill-none stroke-current stroke-2 shrink-0"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        {!compact && <span className="hidden sm:inline">CONSOLE</span>}
      </button>

      {/* Dim (3 A.M. Low-Light Night Mode) */}
      <button
        type="button"
        onClick={() => setTheme('dim')}
        title="Switch to 3 a.m. Low-Light Dim Mode"
        aria-label="Switch to 3 a.m. Low-Light Dim Mode"
        aria-pressed={theme === 'dim'}
        className={`min-h-[36px] min-w-[36px] px-2.5 py-1 rounded text-xs font-mono flex items-center justify-center gap-1.5 transition-colors duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)] ${
          theme === 'dim'
            ? 'bg-[var(--glass)] text-[var(--brand)] font-bold shadow-sm border border-[var(--line)]'
            : 'text-[var(--text-dim)] hover:text-[var(--text)]'
        }`}
      >
        <svg
          className="w-3.5 h-3.5 fill-none stroke-current stroke-2 shrink-0"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {!compact && <span className="hidden sm:inline">DIM (3 A.M.)</span>}
      </button>
    </div>
  );
}

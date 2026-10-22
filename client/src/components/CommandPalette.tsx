import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Activity,
  HelpCircle,
  Lightbulb,
  Moon,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface CommandItem {
  id: string;
  category: 'Navigation' | 'Settings';
  title: string;
  description: string;
  shortcut?: string;
  icon: typeof Search;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const close = () => setOpen(false);

  const go = (to: string) => () => {
    navigate(to);
    close();
  };

  const commands: CommandItem[] = [
    { id: 'nav-plan', category: 'Navigation', title: 'Go to TeamMate Planner', description: 'System scoping, prompt studio, visual architecture & execution plan', shortcut: 'G P', icon: Users, action: go('/') },
    { id: 'nav-dash', category: 'Navigation', title: 'Go to Projects Dashboard', description: 'Supervised AI team projects: plans, runs, handoffs and QA', shortcut: 'G D', icon: Activity, action: go('/dashboard') },
    { id: 'nav-new', category: 'Navigation', title: 'Start a new team project', description: 'Set a goal, pick teammates, then approve their plan', shortcut: 'G N', icon: Plus, action: go('/projects/new') },
    { id: 'nav-ideas', category: 'Navigation', title: 'Go to Idea Council & IdeaMate', description: 'Approval-gated idea council, rubric scoring & GitHub/YouTube research', shortcut: 'G I', icon: Lightbulb, action: go('/ideas') },
    { id: 'nav-about', category: 'Navigation', title: 'How TeamMate works', description: 'Supervised AI teammates vs. a single autonomous coding agent', icon: HelpCircle, action: go('/teammate') },
    {
      id: 'toggle-theme',
      category: 'Settings',
      title: `Switch Theme to ${theme === 'dark' ? 'Dim Mode' : 'Console Dark'}`,
      description: 'Toggle between Console Dark (high contrast) and Dim (subdued night mode)',
      shortcut: 'T',
      icon: Moon,
      action: () => {
        setTheme(theme === 'dark' ? 'dim' : 'dark');
        close();
      },
    },
  ];

  const filtered = commands.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/75 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--panel-border)] bg-[var(--glass)]">
          <Search className="h-4 w-4 text-[var(--amber)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command, screen, or action... (e.g. plan, dashboard, ideas, theme)"
            className="flex-1 bg-transparent text-sm font-mono text-[var(--bone)] placeholder:text-[var(--bone-dim)] focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close command palette"
            className="min-h-[36px] min-w-[36px] grid place-items-center rounded text-[var(--bone-dim)] hover:text-[var(--bone)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-[var(--bone-dim)]">
              No matching commands found for "{query}".
            </div>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors font-mono ${
                    isSelected
                      ? 'bg-[var(--glass)] text-[var(--amber)] border border-[var(--amber)]/40 shadow-sm'
                      : 'text-[var(--bone)] border border-transparent hover:bg-[var(--glass)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-[var(--amber)]' : 'text-[var(--bone-dim)]'}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{item.title}</div>
                      <div className="text-[11px] text-[var(--bone-dim)] truncate">{item.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-[var(--bone-dim)] uppercase bg-[var(--panel)] px-1.5 py-0.5 rounded border border-[var(--panel-border)]">
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <kbd className="text-[10px] text-[var(--amber)] bg-black/40 px-1.5 py-0.5 rounded border border-[var(--amber)]/20 font-bold">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hotkeys Hint */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-[var(--panel-border)] bg-[var(--glass)] text-[11px] font-mono text-[var(--bone-dim)]">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 bg-black/30 rounded border border-[var(--panel-border)]">↑↓</kbd> navigate</span>
            <span><kbd className="px-1 bg-black/30 rounded border border-[var(--panel-border)]">↵</kbd> select</span>
            <span><kbd className="px-1 bg-black/30 rounded border border-[var(--panel-border)]">esc</kbd> close</span>
          </div>
          <span>TeamMate Console v1.2</span>
        </div>
      </div>
    </div>
  );
}

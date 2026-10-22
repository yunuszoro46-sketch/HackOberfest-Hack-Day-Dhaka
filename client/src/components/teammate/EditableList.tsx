import { useState, type FormEvent, type ReactNode } from 'react';

const field =
  'w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-3 py-2 text-xs font-mono text-[var(--text)] focus:border-[var(--brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]';
const smallBtn =
  'min-h-[36px] min-w-[36px] px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] text-xs font-mono uppercase text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--text-dim)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--focus)]';

export const editField = field;
export const editButton = smallBtn;

/** A list the leader can edit in place: change any line, remove it, or add a new one. */
export function EditableList({
  items, onChange, label, placeholder, marker, max = 20,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  /** Used for accessible names, e.g. "non-goal". */
  label: string;
  placeholder: string;
  marker?: ReactNode;
  max?: number;
}) {
  const [draft, setDraft] = useState('');
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || items.length >= max) return;
    onChange([...items, draft.trim()]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            {marker && <span className="shrink-0" aria-hidden="true">{marker}</span>}
            <input
              aria-label={`Edit ${label} ${i + 1}`}
              className={field}
              value={item}
              maxLength={300}
              onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))}
              onBlur={() => { if (!items[i].trim()) onChange(items.filter((_, k) => k !== i)); }}
            />
            <button type="button" className={smallBtn} aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}>✕</button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs font-mono text-[var(--text-dim)]">None yet.</li>}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input aria-label={`New ${label}`} className={field} value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
        <button type="submit" className={smallBtn} disabled={!draft.trim() || items.length >= max}>Add</button>
      </form>
    </div>
  );
}

/** "Customize" toggle used at the top of each step. */
export function CustomizeToggle({ open, onToggle, label = 'Customize' }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`min-h-[40px] px-3.5 py-2 rounded-lg border text-xs font-mono uppercase transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)] ${
        open ? 'border-[var(--info)] text-[var(--info)] bg-[var(--info)]/10' : 'border-[var(--line)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--text-dim)]'
      }`}
    >
      ✎ {open ? 'Done editing' : label}
    </button>
  );
}

import React, { useEffect, useRef } from 'react';

export type ProvenanceType =
  | 'model'
  | 'rule-based'
  | 'fallback'
  | 'template'
  | 'inferred'
  | 'source-verified'
  | 'ran';

interface ProvenanceBadgeProps {
  type: ProvenanceType;
  sourceUrl?: string;
  sourceLabel?: string;
  modelName?: string;
  detail?: string;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function ProvenanceBadge({
  type,
  sourceUrl,
  sourceLabel,
  modelName,
  detail,
  className = '',
  onClick,
  interactive = false,
}: ProvenanceBadgeProps) {
  const isInteractive = interactive || Boolean(onClick);

  const getBadgeContent = () => {
    switch (type) {
      case 'model':
        return {
          label: 'Model-generated',
          extra: modelName ? `(${modelName})` : undefined,
          icon: (
            <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 16 16" aria-hidden="true">
              <polygon points="8,1 15,8 8,15 1,8" />
            </svg>
          ),
          classes: 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]',
          title: detail || `Model-generated: directly produced by ${modelName || 'LLM'}`,
        };

      case 'rule-based':
      case 'fallback':
        return {
          label: type === 'fallback' ? 'Fallback' : 'Rule-based',
          icon: (
            <svg className="w-3 h-3 stroke-current fill-none stroke-2 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="2" width="12" height="12" rx="1" />
              <line x1="2" y1="14" x2="14" y2="2" />
            </svg>
          ),
          classes: 'border-[var(--line)] bg-[var(--panel)] text-[var(--text-dim)]',
          title: detail || 'Rule-based: deterministic heuristic or local scoring algorithm',
        };

      case 'template':
        return {
          label: 'Template',
          icon: (
            <svg className="w-3 h-3 stroke-current fill-none stroke-2 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
              <polygon points="8,2 14,8 8,14 2,8" />
            </svg>
          ),
          classes: 'border-[var(--line)] bg-[var(--panel)] text-[var(--text-dim)]',
          title: detail || 'Template: curated preset or predefined architecture example',
        };

      case 'inferred':
        return {
          label: 'Inferred',
          icon: (
            <svg className="w-3 h-3 stroke-current fill-none stroke-2 stroke-dasharray-[2,2] shrink-0" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" />
            </svg>
          ),
          classes: 'border-dashed border-[var(--line)] bg-transparent text-[var(--text-dim)]',
          title: detail || 'Inferred: estimated heuristic judgment without external empirical verification',
        };

      case 'source-verified':
        return {
          label: 'Source-verified',
          icon: (
            <svg className="w-3 h-3 stroke-current fill-none stroke-2 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1l6 3v5c0 4-6 6-6 6s-6-2-6-6V4l6-3z" />
              <polyline points="5.5,7.5 7.5,9.5 10.5,5.5" />
            </svg>
          ),
          classes: 'border-[var(--ok)]/60 bg-[var(--ok)]/10 text-[var(--ok)]',
          title: detail || 'Source-verified: claim backed by real verified external documentation/API reference',
        };

      case 'ran':
        return {
          label: 'Ran',
          icon: (
            <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 11.5L2.5 8l1.4-1.4L6 8.7l6.1-6.2L13.5 4z" />
            </svg>
          ),
          classes: 'border-[var(--ok)] bg-[var(--ok)] text-[#101010] font-bold',
          title: detail || 'Ran: historical record of observed execution output and test run',
        };
    }
  };

  const badge = getBadgeContent();

  const fiveStateClass = isInteractive
    ? 'hover:border-[var(--text-dim)] active:scale-[0.98] transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)] cursor-pointer'
    : '';

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={badge.title}
        aria-label={`Provenance: ${badge.label}. Click to view provenance legend.`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium border ${badge.classes} ${fiveStateClass} ${className}`}
      >
        {badge.icon}
        <span>{badge.label}</span>
        {badge.extra && <span className="opacity-75 text-[10px]">{badge.extra}</span>}
      </button>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium border ${badge.classes} ${className}`}
      title={badge.title}
    >
      {badge.icon}
      <span>{badge.label}</span>
      {badge.extra && <span className="opacity-75 text-[10px]">{badge.extra}</span>}
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline hover:brightness-125 ml-0.5 focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          aria-label={`Open external verification source: ${sourceLabel || sourceUrl}`}
        >
          [{sourceLabel || 'ref'}]
        </a>
      )}
    </span>
  );
}

// 3A.8 Provenance Legend Modal (at z-40 with scrim at z-30, focus trap, Escape to close)
export function ProvenanceLegendModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="provenance-legend-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
    >
      {/* 3A.8 Scrim at z-30 */}
      <div
        className="fixed inset-0 z-30 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog at z-40 */}
      <div
        ref={modalRef}
        className="relative z-40 max-w-xl w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl text-[var(--text)] max-h-[90vh] overflow-y-auto space-y-6"
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div>
            <h2 id="provenance-legend-title" className="text-lg font-bold">
              Provenance System: Design for Honesty
            </h2>
            <p className="text-sm text-[var(--text-dim)] mt-1">
              Every score, recommendation, and prompt section indicates its factual origin.
            </p>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close provenance legend"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded border border-[var(--line)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--text-dim)] active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
          >
            <svg className="w-5 h-5 stroke-current fill-none stroke-2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-[var(--line)] bg-[var(--glass)] space-y-1">
            <div className="flex items-center gap-2">
              <ProvenanceBadge type="model" />
              <span className="text-xs font-mono font-bold text-[var(--brand)]">Solid Glyph · Full Amber</span>
            </div>
            <p className="text-sm text-[var(--text)]">
              Applied <strong>only</strong> when a real live AI model (such as Groq or Gemini) produced the relevant analysis or suggestion.
            </p>
          </div>

          <div className="p-4 rounded-lg border border-[var(--line)] bg-[var(--glass)] space-y-1">
            <div className="flex items-center gap-2">
              <ProvenanceBadge type="rule-based" />
              <span className="text-xs font-mono text-[var(--text-dim)]">Hatched Marker · Dim Amber</span>
            </div>
            <p className="text-sm text-[var(--text)]">
              Applied to deterministic rubric evaluations, heuristic scoring algorithms, and local formula computations.
            </p>
          </div>

          <div className="p-4 rounded-lg border border-[var(--line)] bg-[var(--glass)] space-y-1">
            <div className="flex items-center gap-2">
              <ProvenanceBadge type="template" />
              <span className="text-xs font-mono text-[var(--text-dim)]">Outlined Marker · Bordered</span>
            </div>
            <p className="text-sm text-[var(--text)]">
              Applied to curated demo architectures, static layouts, and predefined baseline examples.
            </p>
          </div>

          <div className="p-4 rounded-lg border border-[var(--line)] bg-[var(--glass)] space-y-1">
            <div className="flex items-center gap-2">
              <ProvenanceBadge type="inferred" />
              <span className="text-xs font-mono text-[var(--text-dim)]">Dashed Marker · Inferred</span>
            </div>
            <p className="text-sm text-[var(--text)]">
              Applied to estimated time budgets, qualitative risk flags, and assumptions lacking empirical proof.
            </p>
          </div>

          <div className="p-4 rounded-lg border border-[var(--line)] bg-[var(--glass)] space-y-1">
            <div className="flex items-center gap-2">
              <ProvenanceBadge type="source-verified" />
              <span className="text-xs font-mono text-[var(--ok)]">Shield Glyph · Teal Evidence</span>
            </div>
            <p className="text-sm text-[var(--text)]">
              Used only when the claim is backed by an external verified document, prober, or manual human sign-off key.
            </p>
          </div>

          <div className="p-4 rounded-lg border border-[var(--line)] bg-[var(--glass)] space-y-1">
            <div className="flex items-center gap-2">
              <ProvenanceBadge type="ran" />
              <span className="text-xs font-mono text-[var(--ok)]">Solid Teal · Execution Evidence</span>
            </div>
            <p className="text-sm text-[var(--text)]">
              Reserved for observed execution output and test runs. (TeamMate does not execute user code; appears only in verified historical logs).
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--line)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-6 py-2 bg-[var(--panel)] border border-[var(--line)] hover:border-[var(--text-dim)] active:scale-[0.98] text-xs font-mono uppercase font-bold text-[var(--text)] rounded transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)]"
          >
            DISMISS LEGEND
          </button>
        </div>
      </div>
    </div>
  );
}

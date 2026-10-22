import React from 'react';
import { HexagonPrimitive } from './HexagonIdentity';

export interface VisualArchetype {
  id: string;
  name: string;
  tagline: string;
  bestFor: string;
  palette: { name: string; hex: string }[];
  typography: { display: string; body: string; data: string };
  principles: string[];
  sampleCssVars: string;
}

export const ARCHETYPES: VisualArchetype[] = [
  {
    id: 'hardware-lcd',
    name: 'Hardware Console / Retro LCD',
    tagline: 'Physical instrument panel, amber seven-segment displays, and scanline depth.',
    bestFor: 'DevOps, SRE dispatch, terminal consoles, IoT monitoring, security ops.',
    palette: [
      { name: 'Glass', hex: '#101010' },
      { name: 'Amber Glow', hex: '#FFA319' },
      { name: 'Bone White', hex: '#E8E2D4' },
      { name: 'Alert Red', hex: '#FF4D3D' },
    ],
    typography: {
      display: 'Chakra Petch / 16-Segment',
      body: 'IBM Plex Sans',
      data: 'JetBrains Mono (Tabular)',
    },
    principles: [
      'Glow and scanlines applied only to hero telemetry display',
      'Unlit segments visible in faint ghost amber',
      'Never convey status by color alone',
    ],
    sampleCssVars: '--glass: #101010; --brand: #FFA319; --text: #E8E2D4;',
  },
  {
    id: 'bento-grid',
    name: 'Precision Bento Grid',
    tagline: 'Clean hairline dividers, modular proportional cards, and strict 60-30-10 color balance.',
    bestFor: 'SaaS dashboards, metrics aggregators, productivity planners, executive overview.',
    palette: [
      { name: 'Slate Canvas', hex: '#0B0F17' },
      { name: 'Surface', hex: '#141C2B' },
      { name: 'Indigo Accent', hex: '#6366F1' },
      { name: 'Pure Chalk', hex: '#F8FAFC' },
    ],
    typography: {
      display: 'Plus Jakarta Sans',
      body: 'Inter / Manrope',
      data: 'IBM Plex Mono',
    },
    principles: [
      'Zero-pill metadata discipline with subtle dot separators',
      'Single-elevation depth (no cards within cards)',
      'High-density tabular numerals',
    ],
    sampleCssVars: '--canvas: #0B0F17; --surface: #141C2B; --accent: #6366F1;',
  },
  {
    id: 'minimalist-mono',
    name: 'Minimalist Technical Monospace',
    tagline: 'Pure Markdown clarity, deliberate whitespace, border accents, and zero fluff.',
    bestFor: 'Developer CLI helpers, API consoles, code notebooks, scientific calculators.',
    palette: [
      { name: 'Terminal Void', hex: '#0D1117' },
      { name: 'Code Surface', hex: '#161B22' },
      { name: 'Teal Mint', hex: '#5FD0C4' },
      { name: 'Muted Ink', hex: '#94A3B8' },
    ],
    typography: {
      display: 'Space Mono',
      body: 'JetBrains Mono',
      data: 'JetBrains Mono (Tabular)',
    },
    principles: [
      'Text measure constrained to 65-75 characters',
      'Fast keyboard navigation and shortcut tooltips',
      'No unsolicited animations or background videos',
    ],
    sampleCssVars: '--bg: #0D1117; --line: #30363D; --mint: #5FD0C4;',
  },
  {
    id: 'humanist-editorial',
    name: 'Warm Humanist Editorial',
    tagline: 'Refined serif headlines, calm bone surfaces, and bookish legibility for long sessions.',
    bestFor: 'Research papers, AI study companions, clinical reference, literature analysis.',
    palette: [
      { name: 'Deep Espresso', hex: '#141210' },
      { name: 'Parchment', hex: '#EBE5D8' },
      { name: 'Terracotta', hex: '#D97746' },
      { name: 'Muted Taupe', hex: '#9C9588' },
    ],
    typography: {
      display: 'Fraunces / Playfair Display',
      body: 'Public Sans',
      data: 'Space Mono',
    },
    principles: [
      'Generous line-height (1.6) and comfortable margins',
      'Balanced headlines with text-wrap: balance',
      'Clear hierarchy between claim and evidence',
    ],
    sampleCssVars: '--parchment: #EBE5D8; --espresso: #141210; --terracotta: #D97746;',
  },
];

interface VisualArchetypesProps {
  selectedId: string;
  onSelect: (id: string) => void;
}

export function VisualArchetypes({ selectedId, onSelect }: VisualArchetypesProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {ARCHETYPES.map((arch) => {
        const isSelected = arch.id === selectedId;
        return (
          <button
            key={arch.id}
            type="button"
            onClick={() => onSelect(arch.id)}
            aria-pressed={isSelected}
            aria-label={`${arch.name}: ${arch.tagline}. ${isSelected ? 'Currently selected' : 'Click to select'}`}
            className={`w-full text-left rounded-xl border p-4 sm:p-6 transition-all duration-150 relative flex flex-col justify-between active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-[var(--glass)] ${
              isSelected
                ? 'border-[var(--brand)] bg-[var(--panel)] shadow-[0_0_16px_var(--amber-glow)]'
                : 'border-[var(--line)] bg-[var(--panel)] hover:border-[var(--text-dim)]'
            }`}
          >
            <div>
              {/* Header with Hexagon 24 selection indicator */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2">
                  <HexagonPrimitive size={24} active={isSelected} completed={isSelected}>
                    {isSelected ? '✓' : ''}
                  </HexagonPrimitive>
                  <h3 className="text-sm font-bold text-[var(--text)]">{arch.name}</h3>
                </div>

                <span
                  className={`text-xs font-mono uppercase px-2 py-0.5 rounded border ${
                    isSelected
                      ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--brand)]/10 font-bold'
                      : 'border-[var(--line)] text-[var(--text-dim)]'
                  }`}
                >
                  {isSelected ? 'SELECTED' : 'SELECT'}
                </span>
              </div>

              <p className="text-sm text-[var(--text-dim)] mb-4 leading-relaxed max-w-[80ch]">
                {arch.tagline}
              </p>

              {/* Best for */}
              <div className="text-xs font-sans text-[var(--text-dim)] mb-4">
                <strong className="text-[var(--text)]">Optimal Fit:</strong> {arch.bestFor}
              </div>

              {/* Color Swatches on 8px grid */}
              <div className="flex items-center gap-2 mb-4">
                {arch.palette.map((swatch) => (
                  <div
                    key={swatch.hex}
                    className="flex items-center gap-1.5 text-xs font-mono text-[var(--text-dim)]"
                    title={`${swatch.name}: ${swatch.hex}`}
                  >
                    <span
                      className="w-4 h-4 rounded border border-[var(--line)] shrink-0"
                      style={{ backgroundColor: swatch.hex }}
                    />
                    <span className="hidden sm:inline tabular-nums">{swatch.hex}</span>
                  </div>
                ))}
              </div>

              {/* Typography pairing */}
              <div className="text-xs font-sans bg-[var(--glass)] p-3 rounded-lg border border-[var(--line)] text-[var(--text-dim)] mb-4 space-y-1">
                <div>Display: <span className="text-[var(--text)] font-semibold">{arch.typography.display}</span></div>
                <div>Prose: <span className="text-[var(--text)] font-semibold">{arch.typography.body}</span></div>
                <div>Numerals: <span className="text-[var(--brand)] font-mono">{arch.typography.data}</span></div>
              </div>
            </div>

            {/* Design Principles list */}
            <ul className="text-xs text-[var(--text-dim)] space-y-1.5 border-t border-[var(--line)] pt-3">
              {arch.principles.map((pr, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-[var(--brand)]" aria-hidden="true">·</span>
                  <span>{pr}</span>
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

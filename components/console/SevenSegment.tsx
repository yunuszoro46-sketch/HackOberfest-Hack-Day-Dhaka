import React from 'react';

// Maps characters to standard 7-segment active segments [a, b, c, d, e, f, g]
// Segment positions:
//     a
//   f   b
//     g
//   e   c
//     d
const SEGMENT_MAP: Record<string, boolean[]> = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
  '-': [false, false, false, false, false, false, true],
  ' ': [false, false, false, false, false, false, false],
  '_': [false, false, false, true, false, false, false],
  'A': [true, true, true, false, true, true, true],
  'b': [false, false, true, true, true, true, true],
  'C': [true, false, false, true, true, true, false],
  'c': [false, false, false, true, true, false, true],
  'd': [false, true, true, true, true, false, true],
  'E': [true, false, false, true, true, true, true],
  'F': [true, false, false, false, true, true, true],
  'H': [false, true, true, false, true, true, true],
  'h': [false, false, true, false, true, true, true],
  'L': [false, false, false, true, true, true, false],
  'O': [true, true, true, true, true, true, false],
  'o': [false, false, true, true, true, false, true],
  'P': [true, true, false, false, true, true, true],
  'r': [false, false, false, false, true, false, true],
  'S': [true, false, true, true, false, true, true],
  'U': [false, true, true, true, true, true, false],
  'u': [false, false, true, true, true, false, false],
};

interface SevenSegmentDigitProps {
  char: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'amber' | 'alert' | 'resolved';
}

export function SevenSegmentDigit({ char, size = 'md', color = 'amber' }: SevenSegmentDigitProps) {
  const activeSegments = SEGMENT_MAP[char] || SEGMENT_MAP[' '] || [false, false, false, false, false, false, false];

  const dimensions = {
    sm: { width: 14, height: 24 },
    md: { width: 20, height: 34 },
    lg: { width: 28, height: 48 },
    xl: { width: 38, height: 64 },
  }[size];

  const activeColor = {
    amber: 'var(--amber)',
    alert: 'var(--crit)',
    resolved: 'var(--ok)',
  }[color];

  const ghostColor = {
    amber: 'var(--amber-ghost)',
    alert: 'var(--crit-ghost)',
    resolved: 'var(--ok-ghost)',
  }[color];

  // Hex-tapered segment polygon coordinates inside 100 x 170 viewBox with a 4-degree slant
  const segments = [
    // a: top horizontal
    { id: 'a', points: '14,14 26,4 74,4 86,14 74,24 26,24' },
    // b: top right vertical
    { id: 'b', points: '87,17 97,27 97,75 87,85 77,75 77,27' },
    // c: bottom right vertical
    { id: 'c', points: '87,89 97,99 97,147 87,157 77,147 77,99' },
    // d: bottom horizontal
    { id: 'd', points: '14,160 26,150 74,150 86,160 74,170 26,170' },
    // e: bottom left vertical
    { id: 'e', points: '13,89 23,99 23,147 13,157 3,147 3,99' },
    // f: top left vertical
    { id: 'f', points: '13,17 23,27 23,75 13,85 3,75 3,27' },
    // g: middle horizontal
    { id: 'g', points: '15,87 25,77 75,77 85,87 75,97 25,97' },
  ];

  return (
    <svg
      width={dimensions.width}
      height={dimensions.height}
      viewBox="0 0 100 174"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block shrink-0 select-none"
      style={{ transform: 'skewX(-4deg)' }}
      aria-hidden="true"
    >
      {segments.map((seg, idx) => {
        const isLit = activeSegments[idx];
        return (
          <polygon
            key={seg.id}
            points={seg.points}
            fill={isLit ? activeColor : ghostColor}
            opacity={isLit ? 1 : 0.4}
            style={
              isLit
                ? {
                    filter: `drop-shadow(0 0 4px ${color === 'amber' ? 'var(--amber-glow)' : 'transparent'})`,
                  }
                : undefined
            }
          />
        );
      })}
    </svg>
  );
}

export function LCDColon({ size = 'md', color = 'amber' }: { size?: 'sm' | 'md' | 'lg' | 'xl'; color?: 'amber' | 'alert' | 'resolved' }) {
  const dimensions = {
    sm: { width: 8, height: 24 },
    md: { width: 10, height: 34 },
    lg: { width: 14, height: 48 },
    xl: { width: 18, height: 64 },
  }[size];

  const activeColor = color === 'alert' ? 'var(--crit)' : color === 'resolved' ? 'var(--ok)' : 'var(--amber)';

  return (
    <svg
      width={dimensions.width}
      height={dimensions.height}
      viewBox="0 0 40 174"
      fill="none"
      className="inline-block shrink-0 select-none mx-0.5"
      style={{ transform: 'skewX(-4deg)' }}
      aria-hidden="true"
    >
      <rect x="12" y="44" width="16" height="16" rx="2" fill={activeColor} />
      <rect x="12" y="114" width="16" height="16" rx="2" fill={activeColor} />
    </svg>
  );
}

interface SevenSegmentDisplayProps {
  value: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'amber' | 'alert' | 'resolved';
  label: string; // Accessible text for screen readers (WCAG Requirement)
}

export function SevenSegmentDisplay({ value, size = 'md', color = 'amber', label }: SevenSegmentDisplayProps) {
  const chars = value.split('');

  return (
    <span role="img" aria-label={label} className="inline-flex items-center tracking-tight">
      {chars.map((ch, i) => {
        if (ch === ':') {
          return <LCDColon key={i} size={size} color={color} />;
        }
        if (ch === ' ' || ch === 'h' || ch === 'm' || ch === 's') {
          // Compact spacer or unit notation
          return (
            <span
              key={i}
              className="text-xs font-mono px-0.5 uppercase self-end mb-1 text-[var(--fg-dim)]"
              aria-hidden="true"
            >
              {ch}
            </span>
          );
        }
        return <SevenSegmentDigit key={i} char={ch} size={size} color={color} />;
      })}
    </span>
  );
}

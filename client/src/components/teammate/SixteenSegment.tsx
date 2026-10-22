import React from 'react';

// 16-segment alphanumeric display mapping
// Segments:
// a1: top left horizontal, a2: top right horizontal
// b: top right vertical, c: bottom right vertical
// d2: bottom right horizontal, d1: bottom left horizontal
// e: bottom left vertical, f: top left vertical
// g1: mid left horizontal, g2: mid right horizontal
// h: top-left diagonal (to center), j: top vertical (center)
// k: top-right diagonal (to center), l: bottom-left diagonal (from center)
// m: bottom vertical (center), n: bottom-right diagonal (from center)

// For clean rendering, we can model segments for:
// T, E, A, M, :, O, N, C, L, R, P, 0-9
export function SixteenSegmentChar({
  char,
  size = 'md',
  color = 'amber',
}: {
  char: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'amber' | 'bone' | 'alert' | 'ok';
}) {
  const dimensions = {
    sm: { width: 14, height: 24 },
    md: { width: 22, height: 36 },
    lg: { width: 30, height: 50 },
    xl: { width: 40, height: 66 },
  }[size];

  const activeColor = {
    amber: 'var(--amber)',
    bone: 'var(--bone)',
    alert: 'var(--alert)',
    ok: 'var(--ok)',
  }[color];

  const ghostColor = 'var(--amber-ghost)';

  // Define segments as boolean flags for standard letters
  const upper = char.toUpperCase();

  // Coordinates inside a 100 x 160 viewBox
  // Segments definition:
  // a1: [14,12] to [48,12]
  // a2: [52,12] to [86,12]
  // b:  [88,14] to [88,78]
  // c:  [88,82] to [88,146]
  // d2: [52,148] to [86,148]
  // d1: [14,148] to [48,148]
  // e:  [12,82] to [12,146]
  // f:  [12,14] to [12,78]
  // g1: [14,80] to [48,80]
  // g2: [52,80] to [86,80]
  // j:  [50,14] to [50,78] (top center vertical)
  // m:  [50,82] to [50,146] (bottom center vertical)
  // h:  [16,16] to [48,78] (top-left diagonal)
  // k:  [84,16] to [52,78] (top-right diagonal)
  // l:  [48,82] to [16,144] (bottom-left diagonal)
  // n:  [52,82] to [84,144] (bottom-right diagonal)

  const active = {
    T: { a1: true, a2: true, j: true, m: true },
    E: { a1: true, a2: true, f: true, g1: true, g2: true, e: true, d1: true, d2: true },
    A: { a1: true, a2: true, f: true, b: true, e: true, c: true, g1: true, g2: true },
    M: { f: true, b: true, e: true, c: true, h: true, k: true },
    P: { a1: true, a2: true, f: true, b: true, g1: true, g2: true, e: true },
    L: { f: true, e: true, d1: true, d2: true },
    N: { f: true, e: true, b: true, c: true, h: true, n: true },
    O: { a1: true, a2: true, f: true, b: true, e: true, c: true, d1: true, d2: true },
    R: { a1: true, a2: true, f: true, b: true, g1: true, g2: true, e: true, n: true },
    I: { a1: true, a2: true, d1: true, d2: true, j: true, m: true },
    D: { a1: true, a2: true, d1: true, d2: true, j: true, m: true }, // Simplified
    '0': { a1: true, a2: true, f: true, b: true, e: true, c: true, d1: true, d2: true, k: true, l: true },
    '1': { b: true, c: true, k: true },
    '2': { a1: true, a2: true, b: true, g1: true, g2: true, e: true, d1: true, d2: true },
    '3': { a1: true, a2: true, b: true, g2: true, c: true, d1: true, d2: true },
    '4': { f: true, g1: true, g2: true, b: true, c: true },
    '5': { a1: true, a2: true, f: true, g1: true, g2: true, c: true, d1: true, d2: true },
    '6': { a1: true, a2: true, f: true, e: true, g1: true, g2: true, c: true, d1: true, d2: true },
    '7': { a1: true, a2: true, b: true, c: true },
    '8': { a1: true, a2: true, f: true, b: true, g1: true, g2: true, e: true, c: true, d1: true, d2: true },
    '9': { a1: true, a2: true, f: true, b: true, g1: true, g2: true, c: true, d1: true, d2: true },
    '-': { g1: true, g2: true },
    ' ': {},
  }[upper] || {};

  const segs = [
    // a1, a2
    { id: 'a1', x1: 14, y1: 10, x2: 48, y2: 10 },
    { id: 'a2', x1: 52, y1: 10, x2: 86, y2: 10 },
    // f, b
    { id: 'f', x1: 10, y1: 14, x2: 10, y2: 76 },
    { id: 'b', x1: 90, y1: 14, x2: 90, y2: 76 },
    // g1, g2
    { id: 'g1', x1: 14, y1: 80, x2: 48, y2: 80 },
    { id: 'g2', x1: 52, y1: 80, x2: 86, y2: 80 },
    // e, c
    { id: 'e', x1: 10, y1: 84, x2: 10, y2: 146 },
    { id: 'c', x1: 90, y1: 84, x2: 90, y2: 146 },
    // d1, d2
    { id: 'd1', x1: 14, y1: 150, x2: 48, y2: 150 },
    { id: 'd2', x1: 52, y1: 150, x2: 86, y2: 150 },
    // center verticals
    { id: 'j', x1: 50, y1: 14, x2: 50, y2: 76 },
    { id: 'm', x1: 50, y1: 84, x2: 50, y2: 146 },
    // diagonals
    { id: 'h', x1: 14, y1: 16, x2: 46, y2: 76 },
    { id: 'k', x1: 86, y1: 16, x2: 54, y2: 76 },
    { id: 'l', x1: 46, y1: 84, x2: 14, y2: 144 },
    { id: 'n', x1: 54, y1: 84, x2: 86, y2: 144 },
  ];

  return (
    <svg
      width={dimensions.width}
      height={dimensions.height}
      viewBox="0 0 100 160"
      fill="none"
      className="inline-block shrink-0 select-none"
      style={{ transform: 'skewX(-4deg)' }}
      aria-hidden="true"
    >
      {segs.map((seg) => {
        const isLit = (active as Record<string, boolean>)[seg.id];
        return (
          <line
            key={seg.id}
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            stroke={isLit ? activeColor : ghostColor}
            strokeWidth={isLit ? 8 : 6}
            strokeLinecap="round"
            strokeOpacity={isLit ? 1 : 0.25}
            style={
              isLit
                ? {
                    filter: `drop-shadow(0 0 3px ${color === 'amber' ? 'var(--amber-glow)' : 'transparent'})`,
                  }
                : undefined
            }
          />
        );
      })}
    </svg>
  );
}

export function LCDColon({
  size = 'md',
  color = 'amber',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'amber' | 'bone' | 'alert' | 'ok';
}) {
  const dimensions = {
    sm: { width: 8, height: 24 },
    md: { width: 12, height: 36 },
    lg: { width: 16, height: 50 },
    xl: { width: 22, height: 66 },
  }[size];

  const activeColor = {
    amber: 'var(--amber)',
    bone: 'var(--bone)',
    alert: 'var(--alert)',
    ok: 'var(--ok)',
  }[color];

  return (
    <svg
      width={dimensions.width}
      height={dimensions.height}
      viewBox="0 0 40 160"
      fill="none"
      className="inline-block shrink-0 select-none mx-0.5"
      style={{ transform: 'skewX(-4deg)' }}
      aria-hidden="true"
    >
      <rect
        x="12"
        y="42"
        width="16"
        height="16"
        rx="2"
        fill={activeColor}
        style={{ filter: `drop-shadow(0 0 3px var(--amber-glow))` }}
      />
      <rect
        x="12"
        y="102"
        width="16"
        height="16"
        rx="2"
        fill={activeColor}
        style={{ filter: `drop-shadow(0 0 3px var(--amber-glow))` }}
      />
    </svg>
  );
}

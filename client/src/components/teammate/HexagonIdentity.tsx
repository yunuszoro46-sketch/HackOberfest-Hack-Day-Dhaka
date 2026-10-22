import React from 'react';
import { SixteenSegmentChar, LCDColon } from './SixteenSegment';

export function HexagonCluster({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Central Hexagon */}
      <polygon
        points="32,20 42,26 42,38 32,44 22,38 22,26"
        fill="var(--amber)"
        fillOpacity="0.25"
        stroke="var(--amber)"
        strokeWidth="2.5"
      />
      <circle cx="32" cy="32" r="3.5" fill="var(--amber)" />

      {/* Surrounding Cluster Hexagons */}
      <polygon
        points="32,4 40,9 40,19 32,24 24,19 24,9"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.8"
        strokeOpacity="0.75"
      />
      <polygon
        points="48,13 56,18 56,28 48,33 40,28 40,18"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.8"
        strokeOpacity="0.6"
      />
      <polygon
        points="48,35 56,40 56,50 48,55 40,50 40,40"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.8"
        strokeOpacity="0.6"
      />
      <polygon
        points="32,44 40,49 40,59 32,64 24,59 24,49"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.8"
        strokeOpacity="0.75"
      />
      <polygon
        points="16,35 24,40 24,50 16,55 8,50 8,40"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.8"
        strokeOpacity="0.6"
      />
      <polygon
        points="16,13 24,18 24,28 16,33 8,28 8,18"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.8"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

export function HexagonPrimitive({
  size = 24,
  active = false,
  completed = false,
  requiresApproval = false,
  children,
}: {
  size?: 24 | 32 | 48 | 64;
  active?: boolean;
  completed?: boolean;
  requiresApproval?: boolean;
  children?: React.ReactNode;
}) {
  const strokeColor = requiresApproval
    ? 'var(--text)'
    : completed
    ? 'var(--ok)'
    : active
    ? 'var(--brand)'
    : 'var(--brand-ghost)';

  const fillColor = completed
    ? 'color-mix(in srgb, var(--ok) 18%, transparent)'
    : active
    ? 'color-mix(in srgb, var(--brand) 18%, transparent)'
    : requiresApproval
    ? 'color-mix(in srgb, var(--text) 12%, transparent)'
    : 'transparent';

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none shrink-0 ${
        requiresApproval ? 'needs-you-pulse rounded-full' : ''
      }`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        className="absolute inset-0"
        aria-hidden="true"
      >
        <polygon
          points="16,2 29,9 29,23 16,30 3,23 3,9"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.8"
        />
      </svg>
      {children && (
        <span className="relative z-10 text-[10px] font-sans font-bold tabular-nums text-[var(--text)]">{children}</span>
      )}
    </div>
  );
}

export function TeamMateWordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const charSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';
  const logoSize = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';

  return (
    <div className="flex items-center gap-2 select-none" aria-label="TEAM:MATE Planning Workspace">
      <HexagonCluster className={logoSize} />
      <div className="flex items-center font-lcd tracking-tight" aria-hidden="true">
        <SixteenSegmentChar char="T" size={charSize} />
        <SixteenSegmentChar char="E" size={charSize} />
        <SixteenSegmentChar char="A" size={charSize} />
        <SixteenSegmentChar char="M" size={charSize} />
        <LCDColon size={charSize} />
        <SixteenSegmentChar char="M" size={charSize} />
        <SixteenSegmentChar char="A" size={charSize} />
        <SixteenSegmentChar char="T" size={charSize} />
        <SixteenSegmentChar char="E" size={charSize} />
      </div>
    </div>
  );
}

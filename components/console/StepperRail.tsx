"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { LayoutGrid } from "lucide-react";
import { isStale } from "@/lib/stale";
import { STAGE_STEPS, stageGate } from "@/lib/client/stages";
import type { IdeaCard, StageId } from "@/lib/schema/ideaCard";
import type { Health } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { HexagonPrimitive, type HexState, TeamMateWordmark } from "./HexagonIdentity";

const SUB: Record<StageId, string> = {
  interrogate: "Five questions",
  council: "Critics · competitors · bets",
  preview: "Clickable mockup",
  architecture: "Stack and design",
  prompt: "Sign off · compile",
};

function hexState(card: IdeaCard, s: StageId, current: StageId): HexState {
  if (isStale(card, s)) return "stale";
  if (s === current) return "active";
  return card.stamps[s] !== undefined ? "done" : "default";
}

/** Rows: Ideas, then the five stages. Keys 1-5 jump to a stage while focus is on the rail. */
function StageRows({ card, current, onSelect, compact }: { card: IdeaCard; current: StageId; onSelect: (s: StageId) => void; compact?: boolean }) {
  const onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 5) {
      const s = STAGE_STEPS[n - 1].id;
      if (!stageGate(card, s)) {
        e.preventDefault();
        onSelect(s);
      }
    }
  };
  return (
    <ol className={cn("flex gap-1", compact ? "flex-row" : "flex-col")} onKeyDown={onKey}>
      <li className="shrink-0">
        <Link href="/" className={cn("flex items-center gap-3 rounded-[6px] px-2 py-2 text-fg-dim hover:bg-panel-2 hover:text-fg", compact && "py-1.5")}>
          <span className="inline-flex size-[22px] items-center justify-center text-fg-dim"><LayoutGrid className="size-4" aria-hidden="true" /></span>
          <span className="font-sans text-[15px] font-semibold">Ideas</span>
        </Link>
      </li>
      {STAGE_STEPS.map((s, i) => {
        const gate = stageGate(card, s.id);
        const state = hexState(card, s.id, current);
        return (
          <li key={s.id} className="shrink-0">
            <button type="button" onClick={() => onSelect(s.id)} disabled={!!gate} title={gate ?? `${s.label} (key ${i + 1})`}
              aria-current={s.id === current ? "step" : undefined} data-stage={s.id} data-status={state}
              className={cn(
                "flex w-full items-center gap-3 rounded-[6px] px-2 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45",
                s.id === current ? "bg-panel-2" : "hover:bg-panel-2",
                compact && "py-1.5",
              )}>
              <HexagonPrimitive state={state}>{i + 1}</HexagonPrimitive>
              <span className="min-w-0">
                <span className={cn("block whitespace-nowrap font-sans text-[15px] font-semibold", s.id === current ? "text-fg" : "text-fg-dim")}>{s.label}</span>
                {!compact && <span className="block truncate font-mono text-[12px] text-fg-faint">{state === "stale" ? "stale · regenerate" : SUB[s.id]}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function RailFooter({ health }: { health: Health | null }) {
  return (
    <dl className="space-y-1 font-mono text-[12px] text-fg-dim">
      <div className="flex gap-1.5"><dt className="text-fg-faint">Model</dt><dd className="truncate">{health ? (health.provider === "mock" ? "mock replies" : health.model) : "…"}</dd></div>
      <div className="flex items-center gap-1.5">
        <dt className="text-fg-faint">Search</dt>
        <dd className="flex min-w-0 items-center gap-1 whitespace-nowrap">
          <span className={health?.search.configured ? "text-ok" : "text-warn"} aria-hidden="true">{health?.search.configured ? "●" : "○"}</span>
          {health ? (health.search.configured ? `on · ${health.search.provider}` : "off") : "…"}
        </dd>
      </div>
      {health && !health.providerConfigured && <div className="text-crit">✕ no model key on the server</div>}
    </dl>
  );
}

/** Desktop (>= 860px): fixed 232px left rail. Below 860px, StageStrip takes its place under the top bar. */
export function StepperRail({ card, current, onSelect, health }: { card: IdeaCard; current: StageId; onSelect: (s: StageId) => void; health: Health | null }) {
  return (
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line bg-panel min-[860px]:flex" aria-label="Stages">
        <div className="border-b border-line px-4 py-4"><Link href="/" aria-label="TeamMate home"><TeamMateWordmark size="sm" /></Link></div>
        <nav className="flex-1 overflow-y-auto p-2" aria-label="Stage list"><StageRows card={card} current={current} onSelect={onSelect} /></nav>
        <div className="border-t border-line p-4"><RailFooter health={health} /></div>
      </aside>
  );
}

/** Below 860px: the horizontal stepper, rendered right after the top bar so it stacks under it. */
export function StageStrip({ card, current, onSelect }: { card: IdeaCard; current: StageId; onSelect: (s: StageId) => void }) {
  return (
      <nav className="sticky top-[52px] z-10 overflow-x-auto border-b border-line bg-panel px-2 py-1.5 min-[860px]:hidden" aria-label="Stages">
        <StageRows card={card} current={current} onSelect={onSelect} compact />
      </nav>
  );
}

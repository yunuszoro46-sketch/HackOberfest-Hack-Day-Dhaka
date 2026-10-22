import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ChipTone = "default" | "ok" | "warn" | "crit" | "amber" | "info";

const TONE: Record<ChipTone, string> = {
  default: "border-line-2 text-fg-dim",
  ok: "border-ok text-ok bg-[var(--ok-ghost)]",
  warn: "border-warn text-warn",
  crit: "border-crit text-crit bg-[var(--crit-ghost)]",
  amber: "border-amber text-amber bg-[var(--amber-ghost)]",
  info: "border-info text-info",
};

/** 11px mono chip. Always a symbol or icon plus text, never a bare coloured dot. */
export function Chip({ tone = "default", icon, children, className, title }: { tone?: ChipTone; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border px-[7px] py-[3px] font-mono text-[11px] leading-none [&_svg]:size-3", TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

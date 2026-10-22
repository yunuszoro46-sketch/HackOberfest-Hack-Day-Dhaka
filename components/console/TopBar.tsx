"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConsoleControls } from "./Controls";

/** Sticky top bar: breadcrumb left; readiness and the Console/Dim/Paper/Voice group right (design §4.8). */
export function TopBar({ crumbs, right, mobileSheet }: { crumbs: ReactNode[]; right?: ReactNode; mobileSheet?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-[52px] items-center gap-3 border-b border-line px-4 backdrop-blur-[10px]"
      style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-[.1em] text-fg-dim">
        {crumbs.map((c, i) => (
          <span key={i}>{i > 0 && <span className="px-1.5 text-fg-faint">/</span>}{c}</span>
        ))}
      </nav>
      {right}
      <ConsoleControls className="hidden lg:inline-flex" />
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary" className="lg:hidden" aria-label="Console settings"><SlidersHorizontal /> Console</Button>
        </DialogTrigger>
        <DialogContent className="top-auto bottom-0 translate-y-0 rounded-b-none">
          <div className="ph pr-10"><DialogTitle className="h2-console">Console</DialogTitle></div>
          <div className="pb space-y-4">
            <ConsoleControls className="flex-wrap" />
            {mobileSheet}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

export const Crumb = ({ href, children }: { href?: string; children: ReactNode }) =>
  href ? <Link href={href} className="hover:text-fg">{children}</Link> : <span className="text-fg">{children}</span>;

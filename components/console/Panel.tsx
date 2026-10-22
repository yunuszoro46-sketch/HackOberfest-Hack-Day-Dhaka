import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Flat panel: --panel fill, 1px --line border, 8px radius, no shadow. Panels never nest. */
export function Panel({ className, children, ...rest }: React.ComponentProps<"section">) {
  return <section className={cn("panel min-w-0", className)} {...rest}>{children}</section>;
}

/** Header row: section heading left, a chip or action right. */
export function PanelHeader({ title, id, right, className }: { title: ReactNode; id?: string; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("ph", className)}>
      <h2 id={id} className="h2-console">{title}</h2>
      {right && <div className="flex flex-wrap items-center gap-1.5">{right}</div>}
    </div>
  );
}

export function PanelBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("pb", className)}>{children}</div>;
}

/** Eyebrow + stage title + optional lead line; one per stage. */
export function StageHeading({ eyebrow, title, lead, right }: { eyebrow: string; title: ReactNode; lead?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="stage-title">{title}</h1>
        {lead && <p className="measure text-fg-dim">{lead}</p>}
      </div>
      {right}
    </div>
  );
}

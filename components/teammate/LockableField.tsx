"use client";

import { Lock, LockOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Lockable } from "@/lib/schema/ideaCard";

/** Lock toggle + Regenerate, shared by every generated field. Regenerate is disabled while locked. */
export function LockControls({
  name, locked, onToggleLock, onRegenerate, regenerating, disabled,
}: {
  name: string;
  locked: boolean;
  onToggleLock: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant={locked ? "secondary" : "ghost"} size="sm" onClick={onToggleLock} aria-pressed={locked} aria-label={`${locked ? "Unlock" : "Lock"} ${name}`} data-lock={name}>
            {locked ? <Lock /> : <LockOpen />}
            <span className="hidden sm:inline">{locked ? "Locked" : "Lock"}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{locked ? "Locked: passed downstream verbatim and never regenerated." : "Lock to keep this exact value through every regeneration."}</TooltipContent>
      </Tooltip>
      {onRegenerate && (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span keeps the tooltip working when the button is disabled */}
            <span tabIndex={locked ? 0 : -1}>
              <Button type="button" variant="ghost" size="sm" onClick={onRegenerate} disabled={locked || regenerating || disabled} aria-label={`Regenerate ${name}`}>
                <RefreshCw className={cn(regenerating && "animate-spin")} />
                <span className="hidden sm:inline">Regenerate</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{locked ? "Unlock to regenerate. Locked fields are never regenerated." : "Ask the model for a new version of this field only."}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function LockableField({
  name, label, field, onChange, onToggleLock, onRegenerate, regenerating, rows = 2, hint,
}: {
  name: string;
  label: string;
  field: Lockable<string>;
  onChange: (value: string) => void;
  onToggleLock: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  rows?: number;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className={cn("rounded-lg border p-3", field.locked && "border-primary/40 bg-muted/40")} data-field={name}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <LockControls name={label} locked={field.locked} onToggleLock={onToggleLock} onRegenerate={onRegenerate} regenerating={regenerating} />
      </div>
      <Textarea id={id} rows={rows} value={field.value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A lockable list of short strings, edited one item per line. */
export function LockableLines({
  name, label, field, onChange, onToggleLock, onRegenerate, regenerating, hint,
}: {
  name: string;
  label: string;
  field: Lockable<string[]>;
  onChange: (value: string[]) => void;
  onToggleLock: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className={cn("rounded-lg border p-3", field.locked && "border-primary/40 bg-muted/40")} data-field={name}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <LockControls name={label} locked={field.locked} onToggleLock={onToggleLock} onRegenerate={onRegenerate} regenerating={regenerating} />
      </div>
      <Textarea id={id} rows={Math.max(3, field.value.length + 1)} value={field.value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))}
        onBlur={() => onChange(field.value.map((s) => s.trim()).filter(Boolean))} />
      <p className="mt-1 text-xs text-muted-foreground">{hint ?? "One item per line."}</p>
    </div>
  );
}

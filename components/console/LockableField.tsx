"use client";

import { Lock, LockOpen, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "./Chip";

const action =
  "inline-flex h-[30px] min-w-[64px] items-center justify-center gap-1 rounded-[4px] border border-line-2 bg-panel px-2 font-mono text-[12px] uppercase tracking-[.08em] text-fg-dim hover:border-fg-dim hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']";

/** LOCK / REGEN pair, used in the field's action column and in panel headers. */
export function LockActions({
  label, locked, onToggleLock, onRegenerate, regenerating, busy, vertical = true,
}: {
  label: string;
  locked: boolean;
  onToggleLock: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  busy?: boolean;
  vertical?: boolean;
}) {
  return (
    <div className={cn("flex gap-1.5", vertical ? "flex-col" : "flex-row")}>
      <button type="button" className={cn(action, locked && "border-ok text-ok")} onClick={onToggleLock} aria-pressed={locked}
        aria-label={`${locked ? "Unlock" : "Lock"} ${label}`} data-lock={label}>
        {locked ? <Lock className="size-3" aria-hidden="true" /> : <LockOpen className="size-3" aria-hidden="true" />}{locked ? "Locked" : "Lock"}
      </button>
      {onRegenerate && (
        <button type="button" className={action} onClick={onRegenerate} disabled={locked || regenerating || busy}
          title={locked ? "Unlock to regenerate" : busy ? "Another step is running" : `Regenerate ${label} with the other fields as fixed facts`}
          aria-label={`Regenerate ${label}`}>
          <RefreshCw className={cn("size-3", regenerating && "animate-spin")} aria-hidden="true" />Regen
        </button>
      )}
    </div>
  );
}

/**
 * The signature component (design §4.5): label row, field, and a LOCK / REGEN column. Locked fields go downstream
 * verbatim and are never regenerated; stale fields keep their content readable with a yellow marker.
 */
export function LockableField({
  id, label, value, locked, stale, onChange, onToggleLock, onRegenerate, regenerating, busy, rows = 2, hint, placeholder,
}: {
  id: string;
  label: string;
  value: string;
  locked: boolean;
  stale?: boolean;
  onChange: (value: string) => void;
  onToggleLock: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  busy?: boolean;
  rows?: number;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div
      className={cn("relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 rounded-[8px] border p-3", locked ? "border-ok" : "border-line", stale && "border-l-2 border-l-warn")}
      style={locked ? { background: "color-mix(in srgb, var(--ok-ghost) 50%, var(--panel))" } : undefined}
      data-field={id}
      data-locked={locked}
    >
      {regenerating && <span className="progress-line rounded-t-[8px]" aria-hidden="true" />}
      <div className="col-span-2 flex items-center justify-between gap-2">
        <label htmlFor={`field-${id}`} className="label-mono">{label}</label>
        <span className="flex items-center gap-1.5">
          {stale && <Chip tone="warn" icon={<span aria-hidden="true">!</span>}>stale</Chip>}
          {locked && <span className="font-mono text-[12px] text-ok">● LOCKED</span>}
        </span>
      </div>
      <textarea
        id={`field-${id}`}
        aria-label={label}
        rows={rows}
        className={cn("field resize-y", regenerating && "text-fg-faint")}
        value={regenerating ? "Regenerating with the other fields as fixed facts…" : value}
        readOnly={regenerating}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <LockActions label={label} locked={locked} onToggleLock={onToggleLock} onRegenerate={onRegenerate} regenerating={regenerating} busy={busy} />
      {hint && <p className="col-span-2 text-[14px] text-fg-faint">{hint}</p>}
    </div>
  );
}

/** A lockable list edited one item per line (e.g. out of scope). Blank lines are ignored wherever the list is read. */
export function LockableLines(props: Omit<Parameters<typeof LockableField>[0], "value" | "onChange"> & { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <LockableField
      {...props}
      rows={Math.max(3, props.value.length + 1)}
      value={props.value.join("\n")}
      hint={props.hint ?? "One item per line."}
      onChange={(v) => props.onChange(v.split("\n"))}
    />
  );
}

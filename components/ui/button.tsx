import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Console buttons (design §4.1). Chakra Petch 600, 13px. One primary per screen.
// On touch screens an invisible ::after extends the hit area to at least 44px without changing the visual size.
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] border font-display text-[13px] font-semibold tracking-[.04em] transition-[filter,transform,border-color,background-color] outline-none active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']",
  {
    variants: {
      variant: {
        primary: "border-amber bg-amber text-amber-ink hover:brightness-[1.06]",
        secondary: "border-line-2 bg-panel text-fg hover:border-fg-dim",
        ghost: "border-transparent bg-transparent text-fg-dim hover:bg-panel-2 hover:text-fg",
        approve: "border-ok bg-[var(--ok-ghost)] text-ok hover:brightness-110",
        danger: "border-crit bg-[var(--crit-ghost)] text-crit hover:brightness-110",
      },
      size: {
        default: "h-[38px] px-4",
        sm: "h-[30px] px-3 text-[12px] [&_svg]:size-3.5",
        icon: "size-[38px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

function Button({
  className, variant, size, asChild = false, ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" data-variant={variant ?? "secondary"} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };

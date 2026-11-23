import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none transition-colors",
  {
    variants: {
      variant: {
        neutral: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
        forest: "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]",
        sage: "bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]",
        peach: "bg-[var(--tint-peach)] text-[var(--tint-peach-fg)]",
        lavender: "bg-[var(--tint-lavender)] text-[var(--tint-lavender-fg)]",
        blush: "bg-[var(--tint-blush)] text-[var(--tint-blush-fg)]",
        danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

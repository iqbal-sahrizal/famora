import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-[20px] p-6 transition-all duration-200",
  {
    variants: {
      variant: {
        elevated:
          "bg-[var(--bg-surface)] shadow-[var(--shadow-soft)] border border-[var(--border-subtle)]",
        subtle: "bg-[var(--bg-subtle)]",
        sage: "bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]",
        peach: "bg-[var(--tint-peach)] text-[var(--tint-peach-fg)]",
        lavender: "bg-[var(--tint-lavender)] text-[var(--tint-lavender-fg)]",
        blush: "bg-[var(--tint-blush)] text-[var(--tint-blush-fg)]",
      },
    },
    defaultVariants: {
      variant: "elevated",
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-4 flex items-start justify-between gap-4", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-heading text-[17px] font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[13.5px] leading-relaxed opacity-80", className)}
      {...props}
    />
  );
}

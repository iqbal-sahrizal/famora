import * as React from "react";
import { cn } from "@/lib/utils";

export function Container({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}

export function Section({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("space-y-6", className)} {...props} />;
}

export function PageHeader({
  title,
  description,
  actions,
  badge,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        {badge && <div>{badge}</div>}
        <h1 className="font-heading text-[24px] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-[14.5px] leading-relaxed text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
    </div>
  );
}

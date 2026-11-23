"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("famora-skeleton rounded-xl", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[24px] bg-[var(--bg-subtle)]/70 px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-surface)] text-[var(--accent-primary)] shadow-sm">
        {icon}
      </div>
      <h3 className="font-heading text-[17px] font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button className="mt-5" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({
  title = "We could not load this section",
  description = "Your data is safe. Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const { t } = useLocale();
  return (
    <div
      role="alert"
      className="flex flex-col items-start justify-between gap-4 rounded-[20px] bg-[var(--status-danger-bg)] p-5 sm:flex-row sm:items-center"
    >
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--status-danger)]">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <h4 className="font-heading text-[15px] font-semibold text-[var(--status-danger-fg)]">
            {title}
          </h4>
          <p className="mt-0.5 text-[13px] text-[var(--status-danger-fg)]/85">
            {description}
          </p>
        </div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t("errors.tryAgain")}
        </Button>
      )}
    </div>
  );
}

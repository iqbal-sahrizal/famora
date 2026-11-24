"use client";

import * as React from "react";
import { formatCurrency } from "@/lib/utils";

export interface MonthlySpendPoint {
  label: string;
  amountCents: number;
}

export function SpendBarChart({
  data,
  currencyCode = "USD",
  locale = "en-US",
}: {
  data: MonthlySpendPoint[];
  currencyCode?: string;
  locale?: string;
}) {
  const max = Math.max(...data.map((d) => d.amountCents), 1);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-40 items-end gap-3 pt-6">
        {data.map((point, idx) => {
          const heightPct = Math.max(10, Math.round((point.amountCents / max) * 100));
          const isLast = idx === data.length - 1;
          const isActive = activeIndex === idx;
          return (
            <button
              key={point.label}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(idx)}
              onBlur={() => setActiveIndex(null)}
              onClick={() => setActiveIndex((prev) => (prev === idx ? null : idx))}
              aria-label={`${point.label}: ${formatCurrency(point.amountCents, currencyCode, locale)}`}
              className="group relative flex flex-1 flex-col items-center gap-2 focus:outline-none cursor-pointer"
            >
              {isActive && (
                <div className="absolute -top-7 z-10 rounded-lg bg-[var(--text-primary)] px-2 py-1 text-[11px] font-medium text-[var(--bg-canvas)] tabular-nums shadow-sm whitespace-nowrap">
                  {formatCurrency(point.amountCents, currencyCode, locale)}
                </div>
              )}
              <div className="flex h-28 w-full items-end">
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full rounded-t-xl transition-all duration-300 ${
                    isActive
                      ? "bg-[var(--accent-primary)]"
                      : isLast
                        ? "bg-[var(--accent-primary)]"
                        : "bg-[var(--tint-sage)] group-hover:bg-[var(--accent-primary)]/70"
                  }`}
                />
              </div>
              <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">
                {point.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BudgetRing({
  spentCents,
  budgetCents,
  label,
  currencyCode = "USD",
  locale,
  targetText,
}: {
  spentCents: number;
  budgetCents: number;
  label: string;
  currencyCode?: string;
  locale?: string;
  targetText?: string;
}) {
  const pct = Math.min(100, Math.round((spentCents / Math.max(budgetCents, 1)) * 100));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-24 w-24 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 96 96">
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="var(--bg-subtle)"
            strokeWidth="8"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-heading text-[16px] font-semibold tabular-nums">
            {pct}%
          </span>
        </div>
      </div>
      <div>
        <p className="text-[12.5px] font-medium text-[var(--text-secondary)]">
          {label}
        </p>
        <p className="mt-0.5 font-heading text-[20px] font-semibold tabular-nums text-[var(--text-primary)]">
          {formatCurrency(spentCents, currencyCode, locale)}
        </p>
        <p className="text-[12.5px] text-[var(--text-muted)] tabular-nums">
          {targetText ?? `of ${formatCurrency(budgetCents, currencyCode, locale)} monthly target`}
        </p>
      </div>
    </div>
  );
}

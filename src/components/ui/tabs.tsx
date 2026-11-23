"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
}

export function Tabs({
  tabs,
  activeId,
  onChange,
  className,
}: {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-[var(--bg-subtle)] p-1 sm:flex-wrap",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-medium transition-all duration-150 cursor-pointer sm:min-h-0",
              active
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                  active
                    ? "bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]"
                    : "bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

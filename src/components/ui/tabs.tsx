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
        "inline-flex flex-wrap items-center gap-1 rounded-2xl bg-[var(--bg-subtle)] p-1",
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
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-medium transition-all duration-150 cursor-pointer",
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

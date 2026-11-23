"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Calendar,
  CheckSquare,
  Home,
  Moon,
  ShoppingBag,
  Sun,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="h-10 w-24 rounded-full bg-[var(--bg-subtle)]" aria-hidden="true" />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--bg-surface)] px-3.5 text-[13px] font-medium text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-sm hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer sm:h-10"
    >
      {isDark ? (
        <>
          <Sun className="h-4 w-4 text-[#E9B98B]" />
          <span>Light</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 text-[#315C49]" />
          <span>Dark</span>
        </>
      )}
    </button>
  );
}

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "shopping", label: "Shopping", icon: ShoppingBag },
  { id: "finance", label: "Finance", icon: Wallet },
];

export function NavigationPreview({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <nav
        aria-label="Primary Navigation Preview"
        className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-[var(--bg-surface)] p-2 border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13.5px] font-medium transition-all cursor-pointer",
                active
                  ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export function Dropdown({
  trigger,
  items,
  align = "right",
}: {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 mt-2 min-w-[200px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-float)]",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              type="button"
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] font-medium transition-colors cursor-pointer",
                item.danger
                  ? "text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                  : "text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
              )}
            >
              {item.icon && <span className="opacity-80">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { toIntlLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";

const DAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAYS_ID = ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"];

export function DatePicker({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: Date;
  onChange: (date: Date) => void;
}) {
  const { locale, t } = useLocale();
  const intlLocale = toIntlLocale(locale);
  const days = locale === "id" ? DAYS_ID : DAYS_EN;
  const [open, setOpen] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState(
    new Date(value.getFullYear(), value.getMonth(), 1)
  );
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const formatted = value.toLocaleDateString(intlLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div ref={ref} className="relative flex flex-col gap-1.5">
      {label && (
        <span className="text-[13.5px] font-medium text-[var(--text-primary)]">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between rounded-xl bg-[var(--bg-subtle)] px-3.5 text-[14.5px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
      >
        <span className="tabular-nums">{formatted}</span>
        <CalendarIcon className="h-4 w-4 text-[var(--text-secondary)]" />
      </button>

      {open && (
        <div className="absolute top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-float)]">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label={t("datepicker.prevMonthAria")}
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-heading text-[14px] font-semibold">
              {viewMonth.toLocaleDateString(intlLocale, {
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              type="button"
              aria-label={t("datepicker.nextMonthAria")}
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[var(--text-muted)]">
            {days.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, idx) => (
              <div key={`empty-${idx}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const isSelected =
                value.getFullYear() === year &&
                value.getMonth() === month &&
                value.getDate() === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange(new Date(year, month, day));
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-11 w-full items-center justify-center rounded-full text-[13px] tabular-nums transition-colors cursor-pointer sm:h-9",
                    isSelected
                      ? "bg-[var(--accent-primary)] font-semibold text-[var(--accent-primary-fg)]"
                      : "hover:bg-[var(--bg-subtle)] text-[var(--text-primary)]"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import type { Locale } from "./messages";

export function toIntlLocale(locale: Locale): string {
  return locale === "id" ? "id-ID" : "en-US";
}

export function formatLocalizedDate(
  dateInput: string | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  },
  timeZone?: string
): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return String(dateInput);
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    ...options,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatLocalizedTime(
  dateInput: string | Date,
  locale: Locale,
  timeZone?: string
): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return String(dateInput);
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatLocalizedDateTime(
  dateInput: string | Date,
  locale: Locale,
  timeZone?: string
): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return String(dateInput);
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatLocalizedNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(toIntlLocale(locale), options).format(value);
}

export function formatLocalizedRelativeTime(
  dateInput: string | Date,
  locale: Locale,
  now: Date = new Date()
): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return String(dateInput);
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(toIntlLocale(locale), {
    numeric: "auto",
  });

  const absSec = Math.abs(diffSec);
  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, "day");
}

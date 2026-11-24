import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS classes cleanly without conflicting utility overrides.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats integer cents into a localized currency string for tabular display.
 */
export function formatCurrency(cents: number, currency = "USD", locale?: string) {
  const resolvedLocale = locale ?? (currency === "IDR" ? "id-ID" : "en-US");
  const isZeroDecimal = currency === "IDR" || currency === "JPY";
  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency,
    minimumFractionDigits: isZeroDecimal ? 0 : 2,
    maximumFractionDigits: isZeroDecimal ? 0 : 2,
  }).format(cents / 100);
}

/**
 * Returns a short display prefix for currency inputs (e.g. Rp, $, €, £).
 */
export function getCurrencyPrefix(currency = "IDR"): string {
  switch (currency.toUpperCase()) {
    case "IDR":
      return "Rp";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return currency.toUpperCase();
  }
}

/**
 * Keeps only digits and at most one decimal point for numeric currency inputs.
 */
export function sanitizeNumericCurrencyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) return cleaned;
  return cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, "");
}

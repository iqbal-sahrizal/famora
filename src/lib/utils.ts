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

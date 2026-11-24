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
  const resolvedLocale = currency === "IDR" ? "id-ID" : locale ?? "en-US";
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

/**
 * Formats a currency text input with thousand separators (e.g. 300.000 for IDR, 300,000.00 for USD).
 */
export function formatCurrencyInputWithSeparators(raw: string, currency = "IDR"): string {
  const isZeroDecimal = currency.toUpperCase() === "IDR" || currency.toUpperCase() === "JPY";
  if (isZeroDecimal) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const stripped = digits.replace(/^0+(?=\d)/, "");
    return stripped.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dotIdx = cleaned.indexOf(".");
  const wholeRaw = dotIdx === -1 ? cleaned : cleaned.slice(0, dotIdx);
  const whole = wholeRaw.replace(/^0+(?=\d)/, "");
  const wholeFormatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (dotIdx === -1) return wholeFormatted;
  const dec = cleaned.slice(dotIdx + 1).replace(/\./g, "").slice(0, 2);
  return `${wholeFormatted || "0"}.${dec}`;
}

/**
 * Converts a separator-formatted currency input back into a plain decimal string for submission.
 */
export function parseCurrencyInputToDecimal(formatted: string, currency = "IDR"): string {
  const isZeroDecimal = currency.toUpperCase() === "IDR" || currency.toUpperCase() === "JPY";
  if (isZeroDecimal) {
    return formatted.replace(/\D/g, "");
  }
  return formatted.replace(/,/g, "");
}

/**
 * Formats a stored decimal string (e.g. "300000.00") for display inside a currency input.
 */
export function formatDecimalStringForInput(decimalStr: string, currency = "IDR"): string {
  const num = Number.parseFloat(decimalStr);
  if (!Number.isFinite(num) || num <= 0) return "";
  const isZeroDecimal = currency.toUpperCase() === "IDR" || currency.toUpperCase() === "JPY";
  const normalized = isZeroDecimal ? String(Math.round(num)) : num.toFixed(2);
  return formatCurrencyInputWithSeparators(normalized, currency);
}

/**
 * Exact decimal money helpers using integer minor units (no floating-point arithmetic).
 */

const DECIMAL_REGEX = /^-?\d+(?:\.\d{1,2})?$/;

/**
 * Parses a decimal string (e.g. "125.50") into integer minor units (e.g. 12550n).
 * Throws if the string is not a valid 2-decimal monetary value.
 */
export function parseDecimalToMinorUnits(input: string): bigint {
  const trimmed = input.trim();
  if (!DECIMAL_REGEX.test(trimmed)) {
    throw new Error(`Invalid monetary amount: "${input}"`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fracPart = ""] = unsigned.split(".");
  const paddedFrac = (fracPart + "00").slice(0, 2);
  const minor = BigInt(wholePart) * 100n + BigInt(paddedFrac);
  return negative ? -minor : minor;
}

/**
 * Converts integer minor units into an exact 2-decimal string for PostgreSQL NUMERIC(18,2).
 */
export function minorUnitsToDecimalString(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/**
 * Formats a NUMERIC(18,2) string or bigint minor units into localized currency.
 */
export function formatNumericCurrency(
  decimalOrMinor: string | number | bigint,
  currency = "USD",
  locale?: string
): string {
  const minor =
    typeof decimalOrMinor === "bigint"
      ? decimalOrMinor
      : typeof decimalOrMinor === "number"
      ? BigInt(Math.round(decimalOrMinor * 100))
      : parseDecimalToMinorUnits(String(decimalOrMinor));

  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = Number(abs / 100n);
  const frac = Number(abs % 100n) / 100;
  const resolvedLocale = locale ?? (currency === "IDR" ? "id-ID" : "en-US");
  const isZeroDecimal = currency === "IDR" || currency === "JPY";
  const formatted = new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency,
    minimumFractionDigits: isZeroDecimal ? 0 : 2,
    maximumFractionDigits: isZeroDecimal ? 0 : 2,
  }).format(whole + frac);

  return negative ? `-${formatted}` : formatted;
}

export function sumDecimalStrings(values: string[]): string {
  const total = values.reduce(
    (acc, val) => acc + parseDecimalToMinorUnits(val),
    0n
  );
  return minorUnitsToDecimalString(total);
}

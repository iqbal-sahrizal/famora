import { minorUnitsToDecimalString, parseDecimalToMinorUnits } from "./money";

export interface BudgetProgressResult {
  spentNumeric: string;
  limitNumeric: string;
  remainingNumeric: string;
  percentUsed: number;
  alertState: "ok" | "warning" | "exceeded";
}

/**
 * Returns YYYY-MM-DD in the family's configured IANA timezone.
 */
export function getLocalDateInTimezone(
  timezone = "UTC",
  now: Date = new Date()
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone,
    }).formatToParts(now);

    const y = parts.find((p) => p.type === "year")?.value ?? "1970";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Computes exact budget progress using integer minor units (no float drift).
 */
export function computeBudgetProgress(params: {
  limitNumeric: string;
  alertThresholdPct: number;
  category: string;
  periodStart: string;
  periodEnd: string;
  transactions: Array<{
    kind: string;
    category: string;
    amountNumeric: string;
    occurredOn: string;
    isReversed: boolean;
  }>;
}): BudgetProgressResult {
  const limitMinor = parseDecimalToMinorUnits(params.limitNumeric);
  const spentMinor = params.transactions
    .filter(
      (tx) =>
        tx.kind === "expense" &&
        !tx.isReversed &&
        tx.category.toLowerCase() === params.category.toLowerCase() &&
        tx.occurredOn >= params.periodStart &&
        tx.occurredOn <= params.periodEnd
    )
    .reduce((sum, tx) => sum + parseDecimalToMinorUnits(tx.amountNumeric), 0n);

  const remainingMinor = limitMinor - spentMinor;
  const percentUsed =
    limitMinor > 0n ? Number((spentMinor * 100n) / limitMinor) : 0;

  let alertState: BudgetProgressResult["alertState"] = "ok";
  if (percentUsed >= 100) alertState = "exceeded";
  else if (percentUsed >= params.alertThresholdPct) alertState = "warning";

  return {
    spentNumeric: minorUnitsToDecimalString(spentMinor),
    limitNumeric: minorUnitsToDecimalString(limitMinor),
    remainingNumeric: minorUnitsToDecimalString(remainingMinor),
    percentUsed,
    alertState,
  };
}

export type ComputedBillStatus = "paid" | "overdue" | "due_soon" | "upcoming";

export function classifyBillStatus(params: {
  persistedStatus: "unpaid" | "paid";
  dueOn: string;
  todayLocalDate: string;
}): ComputedBillStatus {
  if (params.persistedStatus === "paid") return "paid";
  if (params.dueOn < params.todayLocalDate) return "overdue";

  const dueMs = new Date(`${params.dueOn}T00:00:00Z`).getTime();
  const todayMs = new Date(`${params.todayLocalDate}T00:00:00Z`).getTime();
  const diffDays = Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000));
  if (diffDays <= 5) return "due_soon";
  return "upcoming";
}

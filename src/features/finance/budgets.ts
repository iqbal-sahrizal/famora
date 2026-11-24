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

export const FINANCE_CATEGORY_SPECS = [
  { value: "Groceries", labelKey: "budgets.cat.groceries" },
  { value: "Utilities", labelKey: "budgets.cat.utilities" },
  { value: "Housing", labelKey: "budgets.cat.housing" },
  { value: "Transport", labelKey: "budgets.cat.transport" },
  { value: "Dining", labelKey: "budgets.cat.dining" },
  { value: "Health", labelKey: "budgets.cat.health" },
  { value: "Education", labelKey: "budgets.cat.education" },
  { value: "Subscriptions", labelKey: "budgets.cat.subscriptions" },
  { value: "Entertainment", labelKey: "budgets.cat.entertainment" },
  { value: "Shopping", labelKey: "budgets.cat.shopping" },
  { value: "Other", labelKey: "budgets.cat.other" },
] as const;

export type FinanceCategoryLabelKey = (typeof FINANCE_CATEGORY_SPECS)[number]["labelKey"];

/**
 * Builds localized category select options while preserving any custom existing categories.
 */
export function buildFinanceCategoryOptions(
  translate: (key: FinanceCategoryLabelKey) => string,
  existingCategories: string[] = []
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = FINANCE_CATEGORY_SPECS.map((spec) => ({
    value: spec.value,
    label: translate(spec.labelKey),
  }));
  const seen = new Set(options.map((o) => o.value.toLowerCase()));
  for (const raw of existingCategories) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    options.push({ value: trimmed, label: trimmed });
  }
  return options;
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

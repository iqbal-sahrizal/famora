import { minorUnitsToDecimalString, parseDecimalToMinorUnits } from "./money";

export interface AnalyticsTxInput {
  id: string;
  accountId?: string;
  accountName?: string;
  merchant: string;
  category: string;
  kind: "income" | "expense" | "transfer" | "reversal";
  amountNumeric: string;
  occurredOn: string;
  isReversed: boolean;
}

export interface PeriodSummary {
  incomeNumeric: string;
  expenseNumeric: string;
  netCashFlowNumeric: string;
}

export interface CategoryBreakdownItem {
  category: string;
  amountNumeric: string;
  sharePct: number;
}

export interface AccountBreakdownItem {
  accountName: string;
  amountNumeric: string;
  sharePct: number;
}

export interface MonthlyCashFlowPoint {
  monthKey: string;
  incomeNumeric: string;
  expenseNumeric: string;
  netNumeric: string;
}

export function filterTransactionsByDateRange(
  txs: AnalyticsTxInput[],
  startDate: string,
  endDate: string
): AnalyticsTxInput[] {
  return txs.filter(
    (t) => !t.isReversed && t.occurredOn >= startDate && t.occurredOn <= endDate
  );
}

export function computePeriodSummary(txs: AnalyticsTxInput[]): PeriodSummary {
  let incomeMinor = 0n;
  let expenseMinor = 0n;

  for (const tx of txs) {
    if (tx.isReversed) continue;
    const amt = parseDecimalToMinorUnits(tx.amountNumeric);
    if (tx.kind === "income") incomeMinor += amt;
    else if (tx.kind === "expense") expenseMinor += amt;
  }

  return {
    incomeNumeric: minorUnitsToDecimalString(incomeMinor),
    expenseNumeric: minorUnitsToDecimalString(expenseMinor),
    netCashFlowNumeric: minorUnitsToDecimalString(incomeMinor - expenseMinor),
  };
}

export function buildCategoryBreakdown(
  txs: AnalyticsTxInput[]
): CategoryBreakdownItem[] {
  const byCategory = new Map<string, bigint>();
  let totalExpense = 0n;

  for (const tx of txs) {
    if (tx.isReversed || tx.kind !== "expense") continue;
    const amt = parseDecimalToMinorUnits(tx.amountNumeric);
    totalExpense += amt;
    byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0n) + amt);
  }

  return Array.from(byCategory.entries())
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .map(([category, amt]) => ({
      category,
      amountNumeric: minorUnitsToDecimalString(amt),
      sharePct: totalExpense > 0n ? Number((amt * 100n) / totalExpense) : 0,
    }));
}

export function buildAccountExpenseBreakdown(
  txs: AnalyticsTxInput[],
  monthKey?: string | null
): AccountBreakdownItem[] {
  const byAccount = new Map<string, bigint>();
  let totalExpense = 0n;

  for (const tx of txs) {
    if (tx.isReversed || tx.kind !== "expense") continue;
    if (monthKey && !tx.occurredOn.startsWith(monthKey)) continue;
    const label = tx.accountName?.trim() || "Akun";
    const amt = parseDecimalToMinorUnits(tx.amountNumeric);
    totalExpense += amt;
    byAccount.set(label, (byAccount.get(label) ?? 0n) + amt);
  }

  return Array.from(byAccount.entries())
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .map(([accountName, amt]) => ({
      accountName,
      amountNumeric: minorUnitsToDecimalString(amt),
      sharePct: totalExpense > 0n ? Number((amt * 100n) / totalExpense) : 0,
    }));
}

export function buildMonthlyCashFlow(
  txs: AnalyticsTxInput[]
): MonthlyCashFlowPoint[] {
  const map = new Map<string, { income: bigint; expense: bigint }>();

  for (const tx of txs) {
    if (tx.isReversed || (tx.kind !== "income" && tx.kind !== "expense")) continue;
    const monthKey = tx.occurredOn.slice(0, 7);
    const entry = map.get(monthKey) ?? { income: 0n, expense: 0n };
    const amt = parseDecimalToMinorUnits(tx.amountNumeric);
    if (tx.kind === "income") entry.income += amt;
    else entry.expense += amt;
    map.set(monthKey, entry);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, val]) => ({
      monthKey,
      incomeNumeric: minorUnitsToDecimalString(val.income),
      expenseNumeric: minorUnitsToDecimalString(val.expense),
      netNumeric: minorUnitsToDecimalString(val.income - val.expense),
    }));
}

function escapeCsvCell(raw: string): string {
  // Neutralize spreadsheet formula injection (=, +, -, @)
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportTransactionsCsv(txs: AnalyticsTxInput[]): string {
  const header = ["Date", "Merchant", "Category", "Kind", "Amount"].join(",");
  const rows = txs
    .filter((t) => !t.isReversed)
    .map((t) =>
      [
        escapeCsvCell(t.occurredOn),
        escapeCsvCell(t.merchant),
        escapeCsvCell(t.category),
        escapeCsvCell(t.kind),
        escapeCsvCell(t.amountNumeric),
      ].join(",")
    );
  return [header, ...rows].join("\n");
}

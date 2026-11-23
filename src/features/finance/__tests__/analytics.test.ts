import { describe, expect, it, vi } from "vitest";
import {
  buildCategoryBreakdown,
  buildMonthlyCashFlow,
  computePeriodSummary,
  exportTransactionsCsv,
  filterTransactionsByDateRange,
  type AnalyticsTxInput,
} from "../analytics";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockPerms: Array<{ permission_key: string }> = [];
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: vi.fn(async () => ({ data: mockPerms, error: null })),
  })),
}));

import { getAnalyticsPageData } from "../analytics-server";

const KNOWN_DATASET: AnalyticsTxInput[] = [
  { id: "1", merchant: "Payroll", category: "Salary", kind: "income", amountNumeric: "5000.00", occurredOn: "2026-10-15", isReversed: false },
  { id: "2", merchant: "Market", category: "Groceries", kind: "expense", amountNumeric: "400.00", occurredOn: "2026-10-20", isReversed: false },
  { id: "3", merchant: "Payroll", category: "Salary", kind: "income", amountNumeric: "5000.00", occurredOn: "2026-11-01", isReversed: false },
  { id: "4", merchant: "Whole Foods", category: "Groceries", kind: "expense", amountNumeric: "600.00", occurredOn: "2026-11-05", isReversed: false },
  { id: "5", merchant: "Electric Co", category: "Utilities", kind: "expense", amountNumeric: "200.00", occurredOn: "2026-11-10", isReversed: false },
  { id: "6", merchant: "Void Charge", category: "Utilities", kind: "expense", amountNumeric: "999.00", occurredOn: "2026-11-12", isReversed: true },
  { id: "7", merchant: "=SUM(A1)", category: "Other", kind: "expense", amountNumeric: "50.00", occurredOn: "2026-11-15", isReversed: false },
];

describe("Famora Financial Analytics & Goals", () => {
  it("computes exact period summaries, category breakdowns, and monthly cash flow against known dataset", () => {
    const novTxs = filterTransactionsByDateRange(KNOWN_DATASET, "2026-11-01", "2026-11-30");
    const summary = computePeriodSummary(novTxs);
    expect(summary.incomeNumeric).toBe("5000.00");
    expect(summary.expenseNumeric).toBe("850.00");
    expect(summary.netCashFlowNumeric).toBe("4150.00");

    const categories = buildCategoryBreakdown(novTxs);
    expect(categories[0]).toEqual({ category: "Groceries", amountNumeric: "600.00", sharePct: 70 });
    expect(categories[1]).toEqual({ category: "Utilities", amountNumeric: "200.00", sharePct: 23 });

    const cashFlow = buildMonthlyCashFlow(KNOWN_DATASET);
    expect(cashFlow).toEqual([
      { monthKey: "2026-10", incomeNumeric: "5000.00", expenseNumeric: "400.00", netNumeric: "4600.00" },
      { monthKey: "2026-11", incomeNumeric: "5000.00", expenseNumeric: "850.00", netNumeric: "4150.00" },
    ]);
  });

  it("neutralizes spreadsheet formula injection in CSV exports and excludes reversed rows", () => {
    const csv = exportTransactionsCsv(KNOWN_DATASET);
    expect(csv).not.toContain("Void Charge");
    expect(csv).toContain("\"'=SUM(A1)\"");
  });

  it("blocks unauthorized roles from viewing analytics data", async () => {
    mockPerms = [{ permission_key: "family.members.view" }];
    const res = await getAnalyticsPageData("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(res.authorized).toBe(false);
    expect(res.transactions).toEqual([]);
  });
});

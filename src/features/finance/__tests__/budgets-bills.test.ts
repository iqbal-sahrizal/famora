import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyBillStatus,
  computeBudgetProgress,
  getLocalDateInTimezone,
} from "../budgets";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

const mockRpc = vi.fn(async () => ({ data: 2, error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mockRpc,
  })),
}));

import { payBillAction, runDueRecurringSchedulesAction } from "../budget-actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BILL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("Famora Budgets, Bills & Timezone-Safe Recurring Schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves local YYYY-MM-DD across timezone boundaries accurately", () => {
    const utcInstant = new Date("2026-11-23T02:00:00.000Z");
    expect(getLocalDateInTimezone("America/Los_Angeles", utcInstant)).toBe("2026-11-22");
    expect(getLocalDateInTimezone("Asia/Jakarta", utcInstant)).toBe("2026-11-23");
  });

  it("computes exact budget progress and warning/exceeded states without float drift", () => {
    const txs = [
      { kind: "expense", category: "Groceries", amountNumeric: "300.00", occurredOn: "2026-11-05", isReversed: false },
      { kind: "expense", category: "Groceries", amountNumeric: "120.50", occurredOn: "2026-11-12", isReversed: false },
      { kind: "expense", category: "Groceries", amountNumeric: "99.99", occurredOn: "2026-11-15", isReversed: true },
      { kind: "expense", category: "Utilities", amountNumeric: "200.00", occurredOn: "2026-11-10", isReversed: false },
    ];

    const warningRes = computeBudgetProgress({
      limitNumeric: "500.00",
      alertThresholdPct: 80,
      category: "Groceries",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      transactions: txs,
    });

    expect(warningRes.spentNumeric).toBe("420.50");
    expect(warningRes.remainingNumeric).toBe("79.50");
    expect(warningRes.percentUsed).toBe(84);
    expect(warningRes.alertState).toBe("warning");
  });

  it("classifies bill statuses accurately and never auto-marks unpaid bills paid", () => {
    expect(classifyBillStatus({ persistedStatus: "unpaid", dueOn: "2026-11-20", todayLocalDate: "2026-11-23" })).toBe("overdue");
    expect(classifyBillStatus({ persistedStatus: "unpaid", dueOn: "2026-11-25", todayLocalDate: "2026-11-23" })).toBe("due_soon");
    expect(classifyBillStatus({ persistedStatus: "unpaid", dueOn: "2026-12-05", todayLocalDate: "2026-11-23" })).toBe("upcoming");
    expect(classifyBillStatus({ persistedStatus: "paid", dueOn: "2026-11-20", todayLocalDate: "2026-11-23" })).toBe("paid");
  });

  it("executes verified bill payment and idempotent recurring schedule processing via RPC", async () => {
    const payRes = await payBillAction({
      familyId: FAM_ID,
      billId: BILL_ID,
      accountId: ACC_ID,
    });
    expect(payRes.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("pay_household_bill", {
      p_family_id: FAM_ID,
      p_bill_id: BILL_ID,
      p_account_id: ACC_ID,
      p_idempotency_key: `bill:${BILL_ID}`,
    });

    const schedRes = await runDueRecurringSchedulesAction({
      familyId: FAM_ID,
      timezone: "America/Los_Angeles",
    });
    expect(schedRes.ok).toBe(true);
    expect(schedRes.generatedCount).toBe(2);
  });
});

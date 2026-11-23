import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatNumericCurrency,
  minorUnitsToDecimalString,
  parseDecimalToMinorUnits,
  sumDecimalStrings,
} from "../money";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockPerms: Array<{ permission_key: string }> = [
  { permission_key: "finance.accounts.manage" },
  { permission_key: "finance.transactions.manage" },
];
let mockAccountArchived = false;
const updatedAccounts: Array<Record<string, unknown>> = [];

const mockRpc = vi.fn(async (fn: string) => {
  if (fn === "get_my_family_permissions") {
    return { data: mockPerms, error: null };
  }
  return { data: "tx-1", error: null };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "mem-1" } }),
        };
      }
      if (table === "finance_accounts") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [] }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "acc-1", is_archived: mockAccountArchived },
            error: null,
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedAccounts.push(payload);
            return {
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "acc-1" },
                error: null,
              }),
            };
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { currency_code: "USD" } }),
      };
    }),
  })),
}));

import {
  archiveFinanceAccountAction,
  recordFinanceTransactionAction,
  reverseFinanceTransactionAction,
  updateFinanceAccountAction,
} from "../actions";
import { getFinancePageData } from "../server";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACC_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACC_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TX_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("Famora Family Finance — Exact Decimal Math, Atomicity & Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccountArchived = false;
    updatedAccounts.length = 0;
    mockPerms = [
      { permission_key: "finance.accounts.manage" },
      { permission_key: "finance.transactions.manage" },
    ];
  });

  it("performs exact decimal arithmetic without floating-point drift (0.10 + 0.20 = 0.30)", () => {
    const sum = sumDecimalStrings(["0.10", "0.20"]);
    expect(sum).toBe("0.30");

    const large = sumDecimalStrings(["999999999.99", "0.01"]);
    expect(large).toBe("1000000000.00");

    expect(parseDecimalToMinorUnits("-42.50")).toBe(-4250n);
    expect(minorUnitsToDecimalString(123456n)).toBe("1234.56");
    expect(formatNumericCurrency("1234.56", "USD")).toBe("$1,234.56");
  });

  it("rejects invalid or non-positive transaction amounts", async () => {
    const zeroRes = await recordFinanceTransactionAction({
      familyId: FAM_ID,
      accountId: ACC_A,
      kind: "expense",
      amount: "0.00",
      merchant: "Test",
      category: "General",
      occurredOn: "2026-11-23",
      notes: "",
      transferAccountId: null,
      attachmentName: null,
    });
    expect(zeroRes.ok).toBe(false);

    expect(() => parseDecimalToMinorUnits("12.345")).toThrow();
  });

  it("records transfers atomically with idempotency keys via RPC", async () => {
    const res = await recordFinanceTransactionAction({
      familyId: FAM_ID,
      accountId: ACC_A,
      kind: "transfer",
      amount: "250.00",
      merchant: "Monthly Savings Transfer",
      category: "Transfer",
      occurredOn: "2026-11-23",
      notes: "To emergency fund",
      transferAccountId: ACC_B,
      attachmentName: null,
      idempotencyKey: "idem-key-123456",
    });

    expect(res.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith(
      "record_finance_transaction",
      expect.objectContaining({
        p_kind: "transfer",
        p_amount: "250.00",
        p_transfer_account_id: ACC_B,
        p_idempotency_key: "idem-key-123456",
      })
    );
  });

  it("executes safe reversals without deleting original records", async () => {
    const res = await reverseFinanceTransactionAction({
      familyId: FAM_ID,
      transactionId: TX_ID,
      reason: "Duplicate charge",
    });

    expect(res.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("reverse_finance_transaction", {
      p_family_id: FAM_ID,
      p_transaction_id: TX_ID,
      p_reason: "Duplicate charge",
    });
  });

  it("denies financial data access to child and guest accounts", async () => {
    mockPerms = [{ permission_key: "family.members.view" }];
    const data = await getFinancePageData(FAM_ID);
    expect(data.authorized).toBe(false);
    expect(data.accounts).toEqual([]);
    expect(data.transactions).toEqual([]);
  });

  it("updates finance account details when authorized and rejects unauthorized users", async () => {
    const okRes = await updateFinanceAccountAction({
      familyId: FAM_ID,
      accountId: ACC_A,
      name: "Updated Checking",
      accountKind: "bank",
      ownershipScope: "family",
      monthlyBudget: "1500.00",
    });
    expect(okRes.ok).toBe(true);
    expect(updatedAccounts).toHaveLength(1);
    expect(updatedAccounts[0].name).toBe("Updated Checking");
    expect(updatedAccounts[0].monthly_budget_numeric).toBe("1500.00");

    mockPerms = [{ permission_key: "finance.transactions.manage" }];
    const deniedRes = await updateFinanceAccountAction({
      familyId: FAM_ID,
      accountId: ACC_A,
      name: "Blocked",
      accountKind: "bank",
      ownershipScope: "family",
      monthlyBudget: "0.00",
    });
    expect(deniedRes.ok).toBe(false);
    expect(deniedRes.error).toContain("finance.accounts.manage");
  });

  it("archives and restores finance accounts without deleting history and blocks new transactions on archived accounts", async () => {
    const archiveRes = await archiveFinanceAccountAction({
      familyId: FAM_ID,
      accountId: ACC_A,
      archive: true,
    });
    expect(archiveRes.ok).toBe(true);
    expect(updatedAccounts.at(-1)?.is_archived).toBe(true);

    mockAccountArchived = true;
    const txRes = await recordFinanceTransactionAction({
      familyId: FAM_ID,
      accountId: ACC_A,
      kind: "expense",
      amount: "10.00",
      merchant: "Coffee",
      category: "Dining",
      occurredOn: "2026-11-23",
      notes: "",
      transferAccountId: null,
      attachmentName: null,
    });
    expect(txRes.ok).toBe(false);
    expect(txRes.error).toContain("archived");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const queriedTables: string[] = [];
let mockPermissions: Array<{ permission_key: string }> = [];
let mockRoleKey = "owner";

const mockSupabase = {
  rpc: vi.fn(async () => ({ data: mockPermissions, error: null })),
  from: vi.fn((table: string) => {
    queriedTables.push(table);
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
      maybeSingle: vi.fn().mockResolvedValue({
        data:
          table === "families"
            ? {
                id: "fam-1",
                name: "The Rivera Family",
                description: "Home base",
                timezone: "UTC",
                currency_code: "USD",
              }
            : table === "profiles"
            ? { full_name: "Maya Rivera", default_timezone: "UTC" }
            : null,
      }),
    };

    if (table === "family_members") {
      chain.eq = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: "mem-1",
              user_id: "user-1",
              display_name: "Maya",
              is_managed_child: mockRoleKey === "child",
              family_roles: { role_key: mockRoleKey },
            },
          ],
        }),
      });
    }

    if (table === "finance_accounts") {
      chain.eq = vi.fn().mockResolvedValue({
        data: [
          {
            balance_cents: 428050,
            monthly_budget_cents: 320000,
            currency_code: "USD",
          },
        ],
      });
    }

    return chain;
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase),
}));

import { getFamilyDashboardData, getTimeOfDayGreeting } from "../server";

describe("Famora Family Dashboard Personalization & Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queriedTables.length = 0;
  });

  it("never queries or exposes financial data to child or guest roles", async () => {
    mockRoleKey = "child";
    mockPermissions = [
      { permission_key: "family.members.view" },
      { permission_key: "safety.sos.trigger" },
    ];

    const payload = await getFamilyDashboardData("fam-1", "user-1");

    expect(payload.financeSummary).toBeNull();
    expect(queriedTables).not.toContain("finance_accounts");
    expect(queriedTables).not.toContain("finance_transactions");
  });

  it("loads financial summary for authorized owner/admin roles", async () => {
    mockRoleKey = "owner";
    mockPermissions = [
      { permission_key: "finance.accounts.manage" },
      { permission_key: "finance.transactions.manage" },
      { permission_key: "audit_logs.view" },
    ];

    const payload = await getFamilyDashboardData("fam-1", "user-1");

    expect(payload.financeSummary).not.toBeNull();
    expect(payload.financeSummary?.totalBalanceCents).toBe(428050);
    expect(queriedTables).toContain("finance_accounts");
    expect(queriedTables).toContain("finance_transactions");
  });

  it("computes timezone-aware personalized greetings", () => {
    const morningUtc = new Date("2026-11-22T09:00:00Z");
    const eveningUtc = new Date("2026-11-22T20:00:00Z");

    expect(getTimeOfDayGreeting("UTC", morningUtc)).toBe("Good morning");
    expect(getTimeOfDayGreeting("UTC", eveningUtc)).toBe("Good evening");
  });
});

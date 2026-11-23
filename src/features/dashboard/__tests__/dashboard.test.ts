import { beforeEach, describe, expect, it, vi } from "vitest";

const queriedTables: string[] = [];
let mockPermissions: Array<{ permission_key: string }> = [];
const taskUpdates: Array<Record<string, unknown>> = [];
let mockTaskRows: Array<Record<string, unknown>> = [];
let mockRoleKey = "owner";
let mockActorMember: { id: string } | null = { id: "mem-1" };
let mockSingleTask: { id: string; assigned_member_id: string | null } | null = {
  id: "11111111-1111-4111-8111-111111111111",
  assigned_member_id: "mem-1",
};
let mockTaskAssignee: { task_id: string } | null = null;

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
      const membersResult = {
        data: [
          {
            id: "mem-1",
            user_id: "user-1",
            display_name: "Maya",
            is_managed_child: mockRoleKey === "child",
            family_roles: { role_key: mockRoleKey },
          },
        ],
      };
      chain.eq = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          then: (resolve: (val: typeof membersResult) => unknown) =>
            Promise.resolve(membersResult).then(resolve),
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn(async () => ({ data: mockActorMember })),
          }),
        }),
      });
    }

    if (table === "tasks") {
      chain.limit = vi.fn().mockResolvedValue({ data: mockTaskRows });
      chain.maybeSingle = vi.fn(async () => ({ data: mockSingleTask }));
      (chain as Record<string, unknown>).update = vi.fn((payload: Record<string, unknown>) => {
        taskUpdates.push(payload);
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      });
    }

    if (table === "task_assignees") {
      chain.maybeSingle = vi.fn(async () => ({ data: mockTaskAssignee }));
    }

    if (table === "task_history") {
      (chain as Record<string, unknown>).insert = vi.fn().mockResolvedValue({ error: null });
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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase),
}));

import { getFamilyDashboardData, getTimeOfDayGreeting } from "../server";
import { quickCompleteTaskAction } from "../actions";

describe("Famora Family Dashboard Personalization & Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queriedTables.length = 0;
    taskUpdates.length = 0;
    mockTaskRows = [];
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

  it("flags tasks assigned to the current member and supports quick completion", async () => {
    mockRoleKey = "owner";
    mockPermissions = [{ permission_key: "tasks.manage_all" }];
    mockTaskRows = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Pay water bill",
        status: "todo",
        priority: "high",
        due_at: null,
        points_value: 10,
        assigned_member_id: "mem-1",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Water plants",
        status: "todo",
        priority: "normal",
        due_at: null,
        points_value: 0,
        assigned_member_id: null,
      },
    ];

    const payload = await getFamilyDashboardData("fam-1", "user-1");
    expect(payload.pendingTasks[0]?.isAssignedToMe).toBe(true);
    expect(payload.pendingTasks[1]?.isAssignedToMe).toBe(false);

    const res = await quickCompleteTaskAction({
      familyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      taskId: "11111111-1111-4111-8111-111111111111",
    });
    expect(res.ok).toBe(true);
    expect(taskUpdates).toHaveLength(1);
    expect(taskUpdates[0]?.status).toBe("done");
  });

  it("rejects quickCompleteTaskAction for non-members, missing tasks, and unauthorized non-assignees", async () => {
    mockPermissions = [];
    mockActorMember = null;
    const nonMemberRes = await quickCompleteTaskAction({
      familyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      taskId: "11111111-1111-4111-8111-111111111111",
    });
    expect(nonMemberRes.ok).toBe(false);

    mockActorMember = { id: "mem-1" };
    mockSingleTask = null;
    const missingTaskRes = await quickCompleteTaskAction({
      familyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      taskId: "11111111-1111-4111-8111-111111111111",
    });
    expect(missingTaskRes.ok).toBe(false);

    mockSingleTask = {
      id: "11111111-1111-4111-8111-111111111111",
      assigned_member_id: "mem-other",
    };
    mockTaskAssignee = null;
    const unauthorizedRes = await quickCompleteTaskAction({
      familyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      taskId: "11111111-1111-4111-8111-111111111111",
    });
    expect(unauthorizedRes.ok).toBe(false);
    expect(taskUpdates).toHaveLength(0);
  });
});

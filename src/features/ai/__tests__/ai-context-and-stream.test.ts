import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/types/domain";

const selectedQueries: Array<{ table: string; columns: string }> = [];
const insertedUsageLogs: Array<Record<string, unknown>> = [];
let mockUser: { id: string } | null = { id: "user-1" };
let mockPerms: Array<{ permission_key: PermissionKey }> = [
  { permission_key: "ai.assistant.use" },
  { permission_key: "finance.transactions.manage" },
];
let mockUsageCount = 0;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mockUser } })),
    },
    rpc: vi.fn(async (fn: string) => {
      if (fn === "get_my_family_permissions") {
        return { data: mockPerms, error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string) => {
        selectedQueries.push({ table, columns });
        if (table === "ai_usage_logs") {
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({
                    count: mockUsageCount,
                    error: null,
                  }),
                }),
                gte: vi.fn().mockResolvedValue({
                  count: mockUsageCount,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "family_members") {
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "mem-1", display_name: "Maya" },
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "families") {
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { name: "Sahrizal Family" },
              }),
            }),
          };
        }
        if (table === "calendar_events") {
          return {
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ title: "Dentist", start_at: "2026-11-24T09:00:00Z" }],
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "tasks") {
          return {
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
            }),
          };
        }
        if (table === "shopping_items" || table === "recipes") {
          return {
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data:
                  table === "recipes"
                    ? [{ title: "Soto Ayam", dietary_tags: ["dinner"] }]
                    : [],
              }),
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          };
        }
        if (table === "habits") {
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          };
        }
        if (table === "activity_logs") {
          return {
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          };
        }
        if (table === "finance_transactions") {
          return {
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: [
                  { kind: "expense", amount_numeric: "125.50", amount_cents: 0 },
                  { kind: "income", amount_numeric: "500.00", amount_cents: 0 },
                ],
              }),
            }),
          };
        }
        if (table === "household_bills") {
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        title: "Internet",
                        due_on: "2026-11-28",
                        amount_numeric: "45.00",
                      },
                    ],
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        if (table === "ai_usage_logs") {
          insertedUsageLogs.push(payload);
          return Promise.resolve({ error: null });
        }
        if (table === "ai_conversations" || table === "ai_messages") {
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: table === "ai_conversations" ? "conv-1" : "msg-1" },
                error: null,
              }),
            }),
            then: (resolve: (v: { error: null }) => void) =>
              Promise.resolve({ error: null }).then(resolve),
          };
        }
        return Promise.resolve({ error: null });
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })),
  })),
}));

import { retrieveAuthorizedFamilyContext } from "../context";
import { POST } from "@/app/api/ai/stream/route";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("P0 — AI Context Schema Alignment & Usage Logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedQueries.length = 0;
    insertedUsageLogs.length = 0;
    mockUser = { id: "user-1" };
    mockPerms = [
      { permission_key: "ai.assistant.use" },
      { permission_key: "finance.transactions.manage" },
    ];
    mockUsageCount = 0;
  });

  it("queries actual schema columns (start_at, dietary_tags, kind, amount_numeric) and skips finance when unauthorized", async () => {
    const ctx = await retrieveAuthorizedFamilyContext({
      familyId: FAM_ID,
      memberName: "Maya",
      permissions: new Set<PermissionKey>([
        "ai.assistant.use",
        "finance.transactions.manage",
      ]),
    });

    expect(ctx.calendarEvents).toEqual([
      { title: "Dentist", startsAt: "2026-11-24T09:00:00Z" },
    ]);
    expect(ctx.recipes).toEqual([{ title: "Soto Ayam", category: "dinner" }]);
    expect(ctx.financeSummary).toEqual({
      authorized: true,
      monthlyExpenseCents: 12550,
      monthlyIncomeCents: 50000,
      unpaidBills: [{ title: "Internet", dueOn: "2026-11-28", amountCents: 4500 }],
    });

    expect(selectedQueries).toContainEqual({
      table: "calendar_events",
      columns: "title, start_at",
    });
    expect(selectedQueries).toContainEqual({
      table: "recipes",
      columns: "title, dietary_tags",
    });
    expect(selectedQueries).toContainEqual({
      table: "household_bills",
      columns: "title, due_on, amount_numeric",
    });

    selectedQueries.length = 0;
    const restrictedCtx = await retrieveAuthorizedFamilyContext({
      familyId: FAM_ID,
      memberName: "Child",
      permissions: new Set<PermissionKey>(["ai.assistant.use"]),
    });
    expect(restrictedCtx.financeSummary.authorized).toBe(false);
    expect(selectedQueries.some((q) => q.table === "finance_transactions")).toBe(
      false
    );
  });

  it("records a single ai_usage_logs entry on stream success and rate limit, and blocks unauthorized callers", async () => {
    const unauthRes = await POST(
      new Request("http://localhost/api/ai/stream", {
        method: "POST",
        body: JSON.stringify({ familyId: FAM_ID, prompt: "What is on today?" }),
      })
    );
    mockUser = null;
    expect(unauthRes.status).toBe(200);
    expect(insertedUsageLogs).toHaveLength(1);
    expect(insertedUsageLogs[0]?.status).toBe("ok");

    const anonRes = await POST(
      new Request("http://localhost/api/ai/stream", {
        method: "POST",
        body: JSON.stringify({ familyId: FAM_ID, prompt: "What is on today?" }),
      })
    );
    expect(anonRes.status).toBe(401);

    mockUser = { id: "user-1" };
    mockUsageCount = 999;
    insertedUsageLogs.length = 0;
    const rlRes = await POST(
      new Request("http://localhost/api/ai/stream", {
        method: "POST",
        body: JSON.stringify({ familyId: FAM_ID, prompt: "What is on today?" }),
      })
    );
    expect(rlRes.status).toBe(429);
    expect(insertedUsageLogs).toHaveLength(1);
    expect(insertedUsageLogs[0]?.status).toBe("rate_limited");
  });
});

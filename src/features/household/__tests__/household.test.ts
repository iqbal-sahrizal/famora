import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockPerms: Array<{ permission_key: string }> = [
  { permission_key: "inventory.manage" },
  { permission_key: "meals.manage" },
  { permission_key: "home.manage" },
];

const insertedNotifications: Array<Record<string, unknown>> = [];
const insertedShopping: Array<Record<string, unknown>> = [];
const insertedCalendar: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: vi.fn(async () => ({ data: mockPerms, error: null })),
    from: vi.fn((table: string) => {
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: "mem-1" } }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "inventory_items") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { name: "Olive Oil", quantity: 2, min_threshold: 1 },
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "inventory_movements") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "notifications") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            insertedNotifications.push(row);
            return { error: null };
          }),
        };
      }
      if (table === "shopping_items") {
        return {
          insert: vi.fn(async (rows: Array<Record<string, unknown>> | Record<string, unknown>) => {
            insertedShopping.push(...(Array.isArray(rows) ? rows : [rows]));
            return { error: null };
          }),
        };
      }
      if (table === "calendar_events") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedCalendar.push(row);
            return {
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "cal-1" } }),
              }),
            };
          }),
        };
      }
      if (table === "home_maintenance_tasks") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    }),
  })),
}));

import {
  adjustInventoryAction,
  createMaintenanceTaskAction,
  syncMealIngredientsToShoppingAction,
} from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Famora Household — Inventory, Meal Planning & Home Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedNotifications.length = 0;
    insertedShopping.length = 0;
    insertedCalendar.length = 0;
    mockPerms = [
      { permission_key: "inventory.manage" },
      { permission_key: "meals.manage" },
      { permission_key: "home.manage" },
    ];
  });

  it("triggers low-stock notification when inventory adjustment hits threshold", async () => {
    const res = await adjustInventoryAction({
      familyId: FAM_ID,
      itemId: ITEM_ID,
      delta: -1,
      reason: "consumed",
    });

    expect(res.ok).toBe(true);
    expect(insertedNotifications).toHaveLength(1);
    expect(insertedNotifications[0].domain).toBe("inventory");
  });

  it("syncs recipe ingredients directly into Shopping List", async () => {
    const res = await syncMealIngredientsToShoppingAction({
      familyId: FAM_ID,
      ingredients: [
        { name: "Pasta", quantity: "1", unit: "pack" },
        { name: "Garlic", quantity: "2", unit: "pcs" },
      ],
    });

    expect(res.ok).toBe(true);
    expect(insertedShopping).toHaveLength(2);
    expect(insertedShopping[0].name).toBe("Pasta");
  });

  it("creates home maintenance task with Calendar event and Notification reminder", async () => {
    const res = await createMaintenanceTaskAction({
      familyId: FAM_ID,
      assetId: null,
      providerId: null,
      title: "Replace HVAC Filter",
      intervalDays: 90,
      nextDueOn: "2026-12-15",
      syncToCalendar: true,
    });

    expect(res.ok).toBe(true);
    expect(insertedCalendar).toHaveLength(1);
    expect(insertedNotifications).toHaveLength(1);
    expect(insertedNotifications[0].domain).toBe("home");
  });
});

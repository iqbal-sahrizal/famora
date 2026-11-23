import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createQueuedShoppingMutation,
  flushShoppingMutations,
} from "../offline-queue";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

const upsertedItems: Array<Record<string, unknown>> = [];
const insertedItems: Array<Record<string, unknown>> = [];
const historyUpserts: Array<Record<string, unknown>> = [];
const updatedLists: Array<Record<string, unknown>> = [];
const deletedListIds: string[] = [];
let mockPerms: Array<{ permission_key: string }> = [{ permission_key: "shopping.manage" }];
let mockListFound = true;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: vi.fn(async (fn: string) => {
      if (fn === "get_my_family_permissions") {
        return { data: mockPerms, error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === "shopping_lists") {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedLists.push(payload);
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: mockListFound ? { id: "list-1" } : null,
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }),
          delete: vi.fn(() => ({
            eq: vi.fn((_col: string, val: string) => {
              deletedListIds.push(val);
              return {
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: mockListFound ? { id: val } : null,
                      error: null,
                    }),
                  }),
                }),
              };
            }),
          })),
        };
      }
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
      if (table === "shopping_items") {
        return {
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            upsertedItems.push(payload);
            return { error: null };
          }),
          insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            insertedItems.push(...(Array.isArray(rows) ? rows : [rows]));
            return { error: null };
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      name: "Oat Milk",
                      category: "Dairy",
                      quantity: "2",
                      unit: "pcs",
                      estimated_price_cents: 450,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "shopping_item_history") {
        return {
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            historyUpserts.push(payload);
            return { error: null };
          }),
        };
      }
      if (table === "shopping_templates") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    items_jsonb: [
                      { name: "Eggs", category: "Dairy", quantity: "12", unit: "pcs" },
                      { name: "Sourdough", category: "Groceries", quantity: "1", unit: "loaf" },
                    ],
                  },
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  })),
}));

import {
  addShoppingItemAction,
  applyShoppingTemplateAction,
  deleteShoppingListAction,
  toggleShoppingCheckAction,
  updateShoppingListAction,
} from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TPL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LIST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("Famora Shopping Lists — Collaboration, Idempotency & Offline Queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertedItems.length = 0;
    insertedItems.length = 0;
    historyUpserts.length = 0;
    updatedLists.length = 0;
    deletedListIds.length = 0;
    mockPerms = [{ permission_key: "shopping.manage" }];
    mockListFound = true;
  });

  it("supports idempotent item creation via clientMutationId", async () => {
    const res = await addShoppingItemAction({
      familyId: FAM_ID,
      listId: null,
      name: "Oat Milk",
      category: "Dairy",
      quantity: "2",
      unit: "pcs",
      estimatedPriceCents: 450,
      notes: "",
      assignedShopperMemberId: null,
      clientMutationId: "mut-12345678",
    });

    expect(res.ok).toBe(true);
    expect(upsertedItems).toHaveLength(1);
    expect(upsertedItems[0].client_mutation_id).toBe("mut-12345678");
  });

  it("records checked-off items into shopping_item_history", async () => {
    const res = await toggleShoppingCheckAction({
      familyId: FAM_ID,
      itemId: ITEM_ID,
      isChecked: true,
    });

    expect(res.ok).toBe(true);
    expect(historyUpserts).toHaveLength(1);
    expect(historyUpserts[0].item_name).toBe("Oat Milk");
  });

  it("applies shopping templates into the active list", async () => {
    const res = await applyShoppingTemplateAction({
      familyId: FAM_ID,
      listId: null,
      templateId: TPL_ID,
    });

    expect(res.ok).toBe(true);
    expect(insertedItems).toHaveLength(2);
    expect(insertedItems[0].name).toBe("Eggs");
  });

  it("creates family-scoped offline mutations and flushes cleanly", async () => {
    const m = createQueuedShoppingMutation(FAM_ID, "add_item", { name: "Apples" });
    expect(m.familyId).toBe(FAM_ID);
    expect(m.id.length).toBeGreaterThan(10);

    const result = await flushShoppingMutations(FAM_ID, async () => true);
    expect(result).toEqual({ flushed: 0, remaining: 0 });
  });

  it("updates a shopping list when user has shopping.manage permission", async () => {
    const res = await updateShoppingListAction({
      familyId: FAM_ID,
      listId: LIST_ID,
      name: "Weekend Costco Run",
      storeName: "Costco",
      assignedShopperMemberId: null,
    });

    expect(res.ok).toBe(true);
    expect(updatedLists).toHaveLength(1);
    expect(updatedLists[0].name).toBe("Weekend Costco Run");
    expect(updatedLists[0].store_name).toBe("Costco");
  });

  it("rejects shopping list update and delete without shopping.manage permission", async () => {
    mockPerms = [{ permission_key: "family.members.view" }];

    const updateRes = await updateShoppingListAction({
      familyId: FAM_ID,
      listId: LIST_ID,
      name: "Renamed",
      storeName: "",
      assignedShopperMemberId: null,
    });
    expect(updateRes.ok).toBe(false);
    expect(updateRes.error).toContain("permission");
    expect(updatedLists).toHaveLength(0);

    const deleteRes = await deleteShoppingListAction({
      familyId: FAM_ID,
      listId: LIST_ID,
    });
    expect(deleteRes.ok).toBe(false);
    expect(deleteRes.error).toContain("permission");
    expect(deletedListIds).toHaveLength(0);
  });

  it("deletes a shopping list and returns an error if not found", async () => {
    const okRes = await deleteShoppingListAction({
      familyId: FAM_ID,
      listId: LIST_ID,
    });
    expect(okRes.ok).toBe(true);
    expect(deletedListIds).toEqual([LIST_ID]);

    mockListFound = false;
    const missingRes = await deleteShoppingListAction({
      familyId: FAM_ID,
      listId: LIST_ID,
    });
    expect(missingRes.ok).toBe(false);
    expect(missingRes.error).toContain("not found");
  });
});

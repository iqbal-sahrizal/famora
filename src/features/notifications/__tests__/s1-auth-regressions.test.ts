import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockActorId: string | null = "mem-actor";
let mockRoleKey = "adult";
let mockPerms: Array<{ permission_key: string }> = [];
let mockAnnouncementAuthorId = "mem-other";
let mockOutboxRecipientId = "mem-other";

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
                  maybeSingle: vi.fn(async () => ({
                    data: mockActorId
                      ? { id: mockActorId, family_roles: { role_key: mockRoleKey } }
                      : null,
                  })),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "family_announcements") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn(async () => ({
                  data: { author_member_id: mockAnnouncementAuthorId },
                })),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn(async () => ({ data: { id: "ann-1" }, error: null })),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "notification_outbox") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: "outbox-1",
                    family_id: FAM_ID,
                    notification_id: "notif-1",
                    recipient_member_id: mockOutboxRecipientId,
                    recipient_user_id: "user-other",
                    channel: "push",
                    payload: { title: "Hi", body: "Msg", url: "/" },
                    status: "failed",
                    attempts: 1,
                    max_attempts: 5,
                  },
                })),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  })),
}));

import { toggleAnnouncementArchiveAction } from "@/features/noticeboard/actions";
import { retryOutboxDispatchAction } from "@/features/notifications/actions";
import {
  addShoppingItemAction,
  createShoppingListAction,
  updateShoppingQuantityAction,
} from "@/features/shopping/actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("S1 Authorization & Isolation Regressions (BUG-023, BUG-025, BUG-038)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActorId = "mem-actor";
    mockRoleKey = "adult";
    mockPerms = [];
    mockAnnouncementAuthorId = "mem-other";
    mockOutboxRecipientId = "mem-other";
  });

  it("BUG-023: prevents non-author adult from archiving another member's announcement", async () => {
    mockPerms = [{ permission_key: "announcements.publish" }];
    const res = await toggleAnnouncementArchiveAction({
      familyId: FAM_ID,
      announcementId: TARGET_ID,
      isArchived: true,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("author or an admin/owner");

    // Admin/owner is allowed
    mockRoleKey = "admin";
    const adminRes = await toggleAnnouncementArchiveAction({
      familyId: FAM_ID,
      announcementId: TARGET_ID,
      isArchived: true,
    });
    expect(adminRes.ok).toBe(true);
  });

  it("BUG-025: prevents retrying another member's notification outbox item", async () => {
    mockOutboxRecipientId = "mem-other";
    const res = await retryOutboxDispatchAction({
      familyId: FAM_ID,
      outboxId: TARGET_ID,
    });
    expect(res.ok).toBe(false);
    expect("status" in res ? res.status : undefined).toBe("forbidden");
  });

  it("BUG-038: blocks shopping mutations when member lacks shopping.manage or is not active member", async () => {
    mockPerms = [{ permission_key: "family.members.view" }];

    const listRes = await createShoppingListAction({
      familyId: FAM_ID,
      name: "Weekly",
      storeName: "",
      assignedShopperMemberId: null,
    });
    expect(listRes.ok).toBe(false);

    const addRes = await addShoppingItemAction({
      familyId: FAM_ID,
      listId: null,
      name: "Milk",
      category: "Groceries",
      quantity: "1",
      unit: "pcs",
      estimatedPriceCents: 0,
      notes: "",
      assignedShopperMemberId: null,
    });
    expect(addRes.ok).toBe(false);

    const qtyRes = await updateShoppingQuantityAction({
      familyId: FAM_ID,
      itemId: TARGET_ID,
      quantity: "2",
    });
    expect(qtyRes.ok).toBe(false);

    mockActorId = null;
    mockPerms = [{ permission_key: "shopping.manage" }];
    const nonMemberRes = await updateShoppingQuantityAction({
      familyId: FAM_ID,
      itemId: TARGET_ID,
      quantity: "2",
    });
    expect(nonMemberRes.ok).toBe(false);
  });
});

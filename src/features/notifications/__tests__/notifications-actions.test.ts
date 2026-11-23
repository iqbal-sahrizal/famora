import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockActor: { id: string } | null = { id: "mem-1" };
let mockDeletedRow: { id: string } | null = { id: "notif-1" };
const eqCalls: Array<[string, string]> = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockActor }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "notifications") {
        const chain = {
          eq: vi.fn((col: string, val: string) => {
            eqCalls.push([col, val]);
            return chain;
          }),
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: mockDeletedRow,
              error: null,
            }),
          }),
        };
        return {
          delete: vi.fn(() => chain),
        };
      }
      return {};
    }),
  })),
}));

import { deleteNotificationAction } from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOTIF_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Notifications — Delete Notification Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor = { id: "mem-1" };
    mockDeletedRow = { id: NOTIF_ID };
    eqCalls.length = 0;
  });

  it("deletes notification strictly scoped to family_id and recipient_member_id", async () => {
    const res = await deleteNotificationAction({
      familyId: FAM_ID,
      notificationId: NOTIF_ID,
    });

    expect(res.ok).toBe(true);
    expect(eqCalls).toEqual([
      ["id", NOTIF_ID],
      ["family_id", FAM_ID],
      ["recipient_member_id", "mem-1"],
    ]);
  });

  it("rejects non-members and returns not found when notification belongs to another recipient", async () => {
    mockActor = null;
    const nonMember = await deleteNotificationAction({
      familyId: FAM_ID,
      notificationId: NOTIF_ID,
    });
    expect(nonMember.ok).toBe(false);
    expect(nonMember.error).toContain("membership");

    mockActor = { id: "mem-1" };
    mockDeletedRow = null;
    const otherRecipient = await deleteNotificationAction({
      familyId: FAM_ID,
      notificationId: NOTIF_ID,
    });
    expect(otherRecipient.ok).toBe(false);
    expect(otherRecipient.error).toContain("not found");
  });
});

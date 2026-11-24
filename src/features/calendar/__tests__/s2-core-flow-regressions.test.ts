import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EV_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MEM_A = "11111111-1111-4111-8111-111111111111";
const MEM_B = "22222222-2222-4222-8222-222222222222";

const insertedParticipants: Array<Record<string, unknown>> = [];
const insertedNotifications: Array<Record<string, unknown>> = [];
let mockPerms: Array<{ permission_key: string }> = [
  { permission_key: "calendar.family.manage" },
];

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
                  maybeSingle: vi.fn(async () => ({ data: { id: MEM_A } })),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "calendar_events") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn(async () => ({ data: { id: EV_ID }, error: null })),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn(async () => ({ data: { id: EV_ID }, error: null })),
            }),
          }),
        };
      }
      if (table === "calendar_event_participants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn(async () => ({
              data: [
                { member_id: MEM_A, rsvp_status: "accepted" },
                { member_id: MEM_B, rsvp_status: "accepted" },
              ],
            })),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn(async () => ({ error: null })),
          }),
          insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            insertedParticipants.push(...rows);
            return { error: null };
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            insertedNotifications.push(...rows);
            return { error: null };
          }),
        };
      }
      if (table.startsWith("child_")) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn(async () => ({ data: [] })),
            }),
          }),
        };
      }
      return {};
    }),
  })),
}));

import { saveCalendarEventAction } from "../actions";
import { getChildDevPageData } from "@/features/child-dev/server";

describe("S2 Core Flow Regressions (BUG-007, BUG-018)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedParticipants.length = 0;
    insertedNotifications.length = 0;
    mockPerms = [{ permission_key: "calendar.family.manage" }];
  });

  it("BUG-007: preserves existing participant RSVP statuses and avoids duplicate reminders when editing an event", async () => {
    const res = await saveCalendarEventAction({
      familyId: FAM_ID,
      eventId: EV_ID,
      title: "Updated Dinner",
      description: "Bring dessert",
      location: "Home",
      startAt: "2026-12-01T18:00:00.000Z",
      endAt: "2026-12-01T20:00:00.000Z",
      allDay: false,
      eventTimezone: "Asia/Jakarta",
      visibility: "family",
      category: "family",
      colorToken: "forest",
      recurrenceRule: null,
      recurrenceUntil: null,
      reminderMinutes: 30,
      participantMemberIds: [MEM_A, MEM_B],
    });

    expect(res.ok).toBe(true);
    const memB = insertedParticipants.find((p) => p.member_id === MEM_B);
    expect(memB?.rsvp_status).toBe("accepted");
    expect(insertedNotifications).toHaveLength(0);
  });

  it("BUG-018: separates canManageProfiles (child_dev.manage) from canManageGrowthMilestones", async () => {
    mockPerms = [
      { permission_key: "child_dev.identity.view" },
      { permission_key: "child_dev.growth_milestones.manage" },
    ];
    const withoutManage = await getChildDevPageData(FAM_ID);
    expect(withoutManage.canManageGrowthMilestones).toBe(true);
    expect(withoutManage.canManageProfiles).toBe(false);

    mockPerms.push({ permission_key: "child_dev.manage" });
    const withManage = await getChildDevPageData(FAM_ID);
    expect(withManage.canManageProfiles).toBe(true);
  });
});

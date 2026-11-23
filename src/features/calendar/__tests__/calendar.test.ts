import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  expandCalendarEvents,
  formatInTimezone,
  type CalendarEventRecord,
} from "../recurrence";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockPerms: Array<{ permission_key: string }> = [
  { permission_key: "calendar.family.manage" },
];
const insertedNotifications: Array<Record<string, unknown>> = [];

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
      if (table === "calendar_events") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "ev-new" }, error: null }),
            }),
          }),
        };
      }
      if (table === "calendar_event_participants") {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
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
      return {};
    }),
  })),
}));

import { cancelCalendarEventAction, saveCalendarEventAction } from "../actions";

const BASE_EVENT: CalendarEventRecord = {
  id: "ev-1",
  title: "Weekly Piano Lesson",
  description: "",
  location: "Studio",
  startAt: "2026-11-01T16:00:00.000Z",
  endAt: "2026-11-01T17:00:00.000Z",
  allDay: false,
  eventTimezone: "America/Los_Angeles",
  visibility: "family",
  category: "family",
  colorToken: "sage",
  recurrenceRule: "weekly",
  recurrenceUntil: "2026-11-22T23:59:59.000Z",
  reminderMinutes: 30,
  status: "scheduled",
  createdByMemberId: "mem-1",
  participants: [],
};

describe("Famora Calendar — Recurrence, Date Boundaries & Permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedNotifications.length = 0;
    mockPerms = [{ permission_key: "calendar.family.manage" }];
  });

  it("expands weekly recurring events up to recurrenceUntil and preserves duration", () => {
    const occs = expandCalendarEvents(
      [BASE_EVENT],
      new Date("2026-11-01T00:00:00.000Z"),
      new Date("2026-11-30T23:59:59.000Z")
    );

    expect(occs).toHaveLength(4); // Nov 1, Nov 8, Nov 15, Nov 22
    expect(occs[0].occurrenceStartAt).toBe("2026-11-01T16:00:00.000Z");
    expect(occs[0].occurrenceEndAt).toBe("2026-11-01T17:00:00.000Z");
    expect(occs[3].occurrenceStartAt).toBe("2026-11-22T16:00:00.000Z");
  });

  it("handles month-end recurrence (Jan 31 -> Feb 28) and excludes cancelled events", () => {
    const monthlyEvent: CalendarEventRecord = {
      ...BASE_EVENT,
      id: "ev-monthly",
      startAt: "2026-01-31T10:00:00.000Z",
      endAt: "2026-01-31T11:00:00.000Z",
      recurrenceRule: "monthly",
      recurrenceUntil: null,
    };
    const cancelledEvent: CalendarEventRecord = {
      ...BASE_EVENT,
      id: "ev-cancelled",
      status: "cancelled",
    };

    const occs = expandCalendarEvents(
      [monthlyEvent, cancelledEvent],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-03-31T23:59:59.000Z")
    );

    expect(occs.map((o) => o.occurrenceStartAt.slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("includes events that start before rangeStart but span across the date boundary", () => {
    const multiDay: CalendarEventRecord = {
      ...BASE_EVENT,
      id: "ev-span",
      recurrenceRule: null,
      startAt: "2026-11-10T22:00:00.000Z",
      endAt: "2026-11-11T04:00:00.000Z",
    };

    const occs = expandCalendarEvents(
      [multiDay],
      new Date("2026-11-11T00:00:00.000Z"),
      new Date("2026-11-11T23:59:59.000Z")
    );

    expect(occs).toHaveLength(1);
    expect(occs[0].id).toBe("ev-span");
  });

  it("formats timestamps accurately in target timezone", () => {
    const formatted = formatInTimezone(
      "2026-11-15T16:00:00.000Z",
      "America/Los_Angeles",
      { hour: "numeric", minute: "2-digit", hour12: true }
    );
    expect(formatted).toContain("8:00");
  });

  it("blocks unauthorized members from creating calendar events and schedules notifications when permitted", async () => {
    mockPerms = [{ permission_key: "family.members.view" }];
    const denied = await saveCalendarEventAction({
      familyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Family Dinner",
      description: "",
      location: "Home",
      startAt: "2026-11-25T18:00:00.000Z",
      endAt: "2026-11-25T19:00:00.000Z",
      allDay: false,
      eventTimezone: "UTC",
      visibility: "family",
      category: "family",
      colorToken: "forest",
      recurrenceRule: null,
      recurrenceUntil: null,
      reminderMinutes: 30,
      participantMemberIds: [],
    });
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("calendar.family.manage");

    mockPerms = [{ permission_key: "calendar.family.manage" }];
    const allowed = await saveCalendarEventAction({
      familyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Family Dinner",
      description: "",
      location: "Home",
      startAt: "2026-11-25T18:00:00.000Z",
      endAt: "2026-11-25T19:00:00.000Z",
      allDay: false,
      eventTimezone: "UTC",
      visibility: "family",
      category: "family",
      colorToken: "forest",
      recurrenceRule: null,
      recurrenceUntil: null,
      reminderMinutes: 30,
      participantMemberIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    });
    expect(allowed.ok).toBe(true);
    expect(insertedNotifications).toHaveLength(1);
    expect(insertedNotifications[0].domain).toBe("calendar");

    mockPerms = [];
    const cancelDenied = await cancelCalendarEventAction({
      familyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      eventId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    expect(cancelDenied.ok).toBe(false);
    expect(cancelDenied.error).toContain("permission");
  });
});

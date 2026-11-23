import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockPerms: Array<{ permission_key: string }> = [
  { permission_key: "tasks.manage_all" },
];
const insertedTasks: Array<Record<string, unknown>> = [];
const insertedAssignees: Array<Record<string, unknown>> = [];
const insertedNotifications: Array<Record<string, unknown>> = [];
const insertedHistory: Array<Record<string, unknown>> = [];

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
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: "cal-1" } }),
            }),
          }),
        };
      }
      if (table === "tasks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    title: "Take out trash",
                    description: "",
                    category: "chores",
                    priority: "normal",
                    due_at: "2026-11-23T17:00:00.000Z",
                    points_value: 15,
                    recurrence_rule: "weekly",
                    assigned_member_id: "mem-1",
                  },
                }),
              }),
            }),
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            insertedTasks.push(payload);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "task-1" },
                  error: null,
                }),
              }),
            };
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      if (table === "task_assignees") {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            insertedAssignees.push(...rows);
            return { error: null };
          }),
        };
      }
      if (table === "task_subtasks") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "notifications") {
        return {
          insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            insertedNotifications.push(...rows);
            return { error: null };
          }),
        };
      }
      if (table === "task_history") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            insertedHistory.push(row);
            return { error: null };
          }),
        };
      }
      return {};
    }),
  })),
}));

import { saveTaskAction, toggleTaskStatusAction } from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEM_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEM_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("Famora Family Tasks — Authorization, Integrations & Recurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedTasks.length = 0;
    insertedAssignees.length = 0;
    insertedNotifications.length = 0;
    insertedHistory.length = 0;
    mockPerms = [{ permission_key: "tasks.manage_all" }];
  });

  it("blocks unauthorized members from creating tasks", async () => {
    mockPerms = [{ permission_key: "family.members.view" }];
    const res = await saveTaskAction({
      familyId: FAM_ID,
      title: "Clean garage",
      description: "",
      category: "chores",
      priority: "normal",
      dueAt: null,
      pointsValue: 10,
      recurrenceRule: null,
      assigneeMemberIds: [],
      subtasks: [],
      syncToCalendar: false,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("tasks.manage_all");
  });

  it("creates a multi-assignee task, syncs to calendar, notifies assignees, and logs history", async () => {
    const res = await saveTaskAction({
      familyId: FAM_ID,
      title: "Pack camping gear",
      description: "Tents and flashlights",
      category: "household",
      priority: "high",
      dueAt: "2026-11-28T17:00:00.000Z",
      pointsValue: 0,
      recurrenceRule: null,
      assigneeMemberIds: [MEM_A, MEM_B],
      subtasks: ["Check batteries", "Pack sleeping bags"],
      syncToCalendar: true,
    });

    expect(res.ok).toBe(true);
    expect(insertedTasks[0].calendar_event_id).toBe("cal-1");
    expect(insertedAssignees).toHaveLength(2);
    expect(insertedNotifications).toHaveLength(2);
    expect(insertedHistory[0].event_type).toBe("task.created");
  });

  it("spawns the next recurring occurrence when a recurring task is completed", async () => {
    const res = await toggleTaskStatusAction({
      familyId: FAM_ID,
      taskId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      nextStatus: "done",
    });

    expect(res.ok).toBe(true);
    expect(insertedTasks).toHaveLength(1);
    expect(insertedTasks[0].due_at).toBe("2026-11-30T17:00:00.000Z");
    expect(insertedHistory[0].event_type).toBe("status.done");
  });
});

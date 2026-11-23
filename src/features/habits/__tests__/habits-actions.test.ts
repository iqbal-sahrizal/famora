import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockActor: { id: string } | null = { id: "mem-1" };
let mockPerms: Array<{ permission_key: string }> = [];
let mockHabit: { id: string; owner_member_id: string | null } | null = {
  id: "hab-1",
  owner_member_id: "mem-1",
};
const updatedHabits: Array<Record<string, unknown>> = [];

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
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockActor }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "habits") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockHabit, error: null }),
              }),
            }),
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedHabits.push(payload);
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }),
        };
      }
      return {};
    }),
  })),
}));

import { updateHabitAction } from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HABIT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Habits — Update Habit Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor = { id: "mem-1" };
    mockPerms = [];
    mockHabit = { id: HABIT_ID, owner_member_id: "mem-1" };
    updatedHabits.length = 0;
  });

  it("allows the habit owner to update habit details", async () => {
    const res = await updateHabitAction({
      familyId: FAM_ID,
      habitId: HABIT_ID,
      category: "reading",
      title: "Read 25 pages",
      description: "Before bedtime",
      cadence: "daily",
      targetPerPeriod: 25,
      targetUnit: "pages",
      reminderTime: "21:00",
    });

    expect(res.ok).toBe(true);
    expect(updatedHabits).toHaveLength(1);
    expect(updatedHabits[0].title).toBe("Read 25 pages");
    expect(updatedHabits[0].target_per_period).toBe(25);
  });

  it("blocks non-owners without habits.manage_all and allows managers", async () => {
    mockHabit = { id: HABIT_ID, owner_member_id: "mem-other" };
    const denied = await updateHabitAction({
      familyId: FAM_ID,
      habitId: HABIT_ID,
      category: "exercise",
      title: "Morning Run",
      cadence: "daily",
      targetPerPeriod: 1,
      targetUnit: "times",
    });
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("authorized");
    expect(updatedHabits).toHaveLength(0);

    mockPerms = [{ permission_key: "habits.manage_all" }];
    const allowed = await updateHabitAction({
      familyId: FAM_ID,
      habitId: HABIT_ID,
      category: "exercise",
      title: "Morning Run",
      cadence: "daily",
      targetPerPeriod: 1,
      targetUnit: "times",
    });
    expect(allowed.ok).toBe(true);
    expect(updatedHabits).toHaveLength(1);
  });
});

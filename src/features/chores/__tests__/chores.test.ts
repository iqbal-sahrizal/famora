import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockPerms: Array<{ permission_key: string }> = [];
const mockRpc = vi.fn(async (fn: string) => {
  if (fn === "get_my_family_permissions") {
    return { data: mockPerms, error: null };
  }
  return { data: true, error: null };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: "mem-1" } }),
            }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
}));

import {
  createChoreTemplateAction,
  redeemRewardAction,
  reviewChoreSubmissionAction,
  submitChoreCompletionAction,
} from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("Famora Chores & Rewards — Approvals & Anti-Manipulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPerms = [];
  });

  it("blocks child accounts from creating chores or approving their own submissions", async () => {
    mockPerms = [{ permission_key: "child_dev.rewards.redeem" }];

    const createRes = await createChoreTemplateAction({
      familyId: FAM_ID,
      title: "Fake chore",
      description: "",
      defaultPoints: 1000,
      scheduleRule: "once",
      category: "household",
      assignedMemberId: null,
    });
    expect(createRes.ok).toBe(false);
    expect(createRes.error).toContain("tasks.approve_chores");

    const approveRes = await reviewChoreSubmissionAction({
      familyId: FAM_ID,
      submissionId: SUB_ID,
      approved: true,
      note: "",
    });
    expect(approveRes.ok).toBe(false);
    expect(approveRes.error).toContain("tasks.approve_chores");
  });

  it("allows child to submit chore completion and parent to approve via RPC", async () => {
    const submitRes = await submitChoreCompletionAction({
      familyId: FAM_ID,
      templateId: null,
      title: "Make bed",
      pointsValue: 10,
      note: "All tidy!",
    });
    expect(submitRes.ok).toBe(true);

    mockPerms = [{ permission_key: "tasks.approve_chores" }];
    const approveRes = await reviewChoreSubmissionAction({
      familyId: FAM_ID,
      submissionId: SUB_ID,
      approved: true,
      note: "Great work!",
    });
    expect(approveRes.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("approve_chore_submission", {
      p_submission_id: SUB_ID,
      p_approved: true,
      p_note: "Great work!",
    });
  });

  it("delegates reward redemption to balance-verifying RPC", async () => {
    const res = await redeemRewardAction({
      familyId: FAM_ID,
      rewardId: REW_ID,
    });
    expect(res.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("redeem_family_reward", {
      p_family_id: FAM_ID,
      p_reward_id: REW_ID,
    });
  });
});

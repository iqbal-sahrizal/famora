import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUser = { id: "user-1", email: "maya@famora.app" };

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => mockUser),
}));

const mockRpc = vi.fn();
const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });

const mockFrom = vi.fn((table: string): Record<string, unknown> => {
  if (table === "family_members") {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "member-1" } }),
    };
  }
  if (table === "member_preferences") {
    return { upsert: mockUpsert };
  }
  if (table === "family_roles") {
    return {
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({
        data: [{ id: "role-adult", role_key: "adult" }],
      }),
    };
  }
  if (table === "family_invitations") {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      insert: mockInsert,
    };
  }
  if (table === "families") {
    return {
      update: vi.fn(() => ({ eq: mockUpdateEq })),
    };
  }
  return {};
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

import {
  acceptInvitationOnboardingAction,
  completeOnboardingAction,
  createFamilyOnboardingAction,
  sendOnboardingInvitesAction,
} from "../actions";
import { getOnboardingStateForUser } from "../server";

describe("Famora Family Onboarding Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a family atomically via RPC and saves preferences", async () => {
    mockRpc.mockResolvedValue({ data: "fam-123", error: null });

    const res = await createFamilyOnboardingAction({
      identity: { name: "The Rivera Family", description: "Home base" },
      preferences: {
        timezone: "America/Los_Angeles",
        currencyCode: "USD",
        themeMode: "light",
      },
    });

    expect(res.ok).toBe(true);
    expect(res.data?.familyId).toBe("fam-123");
    expect(mockRpc).toHaveBeenCalledWith("create_family_with_owner", {
      p_name: "The Rivera Family",
      p_description: "Home base",
      p_timezone: "America/Los_Angeles",
      p_currency_code: "USD",
      p_avatar_path: null,
    });
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("deduplicates repeated invitation emails in the same onboarding batch", async () => {
    const res = await sendOnboardingInvitesAction({
      familyId: "fam-123",
      invites: [
        { email: "daniel@famora.app", roleKey: "adult" },
        { email: "DANIEL@famora.app", roleKey: "adult" },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.data?.sentCount).toBe(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("completes onboarding and returns the family dashboard route", async () => {
    const res = await completeOnboardingAction("fam-123");
    expect(res.ok).toBe(true);
    expect(res.data?.redirectTo).toBe("/f/fam-123");
  });

  it("detects interrupted onboarding (onboarding_completed_at = null) for resume", async () => {
    const queryResult = {
      data: [
        {
          family_id: "fam-incomplete",
          family_roles: { role_key: "owner" },
          families: {
            id: "fam-incomplete",
            name: "Interrupted Family",
            slug: "interrupted-family",
            description: "",
            timezone: "UTC",
            currency_code: "USD",
            onboarding_completed_at: null,
            deleted_at: null,
          },
        },
      ],
      error: null,
    };

    mockFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(queryResult),
        }),
      }),
    }));

    const state = await getOnboardingStateForUser("user-1");
    expect(state.incompleteFamily?.familyId).toBe("fam-incomplete");
    expect(state.incompleteFamily?.name).toBe("Interrupted Family");

    const invalidTokenRes = await acceptInvitationOnboardingAction({ token: "short" });
    expect(invalidTokenRes.ok).toBe(false);
  });
});

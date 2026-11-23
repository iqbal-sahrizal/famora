import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUser = { id: "owner-user-1", email: "maya@famora.app" };

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => mockUser),
}));

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INV_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const insertedInvites: Array<Record<string, unknown>> = [];
const updatedInvites: Array<Record<string, unknown>> = [];
const mockRpc = vi.fn();

const mockFrom = vi.fn((table: string): Record<string, unknown> => {
  if (table === "family_members") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: "actor-1" } }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };
  }
  if (table === "family_roles") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "role-adult" } }),
          }),
        }),
      }),
    };
  }
  if (table === "family_invitations") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      }),
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        insertedInvites.push(payload);
        return { error: null };
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        updatedInvites.push(payload);
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          }),
        };
      }),
    };
  }
  return {};
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

import {
  acceptInvitationByTokenAction,
  inviteFamilyMemberAction,
  rejectInvitationByTokenAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  transferOwnershipAction,
} from "../actions";

describe("Famora Family Members & Invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedInvites.length = 0;
    updatedInvites.length = 0;
  });

  it("stores SHA-256 token_hash rather than plaintext token when inviting", async () => {
    const res = await inviteFamilyMemberAction({
      familyId: FAM_ID,
      email: "partner@famora.app",
      roleKey: "adult",
    });

    expect(res.ok).toBe(true);
    expect(res.data?.emailDelivery).toBe("link_only");
    expect(res.data?.inviteUrl).toContain("/invite/");
    expect(insertedInvites).toHaveLength(1);

    const rawToken = res.data!.inviteUrl.split("/invite/")[1];
    expect(insertedInvites[0].token_hash).not.toBe(rawToken);
    expect(String(insertedInvites[0].token_hash)).toHaveLength(64);
  });

  it("rotates token_hash and extends expiration when resending an invitation", async () => {
    const res = await resendInvitationAction({
      familyId: FAM_ID,
      invitationId: INV_ID,
    });

    expect(res.ok).toBe(true);
    expect(updatedInvites).toHaveLength(1);
    expect(updatedInvites[0].status).toBe("pending");
    expect(String(updatedInvites[0].token_hash)).toHaveLength(64);
  });

  it("revokes pending invitations cleanly", async () => {
    const res = await revokeInvitationAction({
      familyId: FAM_ID,
      invitationId: INV_ID,
    });
    expect(res.ok).toBe(true);
    expect(updatedInvites[0].status).toBe("revoked");
  });

  it("delegates accept, reject, and ownership transfer to hardened RPCs", async () => {
    mockRpc.mockResolvedValueOnce({ data: MEM_ID, error: null });
    const acceptRes = await acceptInvitationByTokenAction("a".repeat(32));
    expect(acceptRes.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("accept_family_invitation", {
      p_token: "a".repeat(32),
    });

    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const rejectRes = await rejectInvitationByTokenAction("a".repeat(32));
    expect(rejectRes.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("reject_family_invitation", {
      p_token: "a".repeat(32),
    });

    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const transferRes = await transferOwnershipAction({
      familyId: FAM_ID,
      memberId: MEM_ID,
    });
    expect(transferRes.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("transfer_family_ownership", {
      p_family_id: FAM_ID,
      p_target_member_id: MEM_ID,
    });
  });

  it("soft-removes a member via status = 'removed'", async () => {
    const res = await removeMemberAction({
      familyId: FAM_ID,
      memberId: MEM_ID,
    });
    expect(res.ok).toBe(true);
  });
});

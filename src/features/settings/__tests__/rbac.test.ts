import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canModifyMemberRole,
  hasFamilyPermission,
  type MemberSecurityContext,
} from "@/lib/security/permissions";
import type { FamilyRole, PermissionKey } from "@/types/domain";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

const mockRpc = vi.fn();
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: mockUpdateEq })),
    })),
  })),
}));

import {
  updateFamilyPrivacyAction,
  updateMemberPermissionOverrideAction,
} from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_MEM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeCtx(role: FamilyRole): MemberSecurityContext {
  return {
    familyId: FAM_ID,
    targetFamilyId: FAM_ID,
    role,
    status: "active",
    isManagedChild: role === "child",
  };
}

describe("Famora RBAC — All Default Roles vs. Protected Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const matrixExpectations: Array<{
    role: FamilyRole;
    expected: Record<
      | "family.delete"
      | "family.settings.manage"
      | "family.members.invite_manage"
      | "finance.accounts.manage"
      | "finance.transactions.manage"
      | "documents.sensitive_vault"
      | "memories.manage"
      | "safety.sos.trigger",
      boolean
    >;
  }> = [
    {
      role: "owner",
      expected: {
        "family.delete": true,
        "family.settings.manage": true,
        "family.members.invite_manage": true,
        "finance.accounts.manage": true,
        "finance.transactions.manage": true,
        "documents.sensitive_vault": true,
        "memories.manage": true,
        "safety.sos.trigger": true,
      },
    },
    {
      role: "admin",
      expected: {
        "family.delete": false,
        "family.settings.manage": true,
        "family.members.invite_manage": true,
        "finance.accounts.manage": true,
        "finance.transactions.manage": true,
        "documents.sensitive_vault": true,
        "memories.manage": true,
        "safety.sos.trigger": true,
      },
    },
    {
      role: "adult",
      expected: {
        "family.delete": false,
        "family.settings.manage": false,
        "family.members.invite_manage": false,
        "finance.accounts.manage": false,
        "finance.transactions.manage": true,
        "documents.sensitive_vault": false,
        "memories.manage": true,
        "safety.sos.trigger": true,
      },
    },
    {
      role: "child",
      expected: {
        "family.delete": false,
        "family.settings.manage": false,
        "family.members.invite_manage": false,
        "finance.accounts.manage": false,
        "finance.transactions.manage": false,
        "documents.sensitive_vault": false,
        "memories.manage": false,
        "safety.sos.trigger": true,
      },
    },
    {
      role: "extended", // Guest
      expected: {
        "family.delete": false,
        "family.settings.manage": false,
        "family.members.invite_manage": false,
        "finance.accounts.manage": false,
        "finance.transactions.manage": false,
        "documents.sensitive_vault": false,
        "memories.manage": false,
        "safety.sos.trigger": true,
      },
    },
  ];

  it.each(matrixExpectations)(
    "enforces exact permission matrix for role: $role",
    ({ role, expected }) => {
      const ctx = makeCtx(role);
      for (const [perm, allowed] of Object.entries(expected)) {
        expect(hasFamilyPermission(ctx, perm as PermissionKey)).toBe(allowed);
      }
    }
  );

  it("blocks non-permitted members from updating family privacy settings on the server", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ permission_key: "family.members.view" }],
      error: null,
    });

    const res = await updateFamilyPrivacyAction({
      familyId: FAM_ID,
      allowMemberDirectory: false,
      requireMfaForVault: true,
      allowGuestMemories: false,
      childKioskEnabled: false,
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("Missing permission: family.settings.manage");
  });

  it("allows permitted admins/owners to update family privacy settings", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ permission_key: "family.settings.manage" }],
      error: null,
    });

    const res = await updateFamilyPrivacyAction({
      familyId: FAM_ID,
      allowMemberDirectory: true,
      requireMfaForVault: true,
      allowGuestMemories: true,
      childKioskEnabled: true,
    });

    expect(res.ok).toBe(true);
  });

  it("delegates member overrides to set_member_permission_override RPC and protects owner transitions", async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const res = await updateMemberPermissionOverrideAction({
      familyId: FAM_ID,
      memberId: TARGET_MEM_ID,
      permissionKey: "finance.transactions.manage",
      effect: "deny",
    });

    expect(res.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("set_member_permission_override", {
      p_family_id: FAM_ID,
      p_target_member_id: TARGET_MEM_ID,
      p_permission_key: "finance.transactions.manage",
      p_effect: "deny",
    });

    expect(
      canModifyMemberRole({
        actorContext: makeCtx("admin"),
        currentTargetRole: "owner",
        nextTargetRole: "adult",
      })
    ).toBe(false);
  });
});

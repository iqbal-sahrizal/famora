import { describe, expect, it } from "vitest";
import {
  canModifyMemberRole,
  hasFamilyPermission,
  type MemberSecurityContext,
} from "../permissions";
import { createInvitationToken, hashInvitationToken } from "../tokens";

const FAM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FAM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Famora Security & Permission Resolution", () => {
  it("blocks unauthenticated (null) context", () => {
    expect(hasFamilyPermission(null, "family.members.view")).toBe(false);
  });

  it("prevents cross-family access even for an owner", () => {
    const ownerInA: MemberSecurityContext = {
      familyId: FAM_A,
      targetFamilyId: FAM_B,
      role: "owner",
      status: "active",
      isManagedChild: false,
    };
    expect(hasFamilyPermission(ownerInA, "family.members.view")).toBe(false);
    expect(hasFamilyPermission(ownerInA, "finance.accounts.manage")).toBe(false);
  });

  it("blocks child and extended guest accounts from financial and sensitive resources", () => {
    const childCtx: MemberSecurityContext = {
      familyId: FAM_A,
      targetFamilyId: FAM_A,
      role: "child",
      status: "active",
      isManagedChild: true,
    };
    const guestCtx: MemberSecurityContext = {
      familyId: FAM_A,
      targetFamilyId: FAM_A,
      role: "extended",
      status: "active",
      isManagedChild: false,
    };

    expect(hasFamilyPermission(childCtx, "finance.accounts.manage")).toBe(false);
    expect(hasFamilyPermission(childCtx, "finance.transactions.manage")).toBe(false);
    expect(hasFamilyPermission(childCtx, "documents.sensitive_vault")).toBe(false);
    expect(hasFamilyPermission(guestCtx, "finance.accounts.manage")).toBe(false);
    expect(hasFamilyPermission(guestCtx, "documents.standard.manage")).toBe(false);
    expect(hasFamilyPermission(guestCtx, "chat.adults_only.participate")).toBe(false);
  });

  it("enforces explicit deny override over role default and blocks managed child allow escalation", () => {
    const adultDeniedFinance: MemberSecurityContext = {
      familyId: FAM_A,
      targetFamilyId: FAM_A,
      role: "adult",
      status: "active",
      isManagedChild: false,
      overrides: [{ permission: "finance.transactions.manage", effect: "deny" }],
    };
    expect(hasFamilyPermission(adultDeniedFinance, "finance.transactions.manage")).toBe(false);

    const managedChildWithAllow: MemberSecurityContext = {
      familyId: FAM_A,
      targetFamilyId: FAM_A,
      role: "child",
      status: "active",
      isManagedChild: true,
      overrides: [{ permission: "finance.accounts.manage", effect: "allow" }],
    };
    expect(hasFamilyPermission(managedChildWithAllow, "finance.accounts.manage")).toBe(false);
  });

  it("prevents unauthorized role escalation and protects owner transitions", () => {
    const childCtx: MemberSecurityContext = {
      familyId: FAM_A,
      targetFamilyId: FAM_A,
      role: "child",
      status: "active",
      isManagedChild: false,
    };
    const adminCtx: MemberSecurityContext = {
      familyId: FAM_A,
      targetFamilyId: FAM_A,
      role: "admin",
      status: "active",
      isManagedChild: false,
    };
    const ownerCtx: MemberSecurityContext = {
      familyId: FAM_A,
      targetFamilyId: FAM_A,
      role: "owner",
      status: "active",
      isManagedChild: false,
    };

    expect(
      canModifyMemberRole({
        actorContext: childCtx,
        currentTargetRole: "child",
        nextTargetRole: "owner",
      })
    ).toBe(false);

    expect(
      canModifyMemberRole({
        actorContext: adminCtx,
        currentTargetRole: "adult",
        nextTargetRole: "owner",
      })
    ).toBe(false);

    expect(
      canModifyMemberRole({
        actorContext: ownerCtx,
        currentTargetRole: "adult",
        nextTargetRole: "admin",
      })
    ).toBe(true);
  });

  it("hashes invitation tokens deterministically with SHA-256", () => {
    const { rawToken, tokenHash } = createInvitationToken();
    expect(rawToken.length).toBeGreaterThanOrEqual(32);
    expect(tokenHash).toBe(hashInvitationToken(rawToken));
    expect(tokenHash).not.toBe(rawToken);
  });
});

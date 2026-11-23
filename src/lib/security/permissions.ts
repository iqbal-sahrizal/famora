import type { FamilyRole, PermissionKey } from "@/types/domain";

const ROLE_DEFAULT_PERMISSIONS: Record<FamilyRole, ReadonlySet<PermissionKey>> = {
  owner: new Set<PermissionKey>([
    "family.delete",
    "family.settings.manage",
    "family.members.invite_manage",
    "family.members.view",
    "calendar.family.manage",
    "calendar.adults_only.view",
    "tasks.manage_all",
    "tasks.approve_chores",
    "finance.accounts.manage",
    "finance.transactions.manage",
    "finance.allowance.view_own",
    "child_dev.manage",
    "child_dev.rewards.redeem",
    "shopping.manage",
    "inventory.manage",
    "documents.standard.manage",
    "documents.sensitive_vault",
    "chat.family.participate",
    "chat.adults_only.participate",
    "meals.manage",
    "home.manage",
    "memories.manage",
    "habits.manage_all",
    "safety.contacts_medical.manage",
    "safety.sos.trigger",
    "ai.assistant.use",
    "audit_logs.view",
  ]),
  admin: new Set<PermissionKey>([
    "family.settings.manage",
    "family.members.invite_manage",
    "family.members.view",
    "calendar.family.manage",
    "calendar.adults_only.view",
    "tasks.manage_all",
    "tasks.approve_chores",
    "finance.accounts.manage",
    "finance.transactions.manage",
    "finance.allowance.view_own",
    "child_dev.manage",
    "child_dev.rewards.redeem",
    "shopping.manage",
    "inventory.manage",
    "documents.standard.manage",
    "documents.sensitive_vault",
    "chat.family.participate",
    "chat.adults_only.participate",
    "meals.manage",
    "home.manage",
    "memories.manage",
    "habits.manage_all",
    "safety.contacts_medical.manage",
    "safety.sos.trigger",
    "ai.assistant.use",
    "audit_logs.view",
  ]),
  adult: new Set<PermissionKey>([
    "family.members.view",
    "calendar.family.manage",
    "calendar.adults_only.view",
    "tasks.manage_all",
    "tasks.approve_chores",
    "finance.transactions.manage",
    "finance.allowance.view_own",
    "child_dev.manage",
    "shopping.manage",
    "inventory.manage",
    "documents.standard.manage",
    "chat.family.participate",
    "chat.adults_only.participate",
    "meals.manage",
    "home.manage",
    "memories.manage",
    "safety.contacts_medical.manage",
    "safety.sos.trigger",
    "ai.assistant.use",
  ]),
  teen: new Set<PermissionKey>([
    "family.members.view",
    "calendar.family.manage",
    "finance.allowance.view_own",
    "child_dev.rewards.redeem",
    "shopping.manage",
    "chat.family.participate",
    "meals.manage",
    "memories.manage",
    "safety.sos.trigger",
    "ai.assistant.use",
  ]),
  child: new Set<PermissionKey>([
    "family.members.view",
    "finance.allowance.view_own",
    "child_dev.rewards.redeem",
    "chat.family.participate",
    "safety.sos.trigger",
  ]),
  extended: new Set<PermissionKey>([
    "family.members.view",
    "chat.family.participate",
    "safety.sos.trigger",
  ]),
  caregiver: new Set<PermissionKey>([
    "family.members.view",
    "shopping.manage",
    "chat.family.participate",
    "safety.sos.trigger",
  ]),
};

export interface MemberSecurityContext {
  familyId: string;
  targetFamilyId: string;
  role: FamilyRole;
  status: "active" | "invited" | "suspended" | "removed";
  isManagedChild: boolean;
  accessExpiresAt?: Date | null;
  overrides?: Array<{
    permission: PermissionKey;
    effect: "allow" | "deny";
    expiresAt?: Date | null;
  }>;
}

/**
 * Resolves whether a member holds a permission in the target family.
 * Mirrors PostgreSQL famora.has_permission():
 * - Cross-family requests always return false
 * - Inactive or expired memberships always return false
 * - Explicit 'deny' override always wins
 * - Managed child profiles cannot be elevated via 'allow' overrides
 */
export function hasFamilyPermission(
  ctx: MemberSecurityContext | null | undefined,
  permission: PermissionKey,
  now: Date = new Date()
): boolean {
  if (!ctx) return false;
  if (ctx.familyId !== ctx.targetFamilyId) return false;
  if (ctx.status !== "active") return false;
  if (ctx.accessExpiresAt && ctx.accessExpiresAt <= now) return false;

  const activeOverride = ctx.overrides?.find(
    (o) => o.permission === permission && (!o.expiresAt || o.expiresAt > now)
  );

  if (activeOverride?.effect === "deny") return false;
  if (activeOverride?.effect === "allow" && !ctx.isManagedChild) return true;

  const effectiveRole: FamilyRole = ctx.isManagedChild ? "child" : ctx.role;
  return ROLE_DEFAULT_PERMISSIONS[effectiveRole].has(permission);
}

/**
 * Validates whether an actor can change a target member's role.
 * Prevents self-escalation and protects owner transitions.
 */
export function canModifyMemberRole(params: {
  actorContext: MemberSecurityContext;
  currentTargetRole: FamilyRole;
  nextTargetRole: FamilyRole;
}): boolean {
  const { actorContext, currentTargetRole, nextTargetRole } = params;
  if (!hasFamilyPermission(actorContext, "family.members.invite_manage")) {
    return false;
  }
  if (
    (currentTargetRole === "owner" || nextTargetRole === "owner") &&
    actorContext.role !== "owner"
  ) {
    return false;
  }
  return true;
}

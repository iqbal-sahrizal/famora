export type FamilyRole =
  | "owner"
  | "admin"
  | "adult"
  | "teen"
  | "child"
  | "extended"
  | "caregiver";

export type DomainId =
  | "dashboard"
  | "calendar"
  | "tasks"
  | "chores"
  | "noticeboard"
  | "finance"
  | "budgets"
  | "analytics"
  | "child-dev"
  | "shopping"
  | "inventory"
  | "documents"
  | "chat"
  | "meals"
  | "home"
  | "memories"
  | "habits"
  | "safety"
  | "notifications"
  | "ai"
  | "settings"
  | "family";

export type PermissionKey =
  | "family.delete"
  | "family.settings.manage"
  | "family.members.invite_manage"
  | "family.members.view"
  | "calendar.family.manage"
  | "calendar.adults_only.view"
  | "tasks.manage_all"
  | "tasks.approve_chores"
  | "finance.accounts.manage"
  | "finance.transactions.manage"
  | "finance.allowance.view_own"
  | "child_dev.manage"
  | "child_dev.rewards.redeem"
  | "shopping.manage"
  | "inventory.manage"
  | "documents.standard.manage"
  | "documents.sensitive_vault"
  | "chat.family.participate"
  | "chat.adults_only.participate"
  | "meals.manage"
  | "home.manage"
  | "memories.manage"
  | "habits.manage_all"
  | "safety.contacts_medical.manage"
  | "safety.sos.trigger"
  | "ai.assistant.use"
  | "audit_logs.view";

export interface FamilySummary {
  id: string;
  name: string;
  slug: string;
  role: FamilyRole;
}

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SRC_DIR = path.join(ROOT, "src");

const REQUIRED_TABLES = [
  "profiles",
  "families",
  "family_members",
  "family_invitations",
  "family_roles",
  "permissions",
  "role_permissions",
  "member_preferences",
  "user_devices",
  "activity_logs",
  "member_permission_overrides",
  "calendar_events",
  "tasks",
  "family_announcements",
  "shopping_items",
  "finance_accounts",
  "finance_transactions",
  "calendar_event_participants",
  "notifications",
  "task_assignees",
  "task_subtasks",
  "task_comments",
  "task_attachments",
  "task_history",
  "chore_templates",
  "chore_submissions",
  "reward_catalog",
  "reward_points_ledger",
  "family_challenges",
  "shopping_lists",
  "shopping_templates",
  "shopping_item_history",
  "announcement_reads",
  "family_polls",
  "family_poll_options",
  "family_poll_votes",
  "finance_categories",
  "finance_audit_history",
  "finance_budgets",
  "recurring_schedules",
  "household_bills",
  "bill_payment_history",
  "finance_goals",
  "finance_goal_contributions",
  "finance_debts_receivables",
  "finance_debt_payments",
  "child_profiles",
  "child_growth_records",
  "child_milestones",
  "child_education_records",
  "child_health_records",
  "inventory_items",
  "inventory_movements",
  "recipes",
  "meal_plans",
  "home_assets",
  "home_service_providers",
  "home_maintenance_tasks",
  "home_maintenance_history",
  "documents",
  "document_history",
  "chat_conversations",
  "chat_participants",
  "chat_messages",
  "chat_message_reactions",
  "memory_albums",
  "memory_items",
  "memory_favorites",
  "habits",
  "habit_logs",
  "safety_contacts",
  "safety_protocols",
  "safety_location_shares",
  "notification_outbox",
  "notification_delivery_logs",
  "ai_conversations",
  "ai_messages",
  "ai_usage_logs",
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  fail("No migration files found in supabase/migrations.");
}

files.forEach((file, idx) => {
  const expectedPrefix = String(idx + 1).padStart(4, "0") + "_";
  if (!file.startsWith(expectedPrefix)) {
    fail(`Migration ${file} does not start with expected prefix ${expectedPrefix}`);
  }
});

const combinedSql = files
  .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n");

// 1. All tables must have ENABLE and FORCE ROW LEVEL SECURITY
for (const table of REQUIRED_TABLES) {
  if (!new RegExp(`CREATE TABLE public\\.${table}\\b`).test(combinedSql)) {
    fail(`Missing CREATE TABLE public.${table}`);
  }
  if (!new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`).test(combinedSql)) {
    fail(`Missing ENABLE ROW LEVEL SECURITY on public.${table}`);
  }
  if (!new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`).test(combinedSql)) {
    fail(`Missing FORCE ROW LEVEL SECURITY on public.${table}`);
  }
}

// 2. Zero unrestricted policies
if (/USING\s*\(\s*true\s*\)/i.test(combinedSql) || /WITH CHECK\s*\(\s*true\s*\)/i.test(combinedSql)) {
  fail("Unrestricted RLS policy (USING (true) or WITH CHECK (true)) detected.");
}

// 3. Explicit privilege revocation & pin_hash column protection
if (!/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated/i.test(combinedSql)) {
  fail("Missing baseline REVOKE ALL on public tables.");
}
if (!/GRANT SELECT\s*\([^)]*\)\s*ON public\.family_members TO authenticated/i.test(combinedSql)) {
  fail("Missing column-restricted SELECT grant on family_members (to protect pin_hash).");
}

// 4. Every SECURITY DEFINER in 0006/0007 must set search_path = public, pg_temp
const securitySql = ["0006_security_privileges_and_overrides.sql", "0007_anti_escalation_and_audit_triggers.sql", "0008_auth_profile_trigger.sql", "0009_family_onboarding_and_rpc.sql", "0010_member_management_and_invitations.sql", "0011_family_rbac_and_settings.sql", "0015_chores_and_rewards.sql", "0017_announcements_and_polls.sql", "0018_family_finance_core.sql", "0019_budgets_and_bills.sql", "0020_financial_analytics_and_goals.sql"]
  .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n")
  .replace(/--.*$/gm, "");

const secDefMatches = securitySql.match(/SECURITY DEFINER/g)?.length ?? 0;
const searchPathMatches = securitySql.match(/SET search_path = public, pg_temp/g)?.length ?? 0;
if (secDefMatches === 0 || secDefMatches !== searchPathMatches) {
  fail(`SECURITY DEFINER count (${secDefMatches}) does not match controlled search_path count (${searchPathMatches}).`);
}

// 5. No service role key in client-side folders
const clientDirs = ["components", "features", "hooks", "stores", "providers"];
for (const dir of clientDirs) {
  const fullDir = path.join(SRC_DIR, dir);
  if (!fs.existsSync(fullDir)) continue;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(p, "utf8");
        if (content.includes("SUPABASE_SERVICE_ROLE_KEY")) {
          fail(`Service role credential reference found in client file: ${p}`);
        }
      }
    }
  };
  walk(fullDir);
}

if (!process.exitCode) {
  console.log(
    `OK: Validated ${files.length} migrations, ${REQUIRED_TABLES.length} RLS-forced tables, ${secDefMatches} hardened SECURITY DEFINER functions, column-level pin_hash protection, zero unrestricted policies, and zero client service-role references.`
  );
}

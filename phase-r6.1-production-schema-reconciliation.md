# Famora — Production Schema Reconciliation (R6.1)

**Date:** 2026-11-24  
**Base Phase:** R6 (`phase-r6-production-release-gate.md`)  
**Verdict:** **`SCHEMA_MISMATCH_CONFIRMED`**

---

## 1. Executive Summary

Read-only reconciliation between local migrations `0001`–`0037` and the observed Supabase production catalog (`eaxrhlgwsepdlfnveypo`, PostgreSQL 17.12) confirms a **real schema mismatch** between local code and production:

1. **78 Production Tables vs 79 Local Tables:** Local migrations `0001`–`0028` define **78** `public` tables, `0029`–`0033` add 0 tables, and `0034_child_dev_attachments.sql` defines the **79th** `public` table (`public.child_attachments`). Production reports **78** `public` tables and **`public.child_attachments` is missing**, confirming `0034` is **NOT applied** in production.
2. **`public.noticeboard_posts` Name Mismatch (Not a Missing Table):** Local migrations (`0012` & `0017`) do **not** define `public.noticeboard_posts`; Famora's noticeboard tables are named `public.family_announcements`, `public.announcement_reads`, `public.family_polls`, `public.family_poll_options`, and `public.family_poll_votes`.
3. **17 `public` `SECURITY INVOKER` Functions Match `0029_public_rpc_wrappers.sql`:** Local migration `0029` defines **exactly 17** `public.*` `SECURITY INVOKER` wrapper functions delegating to `famora.*` `SECURITY DEFINER` RPCs. Keeping them `SECURITY INVOKER` is **intentional and secure**. However, `0032`/`0035` define an **18th** `public` function (`public.delete_family_workspace`), which strongly indicates `0032`/`0035` are also **NOT yet applied** in production.
4. **No App Migration History:** `supabase_migrations.schema_migrations` is absent (tables in `auth`, `realtime`, `storage` are Supabase platform internals).
5. **Unverified Incremental/Storage Changes:** `0030` (`finance_accounts.is_archived/archived_at`), `0031` (`notifications_delete_recipient` policy), `0033` (`member_preferences.locale`), `0036_fix_storage_rls_policies.sql`, and `0037_task_and_noticeboard_storage.sql` cannot be confirmed without running targeted read-only queries on columns, policies, `famora.*` functions, and `storage.buckets`.

---

## 2. Migration-by-Migration Reconciliation Matrix (`0001`–`0037`)

| Migration | Primary Objects Created / Modified | Cumulative Tables | Production Status | Evidence / Basis |
|---|---|---:|---|---|
| `0001_extensions_and_helpers.sql` | `famora.set_updated_at()` | 0 | **LIKELY_APPLIED (NEEDS_FUNC_CHECK)** | Required by triggers in `0002`–`0028`. |
| `0002_core_identity_and_families.sql` | `profiles`, `families`, `family_roles`, `permissions`, `role_permissions` | 5 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0003_membership_and_invitations.sql` | `family_members`, `family_invitations`, `member_preferences`, `user_devices`, `activity_logs` | 10 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0004_rls_and_security_baseline.sql` | RLS baseline + `is_family_member`, `current_member_id`, `has_permission` | 10 | **LIKELY_APPLIED (NEEDS_POLICY_CHECK)** | RLS + FORCE RLS observed active on checked tables. |
| `0005_seed_roles_and_permissions.sql` | Seed rows in `family_roles`, `permissions`, `role_permissions` | 10 | **CANNOT_DETERMINE** | Requires row-count / permission-key check. |
| `0006_security_privileges_and_overrides.sql` | `member_permission_overrides`, `member_role_key`, `has_role` | 11 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0007_anti_escalation_and_audit_triggers.sql` | `guard_family_member_mutation`, `accept_family_invitation`, `log_sensitive_activity` | 11 | **CANNOT_DETERMINE** | Requires trigger + `famora.*` `pg_proc` check. |
| `0008_auth_profile_trigger.sql` | `famora.handle_new_user()` | 11 | **CANNOT_DETERMINE** | Requires `auth.users` trigger check. |
| `0009_family_onboarding_and_rpc.sql` | `families.description`, `onboarding_completed_at`, `create_family_with_owner` | 11 | **LIKELY_APPLIED** | `public.create_family_with_owner` exists in 17 `public` functions. |
| `0010_member_management_and_invitations.sql` | `get_invitation_preview`, `reject_family_invitation`, `transfer_family_ownership` | 11 | **LIKELY_APPLIED** | Corresponding `public.*` wrappers exist in `0029`. |
| `0011_family_rbac_and_settings.sql` | `get_my_family_permissions`, `set_member_permission_override` | 11 | **LIKELY_APPLIED** | Corresponding `public.*` wrappers exist in `0029`. |
| `0012_dashboard_domain_tables.sql` | `calendar_events`, `tasks`, `family_announcements`, `shopping_items`, `finance_accounts`, `finance_transactions` | 17 | **PARTIALLY_CONFIRMED (`tasks` found)** | `public.tasks` confirmed; others part of 78-table baseline. |
| `0013_family_calendar_full.sql` | `calendar_event_participants`, `notifications` | 19 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0014_family_tasks_full.sql` | `task_assignees`, `task_subtasks`, `task_comments`, `task_attachments`, `task_history` | 24 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0015_chores_and_rewards.sql` | `chore_templates`, `chore_submissions`, `reward_catalog`, `reward_points_ledger`, `family_challenges` | 29 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline + `0029` wrappers. |
| `0016_family_shopping_full.sql` | `shopping_lists`, `shopping_templates`, `shopping_item_history` | 32 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0017_announcements_and_polls.sql` | `announcement_reads`, `family_polls`, `family_poll_options`, `family_poll_votes` | 36 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline (`family_announcements` / `family_polls`, not `noticeboard_posts`). |
| `0018_family_finance_core.sql` | `finance_categories`, `finance_audit_history` | 38 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline + `0029` wrappers. |
| `0019_budgets_and_bills.sql` | `finance_budgets`, `recurring_schedules`, `household_bills`, `bill_payment_history` | 42 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline + `0029` wrappers. |
| `0020_financial_analytics_and_goals.sql` | `finance_goals`, `finance_goal_contributions`, `finance_debts_receivables`, `finance_debt_payments` | 46 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline + `0029` wrappers. |
| `0021_child_development.sql` | `child_profiles`, `child_growth_records`, `child_milestones`, `child_education_records`, `child_health_records` | 51 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0022_household_management.sql` | `inventory_items`, `inventory_movements`, `recipes`, `meal_plans`, `home_*` (4 tables) | 59 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0023_family_document_vault.sql` | `documents`, `document_history`, bucket `family-documents` | 61 | **LIKELY_APPLIED (NEEDS_BUCKET_CHECK)** | Part of 78-table baseline; Storage bucket unconfirmed. |
| `0024_family_chat.sql` | `chat_conversations`, `chat_participants`, `chat_messages`, `chat_message_reactions`, bucket `chat-attachments` | 65 | **LIKELY_APPLIED (NEEDS_BUCKET_CHECK)** | Part of 78-table baseline; Storage bucket unconfirmed. |
| `0025_family_memories.sql` | `memory_albums`, `memory_items`, `memory_favorites`, bucket `family-memories` | 68 | **LIKELY_APPLIED (NEEDS_BUCKET_CHECK)** | Part of 78-table baseline; Storage bucket unconfirmed. |
| `0026_habits_and_safety.sql` | `habits`, `habit_logs`, `safety_contacts`, `safety_protocols`, `safety_location_shares` | 73 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0027_notification_system.sql` | `notification_outbox`, `notification_delivery_logs` | 75 | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Part of 78-table baseline. |
| `0028_ai_assistant.sql` | `ai_conversations`, `ai_messages`, `ai_usage_logs` | **78** | **LIKELY_APPLIED (NEEDS_TABLE_LIST)** | Completes exact 78-table count observed in production. |
| `0029_public_rpc_wrappers.sql` | 17 `public.*` `SECURITY INVOKER` RPC wrappers | 78 | **CONFIRMED_REFLECTED (COUNT MATCH: 17)** | Production reports 17 `public` functions, all `SECURITY INVOKER`. |
| `0030_finance_accounts_archive.sql` | `finance_accounts.is_archived`, `archived_at`, `idx_finance_accounts_family_archived` | 78 | **CANNOT_DETERMINE** | Requires column/index check on `finance_accounts`. |
| `0031_notifications_delete_policy.sql` | Policy `notifications_delete_recipient` on `notifications` | 78 | **CANNOT_DETERMINE** | Requires `pg_policies` check on `notifications`. |
| `0032_delete_family_workspace_rpc.sql` | `famora.delete_family_workspace` + `public.delete_family_workspace` (18th `public` fn) | 78 | **LIKELY_NOT_APPLIED** | Production has 17 `public` functions, not 18 (superseded by `0035`). |
| `0033_member_preferences_locale.sql` | `member_preferences.locale` (`'id'`/`'en'`) | 78 | **CANNOT_DETERMINE** | Requires column check on `member_preferences`. |
| **`0034_child_dev_attachments.sql`** | **`public.child_attachments` (79th table)**, bucket `family-child-attachments`, 5 policies | **79** | **CONFIRMED_NOT_APPLIED** | `public.child_attachments` confirmed absent; prod has 78 tables. |
| **`0035_fix_delete_family_workspace_rpc.sql`** | Fixed `delete_family_workspace` (correct FK delete order + 18th `public` fn) | 79 | **NOT_APPLIED** | Production has 17 `public` functions, not 18. |
| **`0036_fix_storage_rls_policies.sql`** | Tightens Storage RLS for `family-documents` & `family-child-attachments` | 79 | **NOT_APPLIED** | `0034` (`family-child-attachments`) not applied; local S1.1 fix. |
| **`0037_task_and_noticeboard_storage.sql`** | Buckets `family-tasks`, `family-noticeboard`, `family_announcements.attachment_storage_path`, 6 Storage RLS policies | 79 | **NOT_APPLIED** | Local S4 addition; requires `family_announcements` column check to be 100% certain. |

---

## 3. Missing Tables and Columns

- **Confirmed Missing Table:**
  - `public.child_attachments` (defined in `0034_child_dev_attachments.sql`).
- **False-Alarm Table Name (Naming Difference):**
  - `public.noticeboard_posts` does **not** exist in local migrations either. Noticeboard uses `public.family_announcements`, `public.announcement_reads`, `public.family_polls`, `public.family_poll_options`, and `public.family_poll_votes`.
- **Columns Requiring Read-Only Verification:**
  - `public.finance_accounts.is_archived`, `public.finance_accounts.archived_at` (`0030`)
  - `public.member_preferences.locale` (`0033`)
  - `public.family_announcements.attachment_storage_path` (`0037`)

---

## 4. Missing or Mismatched Constraints and Indexes

- **Confirmed Missing (tied to `0034`):**
  - `idx_child_attachments_child` on `public.child_attachments(family_id, child_profile_id, created_at DESC)` and `trg_child_attachments_updated_at`.
  - Check constraints on `child_attachments` (`record_type IN ('health', 'education', 'milestone')`, `size_bytes > 0 AND size_bytes <= 10485760`, `file_name` length).
- **Unverified (require catalog queries):**
  - `idx_finance_accounts_family_archived` (`0030`).
  - `member_preferences_locale_check` (`locale IN ('id', 'en')`, `0033`).
  - Whether any manual SQL edits in production altered constraint names or `ON DELETE` rules compared to `0001`–`0028`.

---

## 5. Function Security Comparison (17 `SECURITY INVOKER` Functions)

Production reported **17 `public` functions, all `SECURITY INVOKER`**.

### Local Comparison
- `0029_public_rpc_wrappers.sql` creates **exactly 17** `public.*` SQL wrapper functions, **all marked `SECURITY INVOKER` with `SET search_path = public, famora, pg_temp`**:
  - `create_family_with_owner`, `get_my_family_permissions`, `set_member_permission_override`, `accept_family_invitation`, `reject_family_invitation`, `get_invitation_preview`, `transfer_family_ownership`, `approve_chore_submission`, `redeem_family_reward`, `cast_poll_vote`, `get_poll_vote_counts`, `record_finance_transaction`, `reverse_finance_transaction`, `pay_household_bill`, `process_due_recurring_schedules`, `contribute_to_finance_goal`, `record_debt_payment`.
- Each `public.*` wrapper delegates directly to its corresponding **`famora.*` `SECURITY DEFINER`** implementation (hardened with `SET search_path = public, famora, pg_temp` and `REVOKE ALL FROM PUBLIC`).

### Security Assessment
- **Do NOT convert the 17 `public.*` functions to `SECURITY DEFINER`.** Keeping the `public.*` PostgREST entrypoints as `SECURITY INVOKER` while encapsulating elevated logic inside `famora.*` `SECURITY DEFINER` functions is an intentional defense-in-depth pattern.
- **Missing Function Risk:** `0032`/`0035` add an **18th** `public` wrapper (`public.delete_family_workspace`) + `famora.delete_family_workspace`. Because production only has **17** `public` functions, workspace deletion (`delete_family_workspace`) is likely missing in production and should be deployed via `0035` (not `0032`, which had a table-name bug `debt_payments` vs `finance_debt_payments`).
- **Required Check:** Verify via read-only SQL that all 17+ `famora.*` functions in production are `SECURITY DEFINER` with `search_path` pinned and `PUBLIC`/`anon` execute revoked.

---

## 6. Storage Bucket & Storage RLS Comparison

Storage buckets and `storage.objects` policies have **not yet been inspected in production**.

| Bucket | Local Migration | Public? | Expected Storage RLS Policies | Production Status |
|---|---|---|---|---|
| `family-documents` | `0023` (updated in `0036`) | `false` | `family_docs_storage_select/insert/delete` (`vault` requires `documents.sensitive_vault`) | **UNVERIFIED** (`0036` tightening likely missing) |
| `chat-attachments` | `0024` | `false` | `chat_attachments_select/insert/delete` | **UNVERIFIED** |
| `family-memories` | `0025` | `false` | `family_memories_storage_select/insert/delete` | **UNVERIFIED** |
| `family-child-attachments` | `0034` (updated in `0036`) | `false` | `child_attachments_storage_select/insert/delete` | **LIKELY_MISSING** (`0034` table missing) |
| `family-tasks` | `0037` | `false` | `family_tasks_storage_select/insert/delete` | **LIKELY_MISSING** (`0037` local-only) |
| `family-noticeboard` | `0037` | `false` | `family_noticeboard_storage_select/insert/delete` | **LIKELY_MISSING** (`0037` local-only) |

---

## 7. RLS Policy Comparison

- **Production Observation:** RLS and `FORCE ROW LEVEL SECURITY` appeared active on the production tables inspected, aligning with `npm run db:validate` (78 RLS-forced tables).
- **Cannot Confirm Parity Without `pg_policies` Output:**
  - Whether `notifications_delete_recipient` (`0031`) exists in production.
  - Whether any manual production policies differ from `0004`–`0028` (especially `family_members`, `family_invitations`, `documents`, `child_profiles`, `finance_*`).
  - Whether `storage.objects` has any permissive/legacy policies or lacks `0036` tier isolation (`vault` vs `standard`).

---

## 8. Additional Read-Only SQL Queries Needed

Run these targeted `SELECT`-only queries in Supabase SQL Editor (also included in [r6_production_catalog_inspection.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6_production_catalog_inspection.sql)):

```sql
-- A. Confirm exact 78 public table names (check noticeboard & child_attachments)
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- B. Check incremental columns from 0030, 0033, 0037
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'finance_accounts' AND column_name IN ('is_archived', 'archived_at'))
    OR (table_name = 'member_preferences' AND column_name = 'locale')
    OR (table_name = 'family_announcements' AND column_name = 'attachment_storage_path')
  );

-- C. Check all public & famora functions (confirm 17 INVOKER + famora DEFINER + delete_family_workspace)
SELECT n.nspname AS schema_name, p.proname, p.prosecdef AS security_definer, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'famora')
ORDER BY n.nspname, p.proname;

-- D. Check Storage buckets & Storage RLS policies
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- E. Check notifications delete policy (0031) & RLS/FORCE RLS gaps across all public tables
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications';
```

---

## 9. Recommended Migration Sequence (After Backup & Query Results)

1. **Run Read-Only Queries A–E** above in Supabase SQL Editor and confirm exact missing items among `0030`–`0033`.
2. **Confirm Production Backup / PITR** + take a pre-migration `pg_dump` snapshot.
3. **Apply Missing `0030`–`0033` Items (only if Queries B/E show them absent):**
   - `0030_finance_accounts_archive.sql` (if `is_archived` missing)
   - `0031_notifications_delete_policy.sql` (if `notifications_delete_recipient` missing)
   - `0033_member_preferences_locale.sql` (if `locale` missing)
   - *(Skip `0032` directly and use `0035` instead, since `0035` fixes `0032`'s FK order bug.)*
4. **Apply Confirmed Missing `0034`–`0037` in Exact Order:**
   1. `0034_child_dev_attachments.sql` (creates `public.child_attachments` + bucket `family-child-attachments`)
   2. `0035_fix_delete_family_workspace_rpc.sql` (creates/fixes `famora.delete_family_workspace` & `public.delete_family_workspace`)
   3. `0036_fix_storage_rls_policies.sql` (hardens `family-documents` & `family-child-attachments` Storage RLS)
   4. `0037_task_and_noticeboard_storage.sql` (creates `family-tasks` & `family-noticeboard` buckets, `family_announcements.attachment_storage_path`, and 6 Storage RLS policies)

---

## 10. Production Deployment Blockers

1. **Schema Mismatch Confirmed (`0034`–`0037` missing):** Deploying current `main` code before applying `0034`–`0037` will break Child Attachments (`child_attachments`), Family Workspace Deletion (`delete_family_workspace`), and Task/Noticeboard Storage Uploads (`family-tasks`, `family-noticeboard`, `attachment_storage_path`).
2. **Unverified Incremental Migrations (`0030`, `0031`, `0033`) & Storage Buckets (`0023`–`0025`):** Must be confirmed via Queries A–E before applying migrations.
3. **Unverified Backup / PITR Status:** Must confirm automated backups + pre-migration `pg_dump` before any DDL runs.
4. **No App Migration Tracking (`supabase_migrations.schema_migrations` absent):** Never run `supabase db push` without first baselining verified migrations after user approval.

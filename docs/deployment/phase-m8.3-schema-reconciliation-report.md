# Famora M8.3 — Full Production Schema Reconciliation Report

**Target Production Project:** `eaxrhlgwsepdlfnveypo` (`PostgreSQL 17.12`)  
**Mode:** Strictly Read-Only Audit (zero migrations, zero `db push`/`db reset`, zero `seed`, zero DB modifications)  
**Verdict:** `SCHEMA_MISMATCH` *(with `UNVERIFIABLE` live catalog details where direct `pg_catalog` introspection was unavailable)*

---

## 1. Executive Summary

- **Table Count Mismatch (`79` Repo vs `78` Production):**
  - Migrations `0001`–`0028` define **78** `public` tables (matching `scripts/validate-migrations.mjs` `REQUIRED_TABLES`, which currently lists 78 tables).
  - Migration `0034_child_dev_attachments.sql` introduces a **79th** `public` table: **`public.child_attachments`** (which was omitted from `REQUIRED_TABLES` in `validate-migrations.mjs`).
  - Because Production (`eaxrhlgwsepdlfnveypo`) reports **`78 public tables`**, **`78 RLS enabled`**, and **`78 FORCE RLS`**, at least one migration (`0034_child_dev_attachments.sql`, unless another table is missing) is **not reflected** in Production.
- **Migration Tracking Absent:** `supabase_migrations.schema_migrations` does not exist in Production. Without migration history or live `pg_catalog`/`information_schema` access in this workspace, exact column types, constraint definitions, function bodies (including `0035_fix_delete_family_workspace_rpc.sql`), triggers, and RLS policy expressions (`USING`/`WITH CHECK`) on Production are **`UNVERIFIABLE`** until the read-only SQL queries in Section 6 are executed in Supabase Dashboard SQL Editor.

---

## 2. Inventory of All 79 Repo Tables vs 78 Production Tables

- **0002 (5):** `profiles`, `families`, `family_roles`, `permissions`, `role_permissions`
- **0003 (5):** `family_members`, `family_invitations`, `member_preferences`, `user_devices`, `activity_logs`
- **0006 (1):** `member_permission_overrides`
- **0012 (6):** `calendar_events`, `tasks`, `family_announcements`, `shopping_items`, `finance_accounts`, `finance_transactions`
- **0013 (2):** `calendar_event_participants`, `notifications`
- **0014 (5):** `task_assignees`, `task_subtasks`, `task_comments`, `task_attachments`, `task_history`
- **0015 (5):** `chore_templates`, `chore_submissions`, `reward_catalog`, `reward_points_ledger`, `family_challenges`
- **0016 (3):** `shopping_lists`, `shopping_templates`, `shopping_item_history`
- **0017 (4):** `announcement_reads`, `family_polls`, `family_poll_options`, `family_poll_votes`
- **0018 (2):** `finance_categories`, `finance_audit_history`
- **0019 (4):** `finance_budgets`, `recurring_schedules`, `household_bills`, `bill_payment_history`
- **0020 (4):** `finance_goals`, `finance_goal_contributions`, `finance_debts_receivables`, `finance_debt_payments`
- **0021 (5):** `child_profiles`, `child_growth_records`, `child_milestones`, `child_education_records`, `child_health_records`
- **0022 (8):** `inventory_items`, `inventory_movements`, `recipes`, `meal_plans`, `home_assets`, `home_service_providers`, `home_maintenance_tasks`, `home_maintenance_history`
- **0023 (2):** `documents`, `document_history`
- **0024 (4):** `chat_conversations`, `chat_participants`, `chat_messages`, `chat_message_reactions`
- **0025 (3):** `memory_albums`, `memory_items`, `memory_favorites`
- **0026 (5):** `habits`, `habit_logs`, `safety_contacts`, `safety_protocols`, `safety_location_shares`
- **0027 (2):** `notification_outbox`, `notification_delivery_logs`
- **0028 (3):** `ai_conversations`, `ai_messages`, `ai_usage_logs`
- **0034 (1 — Drift Candidate):** `child_attachments`

*(Subtotal `0002`–`0028` = `78` tables; total `0002`–`0034` = `79` tables.)*

---

## 3. Object-by-Object Comparison (Repo vs Production `eaxrhlgwsepdlfnveypo`)

| # | Audit Category | Repo Expected (`0001`–`0035`) | Production Observed / Status |
| :---: | :--- | :--- | :--- |
| 1 | **Tables** | `79` `public` tables | **`78` `public` tables** — **MISMATCH** (1 table missing; likely `child_attachments` from `0034`). |
| 2 | **Columns** | Defined across `0002`–`0034` (incl. `0030` `is_archived`, `0033` `locale`) | `UNVERIFIABLE` (no live `information_schema.columns` access). |
| 3 | **Primary Keys** | `79` PKs (UUID defaults) | `UNVERIFIABLE` (`pg_constraint WHERE contype = 'p'`). |
| 4 | **Foreign Keys & Actions** | Cascading & `ON DELETE RESTRICT` FKs (e.g., `bill_payment_history` → `finance_transactions`) | `UNVERIFIABLE` (`pg_constraint WHERE contype = 'f'`). |
| 5 | **Unique & Check Constraints** | Composite uniques & status/enum checks | `UNVERIFIABLE` (`pg_constraint WHERE contype IN ('u','c')`). |
| 6 | **Indexes** | `91` explicit `CREATE [UNIQUE] INDEX` statements across `0002`–`0034` | `UNVERIFIABLE` (`pg_indexes`). |
| 7 | **Functions** | `53` `CREATE [OR REPLACE] FUNCTION` defs (`25` hardened `SECURITY DEFINER`, `17` `public` RPC wrappers in `0029`, `delete_family_workspace` fixed in `0035`) | `UNVERIFIABLE` (`pg_proc` signature, `prosecdef`, `proconfig` `search_path`, body, grants). |
| 8 | **Triggers** | `75` `CREATE TRIGGER` statements (`updated_at`, anti-escalation, audit, auth profile) | `UNVERIFIABLE` (`pg_trigger`). |
| 9 | **RLS Policies** | `79` tables RLS enabled + forced; `166` `CREATE POLICY` statements | **78/78** existing tables have RLS enabled & forced; exact policy expressions (`USING`/`WITH CHECK`) are `UNVERIFIABLE`. |
| 10 | **Privileges** | `REVOKE ALL ... FROM PUBLIC, anon`; scoped `authenticated` grants | `UNVERIFIABLE` (`information_schema.role_table_grants` / `routine_privileges`). |
| 11 | **Extensions & Types** | `1` explicit `CREATE EXTENSION` (`0001`, e.g. `pgcrypto`/`uuid-ossp`); `0` custom `CREATE TYPE` enums | `UNVERIFIABLE` (`pg_extension`, `pg_type`). |

---

## 4. Migration-by-Migration Reconciliation (`0001`–`0035`)

Because `supabase_migrations.schema_migrations` does not exist on `eaxrhlgwsepdlfnveypo`, historical application order **cannot be inferred** from final object existence alone (e.g., an object could have been created manually or via `combined_all_migrations.sql`).

| Migration | Primary Objects Introduced / Modified | Reconciliation Status |
| :--- | :--- | :--- |
| `0001_extensions_and_helpers.sql` | 1 extension, 1 helper function | `UNVERIFIABLE` |
| `0002_core_identity_and_families.sql` | 5 tables, 5 triggers, 6 indexes | `UNVERIFIABLE` |
| `0003_membership_and_invitations.sql` | 5 tables, 1 func, 6 triggers, 9 indexes | `UNVERIFIABLE` |
| `0004_rls_and_security_baseline.sql` | 3 funcs, 20 policies | `UNVERIFIABLE` |
| `0005_seed_roles_and_permissions.sql` | System roles & permissions seed data | `UNVERIFIABLE` |
| `0006_security_privileges_and_overrides.sql` | 1 table (`member_permission_overrides`), 5 funcs, 1 trigger, 2 policies, 2 indexes | `UNVERIFIABLE` |
| `0007_anti_escalation_and_audit_triggers.sql` | 3 funcs, 4 triggers | `UNVERIFIABLE` |
| `0008_auth_profile_trigger.sql` | 1 func, 1 trigger (`on_auth_user_created`) | `UNVERIFIABLE` |
| `0009_family_onboarding_and_rpc.sql` | 1 func | `UNVERIFIABLE` |
| `0010_member_management_and_invitations.sql` | 3 funcs | `UNVERIFIABLE` |
| `0011_family_rbac_and_settings.sql` | 2 funcs | `UNVERIFIABLE` |
| `0012_dashboard_domain_tables.sql` | 6 tables, 6 triggers, 12 policies, 6 indexes | `UNVERIFIABLE` |
| `0013_family_calendar_full.sql` | 2 tables, 2 triggers, 5 policies, 3 indexes | `UNVERIFIABLE` |
| `0014_family_tasks_full.sql` | 5 tables, 5 triggers, 11 policies, 6 indexes | `UNVERIFIABLE` |
| `0015_chores_and_rewards.sql` | 5 tables, 2 funcs, 5 triggers, 10 policies, 5 indexes | `UNVERIFIABLE` |
| `0016_family_shopping_full.sql` | 3 tables, 3 triggers, 6 policies, 5 indexes | `UNVERIFIABLE` |
| `0017_announcements_and_polls.sql` | 4 tables, 2 funcs, 4 triggers, 7 policies, 4 indexes | `UNVERIFIABLE` |
| `0018_family_finance_core.sql` | 2 tables, 2 funcs, 2 triggers, 5 policies, 3 indexes | `UNVERIFIABLE` |
| `0019_budgets_and_bills.sql` | 4 tables, 2 funcs, 4 triggers, 7 policies, 4 indexes | `UNVERIFIABLE` |
| `0020_financial_analytics_and_goals.sql` | 4 tables, 2 funcs, 4 triggers, 8 policies, 4 indexes | `UNVERIFIABLE` |
| `0021_child_development.sql` | 5 tables, 5 triggers, 10 policies, 5 indexes | `UNVERIFIABLE` |
| `0022_household_management.sql` | 8 tables, 8 triggers, 16 policies, 8 indexes | `UNVERIFIABLE` |
| `0023_family_document_vault.sql` | 2 tables, 2 triggers, 8 policies, 3 indexes | `UNVERIFIABLE` |
| `0024_family_chat.sql` | 4 tables, 1 func, 4 triggers, 15 policies, 5 indexes | `UNVERIFIABLE` |
| `0025_family_memories.sql` | 3 tables, 3 triggers, 13 policies, 4 indexes | `UNVERIFIABLE` |
| `0026_habits_and_safety.sql` | 5 tables, 5 triggers, 13 policies, 5 indexes | `UNVERIFIABLE` |
| `0027_notification_system.sql` | 2 tables, 2 triggers, 5 policies, 4 indexes | `UNVERIFIABLE` |
| `0028_ai_assistant.sql` | 3 tables, 3 triggers, 4 policies, 3 indexes | `UNVERIFIABLE` |
| `0029_public_rpc_wrappers.sql` | 17 `public.*` RPC wrapper functions | `UNVERIFIABLE` |
| `0030_finance_accounts_archive.sql` | `finance_accounts.is_archived` column + 1 index | `UNVERIFIABLE` |
| `0031_notifications_delete_policy.sql` | 1 DELETE RLS policy on `notifications` | `UNVERIFIABLE` |
| `0032_delete_family_workspace_rpc.sql` | 2 functions (`delete_family_workspace` v1) | `UNVERIFIABLE` |
| `0033_member_preferences_locale.sql` | `member_preferences.locale` column | `UNVERIFIABLE` |
| `0034_child_dev_attachments.sql` | **1 table (`child_attachments`)**, 1 trigger, 5 policies, 1 index | **`NOT_REFLECTED` (Likely)** — Production has 78 tables vs 79 repo tables |
| `0035_fix_delete_family_workspace_rpc.sql` | 2 functions (`delete_family_workspace` fixed body + `REVOKE anon`) | `UNVERIFIABLE` (created in Phase 1; likely pending) |

---

## 5. Safe Baseline Migration Tracking Recommendation (Do Not Auto-Run)

1. **Pre-requisite Backup & Recovery:** Create a manual backup / enable PITR on `eaxrhlgwsepdlfnveypo` before creating any schema_migrations tracking or applying missing SQL.
2. **Verify Exact Live Drift First (Read-Only SQL in Dashboard):** Run the queries in Section 6 to confirm which of `0030`–`0035` are actually missing or drifted.
3. **Preserve Existing Data & Objects:** Do **not** re-run `0001`–`0028` (non-idempotent `CREATE POLICY` / `INSERT` / `ALTER` statements could fail or conflict).
4. **Baseline Procedure (after verification & approval):**
   - Apply **only** the verified missing migrations (e.g., `0034` and `0035` if confirmed absent).
   - Use `supabase migration repair --status applied <version>` (or `INSERT INTO supabase_migrations.schema_migrations (version, name) ... ON CONFLICT DO NOTHING`) for the versions confirmed present, **never** `db reset`.
   - Verify `supabase migration list` shows 100% alignment before creating or applying any `0036_*.sql`.

---

## 6. Read-Only SQL Queries to Complete Live Verification (Supabase SQL Editor)

```sql
-- 1. Confirm exact 78 public table names & RLS flags
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Check 0030, 0033, 0034 drift candidates specifically
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='finance_accounts' AND column_name='is_archived') AS has_0030_is_archived,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND cmd='DELETE') AS has_0031_notif_delete,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='member_preferences' AND column_name='locale') AS has_0033_locale,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='child_attachments') AS has_0034_child_attachments;

-- 3. Check 0035 delete_family_workspace body (should reference finance_debt_payments, not debt_payments)
SELECT n.nspname, p.proname, p.prosecdef, p.proconfig,
       pg_get_functiondef(p.oid) ILIKE '%finance_debt_payments%' AS has_0035_fix
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'delete_family_workspace';
```

## 7. Risks & Repo Maintenance Note

- **Repo script drift (`scripts/validate-migrations.mjs`):** `REQUIRED_TABLES` only lists `78` tables (missing `child_attachments` from `0034`), causing `db:validate` to report `78` tables even though `0034` defines a 79th table. Recommend updating `REQUIRED_TABLES` in a future approved maintenance change.
- **Deployment risk:** Deploying code that uses `child_attachments` (`0034`) or `delete_family_workspace` (`0035`) while Production has only `78` tables will cause runtime errors on child-development attachments and family deletion until `0034` and `0035` are safely applied.

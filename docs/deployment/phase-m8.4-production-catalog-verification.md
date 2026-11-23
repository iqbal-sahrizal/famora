# Famora M8.4 — Production Catalog Verification (`eaxrhlgwsepdlfnveypo`)

**Target:** Supabase Production `eaxrhlgwsepdlfnveypo`  
**Mode:** Strictly Read-Only (zero migrations, zero `db push`/`reset`/`seed`, zero DDL/DML)  
**Final Verdict:** `CATALOG_VERIFICATION_BLOCKED` *(Read-only SQL queries generated below; direct `pg_catalog` execution is not available from this workspace without Postgres credentials.)*

---

## 1. Expected Object Definitions (`0030`–`0035`) & Current Status

| Migration | Object Type | Expected Definition (from Repo) | Production Status |
| :--- | :--- | :--- | :--- |
| **0030** | Columns | `public.finance_accounts.is_archived` (`boolean NOT NULL DEFAULT false`), `archived_at` (`timestamptz`) | `UNVERIFIABLE` |
| **0030** | Index | `idx_finance_accounts_family_archived` on `public.finance_accounts(family_id, is_archived)` | `UNVERIFIABLE` |
| **0031** | RLS Policy | `"notifications_delete_recipient"` on `public.notifications` (`FOR DELETE TO authenticated`, `USING (recipient_member_id = famora.current_member_id(family_id))`) | `UNVERIFIABLE` |
| **0032 / 0035** | Functions & Grants | `famora.delete_family_workspace(uuid)` (`SECURITY DEFINER`, `search_path = public, famora, pg_temp`) & `public.delete_family_workspace(uuid)` (`SECURITY INVOKER`). **0035** replaces `public.debt_payments` with `public.finance_debt_payments`, deletes `bill_payment_history` & `finance_goal_contributions`, clears `reversed_transaction_id`, and revokes `EXECUTE` from `PUBLIC, anon`. | `UNVERIFIABLE` |
| **0033** | Column & Check | `public.member_preferences.locale` (`text NOT NULL DEFAULT 'id'`, `CHECK (locale IN ('id', 'en'))`) | `UNVERIFIABLE` |
| **0034** | Table | `public.child_attachments` (12 columns: `id`, `family_id`, `child_profile_id`, `record_type`, `file_name`, `storage_path`, `mime_type`, `size_bytes`, `notes`, `uploaded_by_member_id`, `created_at`, `updated_at`) | `UNVERIFIABLE` *(likely `CONFIRMED_MISSING` based on M8.3 78-table count)* |
| **0034** | PK / FKs / Checks | PK on `id`; FKs on `family_id -> families(id) CASCADE`, `child_profile_id -> child_profiles(id) CASCADE`, `uploaded_by_member_id -> family_members(id) SET NULL`; checks on `record_type`, `file_name`, `size_bytes`, `notes` | `UNVERIFIABLE` |
| **0034** | Index & Trigger | `idx_child_attachments_child` on `(family_id, child_profile_id, created_at DESC)`; trigger `trg_child_attachments_updated_at` (`BEFORE UPDATE` → `famora.set_updated_at()`) | `UNVERIFIABLE` |
| **0034** | RLS & Policies | `relrowsecurity = true`, `relforcerowsecurity = true`; policies `"child_attachments_select_permitted"` (`SELECT`), `"child_attachments_write_permitted"` (`ALL`) | `UNVERIFIABLE` |
| **0034** | Storage Bucket & Policies | Bucket `family-child-attachments` (`public = false`, `file_size_limit = 10485760`); `storage.objects` policies `child_attachments_storage_select/insert/delete` | `UNVERIFIABLE` |
| **Tracking** | Schema & Table | `supabase_migrations.schema_migrations` | `UNVERIFIABLE` *(reported absent in M8.3)* |

---

## 2. Read-Only SQL Verification Script (Run in Supabase Dashboard SQL Editor)

Execute the queries below in **Supabase Dashboard (`eaxrhlgwsepdlfnveypo`) → SQL Editor** (100% `SELECT`-only, zero mutations):

```sql
-- ============================================================
-- TASK 1: Verify public.child_attachments & 0034 Storage
-- ============================================================
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'child_attachments';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'child_attachments'
ORDER BY ordinal_position;

SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.child_attachments')
ORDER BY contype, conname;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'child_attachments';

SELECT tgname, tgtype, pg_get_triggerdef(oid) AS trigger_def
FROM pg_trigger
WHERE tgrelid = to_regclass('public.child_attachments') AND NOT tgisinternal;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'child_attachments'
ORDER BY policyname;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'family-child-attachments';

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'child_attachments_storage_%'
ORDER BY policyname;

-- ============================================================
-- TASK 2: Verify Migrations 0030, 0031, 0032, 0033, 0035
-- ============================================================
-- 0030: finance_accounts archive columns & index
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'finance_accounts'
  AND column_name IN ('is_archived', 'archived_at')
ORDER BY column_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'finance_accounts'
  AND indexname = 'idx_finance_accounts_family_archived';

-- 0031: notifications delete policy
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications'
  AND policyname = 'notifications_delete_recipient';

-- 0032 vs 0035: delete_family_workspace definition & anon execute privilege
SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       p.proconfig AS config,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute,
       pg_get_functiondef(p.oid) ILIKE '%finance_debt_payments%' AS has_0035_table_fix,
       pg_get_functiondef(p.oid) ILIKE '%bill_payment_history%' AS has_0035_bill_fix,
       pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'delete_family_workspace'
ORDER BY n.nspname;

-- 0033: member_preferences.locale column & check constraint
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'member_preferences'
  AND column_name = 'locale';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.member_preferences')
  AND contype = 'c';

-- ============================================================
-- TASK 3: Verify supabase_migrations.schema_migrations
-- ============================================================
SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'supabase_migrations') AS has_schema,
       to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_table;
```

---

## 3. Next Step to Reach `CATALOG_VERIFIED`

Run the read-only SQL script above in **Supabase Dashboard (`eaxrhlgwsepdlfnveypo`) → SQL Editor** and share the query results (no secrets/credentials needed) so each item in Section 1 can be updated from `UNVERIFIABLE` to `CONFIRMED_PRESENT`, `CONFIRMED_MISSING`, or `DRIFT_DETECTED`.

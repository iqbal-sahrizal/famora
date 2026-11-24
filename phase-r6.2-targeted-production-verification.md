# Famora R6.2 — Targeted Production Verification

**Date:** 2026-11-24  
**Base Phase:** R6.1 (`phase-r6.1-production-schema-reconciliation.md`, Verdict: `SCHEMA_MISMATCH_CONFIRMED`)  
**Verdict:** **`TARGETED_VERIFICATION_SQL_READY`**

---

## 1. Purpose & Safety Guarantees

This document accompanies [r6.2_targeted_production_verification.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6.2_targeted_production_verification.sql) to close all remaining verification gaps from R6.1 (`0030`–`0037` and `famora.*` functions) using **strictly read-only `SELECT` queries**.

- Zero `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `GRANT`, or `REVOKE` statements.
- Zero migrations applied; zero production mutations; zero secret exposure.
- Actual production results are marked **`PENDING_USER_EXECUTION`** until the queries are run in the Supabase Dashboard SQL Editor for project `eaxrhlgwsepdlfnveypo`.

---

## 2. Targeted Verification Matrix (Sections 1–8)

### Check 1 — Migration `0030`: `finance_accounts` Archive Columns & Index
- **SQL Section:** `-- 1. MIGRATION 0030`
- **Expected Result (from `0030_finance_accounts_archive.sql`):**
  - Columns on `public.finance_accounts`:
    - `is_archived`: `boolean`, `is_nullable = 'NO'`, `column_default = 'false'`
    - `archived_at`: `timestamp with time zone`, `is_nullable = 'YES'`
  - Index: `idx_finance_accounts_family_archived` (`ON public.finance_accounts(family_id, is_archived)`)
- **Actual Production Result:** `PENDING_USER_EXECUTION`
- **Interpretation:**
  - Both columns + index present → `0030` is applied.
  - 0 rows → `0030` is missing and must be applied before deploying account-archiving code.

### Check 2 — Migration `0031`: `notifications_delete_recipient` Policy
- **SQL Section:** `-- 2. MIGRATION 0031`
- **Expected Result (from `0031_notifications_delete_policy.sql` + `0013`):**
  - Policy `notifications_delete_recipient` on `public.notifications`, `cmd = 'DELETE'`, `roles = '{authenticated}'`, `qual = '(recipient_member_id = famora.current_member_id(family_id))'`.
  - Grants on `public.notifications`: `authenticated` has `SELECT`, `INSERT`, `UPDATE`, `DELETE`; `anon` and `PUBLIC` have none.
- **Actual Production Result:** `PENDING_USER_EXECUTION`
- **Interpretation:**
  - Policy missing → `0031` is not applied; recipients cannot delete their own notifications under RLS.

### Check 3 — Migrations `0032` & `0035`: `delete_family_workspace` (RPC Signature & FK Fix)
- **SQL Section:** `-- 3. MIGRATIONS 0032 & 0035`
- **Expected Result:**
  - **Both `0032` and `0035` define** `famora.delete_family_workspace(p_family_id uuid)` (`SECURITY DEFINER`, `SET search_path = public, famora, pg_temp`) AND `public.delete_family_workspace(p_family_id uuid)` (`SECURITY INVOKER`, `SET search_path = public, famora, pg_temp`).
  - **Crucial `0032` vs `0035` Difference in Definition:**
    - `0032` (buggy): references `DELETE FROM public.debt_payments` (wrong table name) and omits `finance_goal_contributions`, `bill_payment_history`, and `reversed_transaction_id` unlink.
    - `0035` (fixed): deletes `public.finance_debt_payments`, `public.finance_goal_contributions`, `public.bill_payment_history`, clears `reversed_transaction_id = NULL`, then deletes `finance_transactions`, `finance_accounts`, and `families`; revokes `EXECUTE` from `PUBLIC, anon` on both `famora.*` and `public.*`.
- **Actual Production Result:** `PENDING_USER_EXECUTION`
- **Interpretation:**
  - 0 rows → Neither `0032` nor `0035` is applied (consistent with 17 vs 18 `public` functions in R6.1); apply **`0035` directly** (skip `0032`).
  - Function exists with `debt_payments` in `definition` → `0032` is applied without `0035`; apply `0035` (`CREATE OR REPLACE FUNCTION`).

### Check 4 — Migration `0033`: `member_preferences.locale`
- **SQL Section:** `-- 4. MIGRATION 0033`
- **Expected Result (from `0033_member_preferences_locale.sql`):**
  - Column `locale`: `text`, `is_nullable = 'NO'`, `column_default = '''id''::text'`.
  - Check constraint: `CHECK ((locale = ANY (ARRAY['id'::text, 'en'::text])))`.
- **Actual Production Result:** `PENDING_USER_EXECUTION`
- **Interpretation:**
  - 0 rows → `0033` is missing; language persistence in DB will fail until `0033` is applied.

### Check 5 — Migration `0034`: `public.child_attachments` & `family-child-attachments` Bucket
- **SQL Section:** `-- 5. MIGRATION 0034`
- **Expected Result (from `0034_child_dev_attachments.sql`):**
  - Table `public.child_attachments` with `rls_enabled = true`, `force_rls = true`.
  - Bucket `family-child-attachments` with `public = false`, `file_size_limit = 10485760`, `allowed_mime_types = {application/pdf,image/jpeg,image/png,image/webp}`.
- **Actual Production Result:** `PENDING_USER_EXECUTION` (R6.1 already noted `public.child_attachments` absent; bucket check confirms whether bucket was created manually or is also absent).
- **Interpretation:**
  - Both absent → `0034` is completely unapplied.

### Check 6 — Migration `0036`: Storage RLS Policies (`family-documents` & `family-child-attachments`)
- **SQL Section:** `-- 6. MIGRATION 0036`
- **Expected Result (from `0036_fix_storage_rls_policies.sql`):**
  - `family_docs_storage_select` / `insert` / `delete`:
    - `CASE WHEN (storage.foldername(name))[2] = 'vault' THEN famora.has_permission(..., 'documents.sensitive_vault') ELSE (famora.has_permission(..., 'documents.standard.manage') OR famora.has_permission(..., 'documents.sensitive_vault')) END`
  - `child_attachments_storage_select`: allows `child_dev.identity.view`, `child_dev.health.view`, or `child_dev.growth_milestones.manage`.
  - `child_attachments_storage_insert` / `delete`: allows `child_dev.growth_milestones.manage` or `child_dev.health.view`.
- **Actual Production Result:** `PENDING_USER_EXECUTION`
- **Interpretation:**
  - If `family_docs_storage_*` lacks the `'vault'` `CASE` branch → production still has the older `0023` Storage policy (BUG-016).
  - If `child_attachments_storage_*` is missing or lacks `child_dev.health.view` → `0036` is not applied.

### Check 7 — Migration `0037`: `family-tasks` & `family-noticeboard` Buckets, Column & Policies
- **SQL Section:** `-- 7. MIGRATION 0037`
- **Expected Result (from `0037_task_and_noticeboard_storage.sql`):**
  - Buckets `family-tasks` and `family-noticeboard`, both `public = false`, `file_size_limit = 10485760`, `allowed_mime_types = {application/pdf,image/jpeg,image/png,image/webp}`.
  - Column `public.family_announcements.attachment_storage_path` (`text`, `is_nullable = 'YES'`).
  - 6 policies on `storage.objects`:
    - `family_tasks_storage_select` / `insert` / `delete`: `famora.is_family_member((storage.foldername(name))[1]::uuid)`
    - `family_noticeboard_storage_select`: `famora.is_family_member(...)`
    - `family_noticeboard_storage_insert` / `delete`: `famora.has_permission(..., 'announcements.publish')`
- **Actual Production Result:** `PENDING_USER_EXECUTION`
- **Interpretation:**
  - Missing buckets/column/policies → `0037` is not applied (expected, since `0037` was authored locally in S4).

### Check 8 — All `famora.*` Functions (Backing the 17 `SECURITY INVOKER` `public.*` Wrappers)
- **SQL Section:** `-- 8. ALL famora.* FUNCTIONS`
- **Expected Result (from `0001`–`0035`):**
  - `famora.*` helper, trigger, and RPC functions exist, with security-sensitive RPCs and RLS helpers configured as `SECURITY DEFINER`, `config_settings = '{search_path=public, famora, pg_temp}'` (or `pg_temp` pinned), and no `EXECUTE` granted to `PUBLIC` or `anon`.
- **Actual Production Result:** `PENDING_USER_EXECUTION`
- **Interpretation:**
  - If any `famora.*` function is missing `search_path` pinning or has `PUBLIC`/`anon` execute privileges, remediate via a dedicated hardening migration before release.
  - If all 17 `public.*` wrappers' backing `famora.*` functions are `SECURITY DEFINER` with pinned `search_path`, the 17 `public.*` `SECURITY INVOKER` wrappers are confirmed safe as designed.

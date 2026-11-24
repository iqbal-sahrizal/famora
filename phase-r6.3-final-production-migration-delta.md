# Famora R6.3 — Final Production Migration Delta & Recovery Plan

**Date:** 2026-11-24  
**Base Phases:** R6.1 (`SCHEMA_MISMATCH_CONFIRMED`), R6.2 (`TARGETED_VERIFICATION_SQL_READY`)  
**Verdict:** **`MIGRATION_PLAN_READY_WITH_BLOCKERS`**

---

## 1. Executive Summary

Live read-only inspection results from Supabase production (`eaxrhlgwsepdlfnveypo`) confirm the **exact production migration delta**:
- **Migrations `0030`, `0031`, `0032`, `0033`, `0034`, `0035`, `0036`, and `0037` are ALL confirmed absent from production.**
- **`0001`–`0029` Baseline:** Production has **78** `public` tables (matching `0001`–`0028`) and **17** `public.*` `SECURITY INVOKER` RPC wrappers (matching `0029`).
- **Critical Security Finding in Production Storage:** `family-documents` currently uses the legacy `0023` policies where `documents.standard.manage` can `SELECT` **any** file in `family-documents` (including `/vault/` files!), and `documents.sensitive_vault` cannot `INSERT`/`SELECT`. Migration `0036` is required to close this gap.
- **`0032` vs `0035` Deployment Strategy:** Since `0032` is absent in production, **skip `0032` completely and apply `0035` directly** so `delete_family_workspace` is created with the corrected FK deletion order on the first pass.
- **`PUBLIC EXECUTE` on 3 `famora.*` Functions:** `guard_family_member_mutation` (`0007`), `log_sensitive_activity` (`0007`), and `handle_new_user` (`0008`) are **`RETURNS TRIGGER`** functions; PostgreSQL forbids calling trigger functions directly via SQL/RPC, so `PUBLIC EXECUTE` on them is expected and **does not** expose an RPC attack surface. However, full `pg_proc` metadata (`prosecdef`, `proconfig`, ownership) for all `famora.*` functions was not yet supplied and remains **UNVERIFIED** in Preflight Part 1.

---

## 2. Confirmed Missing vs Unverified Objects

### Confirmed Missing in Production (Evidence from R6.2 SQL Execution)
| Migration | Confirmed Missing Objects | Evidence |
|---|---|---|
| **`0030`** | `finance_accounts.is_archived`, `finance_accounts.archived_at`, `idx_finance_accounts_family_archived` | Section 1 returned 0 rows. |
| **`0031`** | `notifications_delete_recipient` policy on `public.notifications` | Section 2 returned 0 rows. |
| **`0032` / `0035`** | `famora.delete_family_workspace(uuid)` & `public.delete_family_workspace(uuid)` | Section 3 returned 0 rows. |
| **`0033`** | `member_preferences.locale` column + `locale IN ('id', 'en')` check constraint | Section 4 returned only `member_preferences_theme_mode_check`. |
| **`0034`** | `public.child_attachments` (79th table) + bucket `family-child-attachments` + 2 table policies + 3 storage policies | Section 5 returned 0 rows; 78 tables in prod. |
| **`0036`** | Vault-vs-standard `CASE` Storage RLS on `family-documents` + 3 `child_attachments_storage_*` policies | Section 6 returned legacy `0023` policies only. |
| **`0037`** | Buckets `family-tasks` & `family-noticeboard`, `family_announcements.attachment_storage_path`, 6 Storage RLS policies | Section 7 returned `No rows returned`. |

### Unverified Objects (Do Not Assume Passed or Missing)
1. **`famora.*` Function Security Metadata:** Full `prosecdef`, `proconfig` (`search_path`), ownership, and definitions from Section 8 query 1 were not yet supplied.
2. **Existing `public.notifications` Policies (`0013`):** Section 2 returning 0 rows means `notifications_delete_recipient` is absent, and we should confirm `notifications_select_recipient` / `notifications_update_recipient` (`0013`) are intact in Preflight 1B.
3. **Existing `family-documents` Storage Paths:** Preflight 1C checks whether any existing objects sit in `/vault/` before `0036` restricts `documents.standard.manage` from reading `/vault/`.
4. **Backup / PITR Status:** Still unverified (`backups: []`, `pitr_enabled: false` previously reported).

---

## 3. `0032` vs `0035` Safe Deployment Strategy

- **Bug in `0032`:** `0032_delete_family_workspace_rpc.sql` referenced non-existent `public.debt_payments` (actual table from `0020` is `public.finance_debt_payments`) and omitted `finance_goal_contributions`, `bill_payment_history`, and self-referential `reversed_transaction_id` unlinking on `finance_transactions`.
- **Fix in `0035`:** `0035_fix_delete_family_workspace_rpc.sql` deletes child finance tables in dependency order, clears `reversed_transaction_id`, revokes `EXECUTE` from `PUBLIC, anon` on both `famora.*` and `public.*`, and grants `EXECUTE` to `authenticated`.
- **Strategy:** Since Section 3 confirmed neither `0032` nor `0035` exists in production, **do not execute `0032`**. Execute **`0035` directly** in Step 5 of the migration plan.

---

## 4. Storage Policy Security Review (`0036` & `0037`)

### `family-documents` (`0023` in Production vs `0036` Local)
| Policy | Production Actual (`0023`) | Local Expected (`0036`) | Security Impact |
|---|---|---|---|
| `family_docs_storage_select` | `documents.standard.manage` (all folders!) | `vault` → `documents.sensitive_vault`; else `standard.manage OR sensitive_vault` | **High:** Currently allows standard doc managers to read `/vault/` files and blocks vault-only users. |
| `family_docs_storage_insert` | `documents.standard.manage` (all folders!) | `vault` → `documents.sensitive_vault`; else `standard.manage OR sensitive_vault` | **High:** Currently blocks vault-only users from uploading to `/vault/`. |
| `family_docs_storage_delete` | `documents.sensitive_vault` (all folders!) | `vault` → `documents.sensitive_vault`; else `standard.manage OR sensitive_vault` | **Medium:** Currently blocks standard doc managers from deleting standard files. |

### `family-child-attachments`, `family-tasks`, `family-noticeboard`
- `0036` aligns `family-child-attachments` SELECT with `child_dev.identity.view` / `child_dev.health.view` / `child_dev.growth_milestones.manage` and INSERT/DELETE with `child_dev.growth_milestones.manage` / `child_dev.health.view`.
- `0037` creates private buckets `family-tasks` (family-member scoped) and `family-noticeboard` (family-member SELECT, `announcements.publish` INSERT/DELETE).

---

## 5. `PUBLIC EXECUTE` Grants Review (Section 8)

From local definitions (`0007`, `0008`) and Section 8 privilege output:
- **`famora.guard_family_member_mutation()` (`0007`)** — `RETURNS TRIGGER`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`.
- **`famora.log_sensitive_activity()` (`0007`)** — `RETURNS TRIGGER`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`.
- **`famora.handle_new_user()` (`0008`)** — `RETURNS TRIGGER`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`.

**Assessment:**
- PostgreSQL grants `EXECUTE` to `PUBLIC` by default when creating functions, and **trigger functions (`RETURNS TRIGGER`) cannot be called directly via `SELECT` or PostgREST RPC**. Therefore, `PUBLIC EXECUTE` on these 3 trigger functions is **expected and non-exploitable**. Do **not** blindly revoke `EXECUTE` on `handle_new_user` without confirming `auth.users` trigger ownership.
- **Still Required:** Run Preflight Query 1A in [r6.3_production_migration_plan.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6.3_production_migration_plan.sql) to confirm `prosecdef` and `proconfig` (`search_path`) on all `famora.*` functions.

---

## 6. Dependencies, Ordering & Existing Data Impact

| Order | Migration | Dependencies | Existing Production Data Impact & Backfill |
|---|---|---|---|
| 1 | `0030` | `public.finance_accounts` (`0012`) | **Zero data loss.** Existing rows automatically get `is_archived = false`, `archived_at = NULL`. No backfill needed. |
| 2 | `0031` | `public.notifications` (`0013`), `famora.current_member_id` | **Zero data loss.** Adds `DELETE` RLS policy for recipients. |
| 3 | `0033` | `public.member_preferences` (`0003`) | **Zero data loss.** Existing rows receive `locale = 'id'` via `DEFAULT 'id'`. *(Note: if any existing users previously preferred English, they default to `'id'` and can switch via UI.)* |
| 4 | `0034` | `families`, `child_profiles`, `family_members`, `famora.set_updated_at`, `famora.has_permission` | **Zero data loss.** Creates new empty `child_attachments` table & bucket `family-child-attachments`. |
| 5 | `0035` *(skips `0032`)* | `families`, `family_members`, `family_roles`, `finance_*` tables (`0018`–`0020`) | **Zero data loss.** Pure `CREATE OR REPLACE FUNCTION` + `REVOKE/GRANT`. |
| 6 | `0036` | `0034` (`family-child-attachments` bucket), `0023` (`family-documents` bucket) | **Zero data deletion.** Updates `storage.objects` policies; verify Preflight 1C so standard-only users aren't unexpectedly locked out of misfiled `/vault/` objects. |
| 7 | `0037` | `public.family_announcements` (`0012`) | **Zero data loss.** Existing announcements receive `attachment_storage_path = NULL`. No backfill needed. |

---

## 7. Safe Recovery & Migration Plan

The complete proposed SQL plan is stored in [supabase/queries/r6.3_production_migration_plan.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6.3_production_migration_plan.sql) (**NOT EXECUTED**), structured as:
1. **Part 1 — Preflight `SELECT`-Only Checks:** Inspect `famora.*` `prosecdef`/`proconfig`, `notifications` policies, `family-documents` folder segments, and row counts.
2. **Part 2 — Backup & Recovery Prerequisites:** Enable Supabase Backups/PITR and take a `pg_dump` snapshot before any DDL.
3. **Part 3 — Proposed Migration Transaction (`NOT EXECUTED`):** Ordered `0030` → `0031` → `0033` → `0034` → `0035` → `0036` → `0037` inside `BEGIN ... COMMIT` (no `DROP TABLE`, no `CASCADE`).
4. **Part 4 — Post-Migration Validation `SELECT` Queries:** Verify 79 public tables, new columns, 4 private buckets, and `storage.objects` policies.

### Rollback Summary (If Needed)
- Restore from the pre-migration `pg_dump` / Supabase snapshot, or selectively revert: drop `notifications_delete_recipient` (`0031`), drop new columns (`0030`/`0033`/`0037` `DROP COLUMN IF EXISTS`), drop empty `child_attachments` (`0034`), restore `0023` `family_docs_storage_*` policies, and drop `delete_family_workspace` (`0035`).

---

## 8. Remaining Blockers (`MIGRATION_PLAN_READY_WITH_BLOCKERS`)

1. **Preflight `famora.*` `prosecdef`/`proconfig` Metadata Missing:** Run Part 1A of [r6.3_production_migration_plan.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6.3_production_migration_plan.sql) before executing Part 3.
2. **Production Backup / PITR Unconfirmed:** Backup availability must be verified and a fresh `pg_dump` taken before running Part 3.
3. **Live Isolated RLS Verification Blocked:** Docker / local Supabase remains unavailable to execute `npm run test:rls` and `03_storage_rls_0036_test.sql` prior to production cutover.

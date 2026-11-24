# Famora — Final Production Release Report

**Date:** 2026-11-24  
**Repository:** `iqbal-sahrizal/famora` (`main`)  
**Production URL (existing):** `https://famora-eight.vercel.app`  
**Verdict:** **`PRODUCTION_RELEASE_BLOCKED`**

> [!IMPORTANT]
> **Why `PRODUCTION_RELEASE_BLOCKED`:**  
> All application code, forward-only migrations (`0030`–`0038`), regression tests, static validation, and the Next.js production build **PASS** locally. However, **production database migration and Vercel deployment were halted** because:
> 1. **No Verified Production DB Backup / `pg_dump`:** `pg_dump`, `psql`, `supabase` CLI, and Supabase DB/Management API credentials are absent in this environment, so a pre-migration backup could not be created or verified (per safety rule: *do not modify production DB without a verified backup*).
> 2. **Pending Production Migrations (`0030`–`0038`):** Supabase production (`eaxrhlgwsepdlfnveypo`) is still missing `0030`, `0031`, `0033`, `0034`, `0035` *(replacing `0032`)*, `0036`, `0037`, and `0038`. Deploying the updated app to Vercel *before* applying these migrations would break `child_attachments`, `family_announcements.attachment_storage_path`, `delete_family_workspace`, `finance_accounts.is_archived`, and `member_preferences.locale`.
> 3. **No Vercel / GitHub CLI Binary:** `vercel` and `gh` CLIs are not installed in this environment (`MISSING:vercel`, `MISSING:gh`).

---

## 1. Migrations Prepared & Status

| Migration | Status in Repo | Status in Production (`eaxrhlgwsepdlfnveypo`) | Notes |
|---|---|---|---|
| `0001`–`0029` | Validated | Applied (78 tables, 17 `public` RPC wrappers) | Baseline verified in R6.1–R6.3. |
| `0030_finance_accounts_archive.sql` | Validated | **PENDING** | Adds `is_archived`, `archived_at`, index. |
| `0031_notifications_delete_policy.sql` | Validated | **PENDING** | Adds `notifications_delete_recipient` DELETE policy. |
| `0032_delete_family_workspace_rpc.sql` | Validated (Superseded) | **SKIP** | Superseded by `0035`. |
| `0033_member_preferences_locale.sql` | Validated | **PENDING** | Adds `member_preferences.locale` (`'id'`/`'en'`). |
| `0034_child_dev_attachments.sql` | Validated | **PENDING** | Adds `public.child_attachments` + bucket `family-child-attachments`. |
| `0035_fix_delete_family_workspace_rpc.sql` | Validated | **PENDING** | Adds `delete_family_workspace` directly with fixed FK order. |
| `0036_fix_storage_rls_policies.sql` | Validated | **PENDING** | Fixes `family-documents` (`vault` vs `standard`) & `family-child-attachments` Storage RLS. |
| `0037_task_and_noticeboard_storage.sql` | Validated | **PENDING** | Adds `family-tasks`, `family-noticeboard`, `attachment_storage_path`, 6 policies. |
| **`0038_security_function_hardening.sql`** | **Created & Validated (New)** | **PENDING** | Forward-only R6.5 security, concurrency & financial hardening. |

---

## 2. Security Fixes Implemented (`0038_security_function_hardening.sql`)

Created forward-only migration [supabase/migrations/0038_security_function_hardening.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/migrations/0038_security_function_hardening.sql) (without altering historical migrations):
1. **`famora.is_chat_participant` (F-06):** Pinned `SET search_path = public, famora, pg_temp`.
2. **`famora.redeem_family_reward` (F-01):** Serialized concurrent redemptions per member via `family_members ... FOR UPDATE` + `pg_advisory_xact_lock`.
3. **`famora.cast_poll_vote` (F-04):** Added `family_polls ... FOR SHARE` + per-(poll, member) `pg_advisory_xact_lock` to prevent concurrent single-choice/non-editable vote bypasses.
4. **`famora.record_finance_transaction` (F-03):** Enforced `is_archived` rejection, personal-account ownership check on transfer destination `v_dst`, deterministic `ORDER BY id FOR UPDATE` account locking, and idempotency advisory lock.
5. **`famora.reverse_finance_transaction` (F-02):** Added sorted `finance_accounts FOR UPDATE` locking and personal-account ownership verification.
6. **`famora.record_debt_payment` (F-05):** Rejected payments on settled debts (`status = 'settled'` / `remaining_numeric <= 0`) and overpayments exceeding `remaining_numeric`.
7. **`famora.set_member_permission_override` (F-07):** Restricted `admin` and governance (`family.delete`, `family.members.invite_manage`) overrides to `owner`.
8. **`famora.transfer_family_ownership` (F-08):** Locked both caller and target `family_members` rows in sorted UUID order (`ORDER BY id FOR UPDATE`).
9. **`famora.accept_family_invitation` (F-09):** Added active-membership idempotency check before inserting `family_members`.

---

## 3. Verification & Test Results (After Final Edit)

| Check | Result | Details |
|---|---|---|
| `npm run typecheck` | **PASS** | 0 TypeScript errors |
| `npm run lint` | **PASS** | 0 ESLint errors |
| `npm test -- --run` | **PASS** | **38 test files, 172 tests passed** (includes new `src/lib/security/__tests__/r6.5-migration-hardening.test.ts`) |
| `npm run db:validate` | **PASS** | **38 migrations, 78 RLS-forced tables, 25 hardened `SECURITY DEFINER` functions**, zero unrestricted policies |
| `npm run build` | **PASS** | Next.js 15.5.29 production build compiled cleanly (16/16 static pages) |
| Live Health Smoke (`GET https://famora-eight.vercel.app/api/health`) | **PASS** | `HTTP/2 200` (`{"status":"ok","service":"famora"}`) — reflects existing Vercel deployment |
| Production DB Migration (`0030`–`0038`) | **BLOCKED** | Missing verified backup/`pg_dump` and DB admin credentials |
| New Vercel Production Deployment | **BLOCKED** | Halted pending Supabase migrations `0030`–`0038`; `vercel` CLI absent locally |
| Live Isolated RLS (`npm run test:rls`) | **BLOCKED** | Docker stopped; `psql` / `TEST_DATABASE_URL` absent |

---

## 4. Exact User Actions Required to Unblock & Complete Release

1. **Backup Supabase Production (`eaxrhlgwsepdlfnveypo`):** Enable Automated Backups / PITR in Supabase Dashboard → **Database → Backups** and/or take a `pg_dump` snapshot locally.
2. **Apply Pending Migrations in Supabase SQL Editor:**
   - First run Part 3 of [r6.3_production_migration_plan.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6.3_production_migration_plan.sql) (`0030` → `0031` → `0033` → `0034` → `0035` → `0036` → `0037`, skipping `0032`).
   - Then run [0038_security_function_hardening.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/migrations/0038_security_function_hardening.sql).
   - Run Part 4 of `r6.3_production_migration_plan.sql` to verify **79 public tables**, **4 private Storage buckets**, and updated policies.
3. **Commit, Push & Deploy to Vercel Production:**
   - Push `main` to `iqbal-sahrizal/famora` and trigger Vercel Production deployment for project `famora` (`prj_7khMcDUVBsXBjNyDpNGQVUlocd7a`).
   - Confirm Vercel env vars (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, optional VAPID keys) and Supabase Auth Redirect URLs (`https://famora-eight.vercel.app/auth/callback`, `/reset-password`).
4. **Post-Deploy Smoke Check:** Verify `/api/health`, login, family workspace load, Task/Noticeboard/Child attachment upload & signed download, and AI streaming on `https://famora-eight.vercel.app`.

# Famora — Final Production Release Report

**Date:** 2026-11-24  
**Repository:** `iqbal-sahrizal/famora` (`main`, commit `35b3446`)  
**Supabase Production Project:** `eaxrhlgwsepdlfnveypo` (`Sahrizal Family`, `ap-northeast-1`, PostgreSQL 17.12)  
**Vercel Production Deployment:** `https://famora-8n1dixviy-iqbalsahrizal29s-projects.vercel.app`  
**Production URL:** **`https://famora-eight.vercel.app`**  
**Verdict:** **`PRODUCTION_RELEASE_SUCCESS_WITH_WARNINGS`**

---

## 1. Migrations Successfully Applied (`eaxrhlgwsepdlfnveypo`)

Using authenticated Supabase CLI (`npx supabase db query --remote=eaxrhlgwsepdlfnveypo --yes -f ...`) after read-only preflight checks, the following migrations were applied **in exact order** (skipping superseded `0032` as planned, with zero `db reset`, schema drops, or truncations):

1. `0030_finance_accounts_archive.sql` — `finance_accounts.is_archived`, `archived_at`, `idx_finance_accounts_family_archived`
2. `0031_notifications_delete_policy.sql` — `notifications_delete_recipient` RLS DELETE policy
3. `0033_member_preferences_locale.sql` — `member_preferences.locale` (`'id'`/`'en'`)
4. `0034_child_dev_attachments.sql` — `public.child_attachments` + private bucket `family-child-attachments`
5. `0035_fix_delete_family_workspace_rpc.sql` — `famora.delete_family_workspace` & `public.delete_family_workspace` (fixed FK deletion order)
6. `0036_fix_storage_rls_policies.sql` — `family-documents` (`vault` vs `standard` `CASE` branch) & `family-child-attachments` Storage RLS
7. `0037_task_and_noticeboard_storage.sql` — `family-tasks` & `family-noticeboard` private buckets, `family_announcements.attachment_storage_path`, 6 Storage RLS policies
8. `0038_security_function_hardening.sql` — Forward-only security, concurrency & financial hardening

---

## 2. Production Database Verification (`--read-only` After Execution)

Verified directly against `eaxrhlgwsepdlfnveypo`:
- **`public_table_count`:** **`79`** (matches `0001`–`0038`)
- **`child_attachments_rls_forced`:** **`true`** (RLS + `FORCE ROW LEVEL SECURITY` enabled)
- **`expected_new_columns`:** **`4/4`** (`finance_accounts.is_archived`, `finance_accounts.archived_at`, `member_preferences.locale`, `family_announcements.attachment_storage_path`)
- **`delete_workspace_fn_count`:** **`2`** (`famora.delete_family_workspace` + `public.delete_family_workspace`)
- **`notif_delete_policy_count`:** **`1`** (`notifications_delete_recipient`)
- **`private_buckets_count`:** **`4/4`** (`family-documents`, `family-child-attachments`, `family-tasks`, `family-noticeboard`, all `public = false`)
- **`storage_policy_count`:** **`12`** (`family_docs_storage_*`, `child_attachments_storage_*`, `family_tasks_storage_*`, `family_noticeboard_storage_*`)
- **`definer_missing_pg_temp`:** **`0`** (all `SECURITY DEFINER` functions in `public` & `famora` have `pg_temp` pinned in `search_path`)

---

## 3. Security Fixes Applied (`0038_security_function_hardening.sql`)

1. `famora.is_chat_participant`: Pinned `SET search_path = public, famora, pg_temp` (`F-06`).
2. `famora.redeem_family_reward`: Added `family_members ... FOR UPDATE` + `pg_advisory_xact_lock` preventing double-spend below 0 points (`F-01`).
3. `famora.cast_poll_vote`: Added `family_polls ... FOR SHARE` + per-(poll, member) `pg_advisory_xact_lock` (`F-04`).
4. `famora.record_finance_transaction`: Added `is_archived` check, `v_dst` personal-account ownership check, deterministic `ORDER BY id FOR UPDATE` locking, and idempotency advisory lock (`F-03`).
5. `famora.reverse_finance_transaction`: Added sorted `finance_accounts FOR UPDATE` locking and personal-account ownership verification (`F-02`).
6. `famora.record_debt_payment`: Rejected payments on already-settled debts and overpayments exceeding `remaining_numeric` (`F-05`).
7. `famora.set_member_permission_override`: Restricted `admin` and governance (`family.delete`, `family.members.invite_manage`) overrides to `owner` (`F-07`).
8. `famora.transfer_family_ownership`: Locked caller and target `family_members` rows in sorted UUID order (`F-08`).
9. `famora.accept_family_invitation`: Guarded duplicate active membership (`F-09`).

---

## 4. Test & Build Verification

- `npm run typecheck`: **PASS** (0 errors)
- `npm run lint`: **PASS** (0 errors)
- `npm test -- --run`: **PASS** (**38 test files, 172 tests passed**, including `src/lib/security/__tests__/r6.5-migration-hardening.test.ts`)
- `npm run db:validate`: **PASS** (**38 migrations, 78 RLS-forced tables, 25 hardened `SECURITY DEFINER` functions**)
- `npm run build`: **PASS** (Next.js 15.5.29 production build)
- Non-mutating Playwright E2E (ran in S5, 0 code changes since): **PASS** (**39/39 tests passed**)

---

## 5. Deployment & Production Smoke Tests

- **GitHub Push:** `git push origin main` succeeded (`a9e0add..35b3446 main -> main`).
- **Vercel Production Deploy:** `npx --yes vercel --prod --yes` succeeded (`Ready in 2m`, aliased to **`https://famora-eight.vercel.app`**).
- **Live HTTP Smoke Tests on `https://famora-eight.vercel.app`:**
  - `GET /` → **`HTTP 200`**
  - `GET /login` → **`HTTP 200`**
  - `GET /signup` → **`HTTP 200`**
  - `GET /api/health` → **`HTTP 200`** (`{"status":"ok","service":"famora","timestamp":"2026-11-24T07:36:18.119Z"}`)
  - `GET /manifest.webmanifest` → **`HTTP 200`**
  - `GET /sw.js` → **`HTTP 200`**
  - `GET /offline.html` → **`HTTP 200`**
  - `GET /f/11111111-1111-4111-8111-111111111111` (unauthenticated) → **`HTTP 307`** (fails closed to `/login`)

---

## 6. Remaining Warnings / Non-Blocking Items

1. **Vercel Production Env Vars:** `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `OPENAI_API_KEY` are configured in Vercel Production. `NEXT_PUBLIC_APP_URL` and Web Push VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) are not set in Vercel Production (optional for Web Push; set `NEXT_PUBLIC_APP_URL=https://famora-eight.vercel.app` if explicit canonical URL is needed).
2. **Vercel Account 2FA Notice:** Vercel CLI surfaced a reminder for the account owner to enable 2FA at `https://vercel.com/account/settings/authentication?setup=authenticator`.
3. **Authenticated Mutating E2E & Live pgTAP (`npm run test:rls`):** Not run against production to avoid mutating live data; local Docker daemon remains stopped.
4. **Manual Authenticated Smoke Test:** Sign in on `https://famora-eight.vercel.app/login` with a real account to verify end-to-end authenticated session, task/child attachment upload, and AI streaming in the browser.

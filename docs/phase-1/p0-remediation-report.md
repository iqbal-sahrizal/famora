# Famora — Phase 1: P0 Runtime & Schema Remediation Report

**Verdict:** `PHASE_1_VERIFIED_WITH_BLOCKERS`
**Date:** 2026-11-23
**Deployment Strategy:** `PRODUCTION_ONLY` (no staging environment; local verification only)

---

## 1. Root Causes & Remediations

### 1.1 P0 — Delete Family Workspace RPC & Storage Cleanup
- **Root Causes:**
  1. `supabase/migrations/0032_delete_family_workspace_rpc.sql:45` executed `DELETE FROM public.debt_payments`, whereas the actual table from `0020` is `public.finance_debt_payments`.
  2. `0032:46` deleted `public.finance_transactions` before `public.bill_payment_history`, violating `bill_payment_history.transaction_id` `ON DELETE RESTRICT` (`0019:74`), and did not clear self-referential `finance_transactions.reversed_transaction_id` (`0018:25`).
  3. `0032` omitted explicit `REVOKE ALL ... FROM PUBLIC, anon` on `public.delete_family_workspace(UUID)` and `FROM anon` on `famora.delete_family_workspace(UUID)`.
  4. `src/features/settings/actions.ts:288` queried non-existent `document_files` instead of `documents`, and line `348` cleaned up bucket `"family-chat"` instead of `"chat-attachments"` (`0024:4–7`), while silently ignoring storage cleanup failures.
- **Fixes Applied:**
  - Created forward-only migration `supabase/migrations/0035_fix_delete_family_workspace_rpc.sql` (preserving `0032` intact) that deletes `finance_debt_payments`, `finance_goal_contributions`, and `bill_payment_history` first, clears `reversed_transaction_id`, deletes `finance_transactions` and `finance_accounts`, deletes `families`, and revokes `PUBLIC, anon` execute privileges while preserving `SECURITY DEFINER`, `SET search_path = public, famora, pg_temp`, `family.delete` permission check, and active `owner` check.
  - Updated `src/features/settings/actions.ts` (`deleteFamilyAction`) to query `documents`, clean up `"chat-attachments"`, and surface partial storage cleanup failures via `{ ok: true, warning }`.

### 1.2 P0 — Workspace Profile Query
- **Root Cause:** `src/features/workspace/server.ts:38,89` (`getWorkspaceShellContext`) queried `profiles.display_name`, whereas `public.profiles` (`0002:4–12`) uses `full_name`. PostgREST errored on every workspace load and fell back to `fallbackName`.
- **Fix Applied:** Updated `src/features/workspace/server.ts` to select `full_name` and return `profile?.full_name || fallbackName`. Checked all other `.from("profiles")` queries (`auth/actions.ts`, `auth/server.ts`, `dashboard/server.ts`) — none used `display_name`.

### 1.3 P0 — AI Context Schema Alignment
- **Root Cause:** `src/features/ai/context.ts` (`retrieveAuthorizedFamilyContext`) queried 4 non-existent columns:
  - `calendar_events.starts_at` (actual: `start_at`, `0012:11`)
  - `recipes.category` (actual: no `category` column; `0022:41–52` has `dietary_tags`)
  - `finance_transactions.tx_type` (actual: `kind`, `0018`)
  - `household_bills.amount_cents` (actual: `amount_numeric`, `0019:47–58`)
- **Fix Applied:** Updated `src/features/ai/context.ts` to query `start_at`, `dietary_tags`, `kind` + `amount_numeric` / `amount_cents`, and `amount_numeric`, preserving `AuthorizedFamilyContext` output and `finance.transactions.manage` authorization gating.

### 1.4 P0 — AI Usage Logging
- **Root Cause:** `src/app/api/ai/stream/route.ts` queried `ai_usage_logs` (`0028:38–49`) for hourly rate-limiting but never inserted usage rows after streaming, rate-limiting, or errors.
- **Fix Applied:** Updated `POST /api/ai/stream` in `src/app/api/ai/stream/route.ts` to:
  - Fail closed (500) if rate-limit count query or `ok` usage log insert fails.
  - Insert exactly one `ai_usage_logs` row per request lifecycle (`status: "ok"` on successful generation, `"rate_limited"` on 429, `"error"` on unhandled failure) without duplicating records or exposing provider credentials.

---

## 2. Files Changed & Created

- **Created:** `supabase/migrations/0035_fix_delete_family_workspace_rpc.sql`
- **Modified:** `src/features/settings/actions.ts`
- **Modified:** `src/features/workspace/server.ts`
- **Modified:** `src/features/ai/context.ts`
- **Modified:** `src/app/api/ai/stream/route.ts`
- **Modified:** `src/features/settings/__tests__/delete-family.test.ts`
- **Modified:** `src/features/workspace/__tests__/workspace-navigation.test.ts`
- **Created:** `src/features/ai/__tests__/ai-context-and-stream.test.ts`
- **Created:** `docs/phase-1/p0-remediation-report.md`

---

## 3. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| Migration Validation | `npm --prefix famora run db:validate` | **PASS** (`35` migrations, `78` checked tables, `25` hardened functions) |
| TypeScript | `npm --prefix famora run typecheck` | **PASS** (`0` errors) |
| ESLint | `npm --prefix famora run lint` | **PASS** (`0` errors) |
| Unit & Regression Tests | `npm --prefix famora test` | **PASS** (`33` test files, `142` tests passed; Supabase/Next mocked) |
| Production Build | `npm --prefix famora run build` | **PASS** |
| Playwright E2E | `npm --prefix famora run test:e2e` | **6 passed, 3 skipped** (`19.3s`; `smoke-and-pwa` & `modal-focus` passed; 3 authenticated specs skipped) |
| Live DB Integration (`test:rls`) | `npm --prefix famora run test:rls` | **BLOCKED / NOT TESTED** (no live local/test Supabase database connection/credentials configured) |

---

## 4. Remaining Blockers

- Live PostgreSQL execution of `0035_fix_delete_family_workspace_rpc.sql`, `npm --prefix famora run test:rls`, and authenticated Playwright specs (`aud-001`, `aud-002`, `aud-003`) require a live local/development Supabase database and test credentials (`E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY`).

# Famora — Test Coverage & Verification Report

**Audit Execution Date:** 2026-11-23

---

## 1. Validation & Test Execution Summary

| Check | Command | Status | Observed Result |
| :--- | :--- | :---: | :--- |
| Migration Validation | `npm --prefix famora run db:validate` | **PASS** | Validated `34` migrations, `78` RLS-forced tables, `25` hardened `SECURITY DEFINER` functions, `pin_hash` protection, zero unrestricted policies, zero client service-role refs. |
| TypeScript | `npm --prefix famora run typecheck` | **PASS** | `tsc --noEmit` exited `0` (`0` errors). |
| ESLint | `npm --prefix famora run lint` | **PASS** | `eslint .` exited `0` (`0` errors). |
| Unit Tests | `npm --prefix famora test` | **PASS** | `vitest run`: **32** test files passed (`32`), **137** tests passed (`137`). |
| Production Build | `npm --prefix famora run build` | **PASS** | `next build` compiled all App Router pages, routes, and manifest cleanly. |
| Playwright E2E (Public / Modal / PWA) | `npm --prefix famora run test:e2e` (latest run prior to read-only audit) | **PASS** (partial) | **6 passed** (`smoke-and-pwa.spec.ts` + `modal-focus.spec.ts` in `id` & `en`), **3 skipped**. |
| Playwright E2E (Authenticated Flows) | `e2e/aud-001`, `aud-002`, `aud-003` | **BLOCKED** | Skipped (`3` tests) because `E2E_SUPABASE_URL` / `E2E_SUPABASE_SERVICE_ROLE_KEY` / live test accounts are not configured. |
| Live PostgreSQL RLS Suite | `npm --prefix famora run test:rls` | **NOT TESTED / BLOCKED** | Requires live Supabase database connection & credentials not present in this environment. |

---

## 2. Unit Test Inventory (`32` Files, `137` Tests)

- **Unmocked / Pure Logic (`11` files):** `ai` (5), `chat` (5), `habits-safety` (3), `memories` (3), `notifications` (5), `vapid-rfc8291` (4), `workspace-navigation` (3), `pwa-sync` (6), `permissions` (6), `security-audit` (4).
- **Mocked Supabase / Next Headers (`21` files):** `auth` (8), `calendar` (5), `child-dev` (3), `child-dev-attachments` (3), `chores` (3), `dashboard` (3), `documents` (4), `finance` (7), `finance/analytics` (3), `finance/budgets-bills` (4), `habits-actions` (2), `household` (3), `members` (5), `memories-actions` (2), `noticeboard` (5), `notifications-actions` (2), `onboarding` (4), `settings/delete-family` (3), `settings/rbac` (3), `shopping` (7), `tasks` (3), `lib/i18n` (6).

---

## 3. Critical Coverage Gaps

1. **Zero unit tests for `src/features/safety/`**: Only feature module without `__tests__/`.
2. **Zero React/UI component tests**: `vitest.config.ts` uses `environment: "node"`; no `@testing-library/react` tests for any UI primitive or feature view.
3. **No live DB integration tests run**: `db:validate` is static regex/AST-free SQL scanning; `test:rls` has not executed against a live Postgres instance (which is why runtime SQL bugs like `0032`'s `debt_payments` and `0027`'s `workspace.settings.manage` went undetected).
4. **No authenticated E2E domain coverage**: `e2e/` lacks authenticated tests for onboarding, invites, calendar, chores, noticeboard, chat, finance, child-dev, habits, memories, safety, documents, household, settings, AI, and notifications.

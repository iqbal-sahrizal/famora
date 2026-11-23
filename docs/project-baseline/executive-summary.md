# Famora — Phase 0 Executive Summary

**Audit Date:** 2026-11-23
**Audit Mode:** Read-Only Baseline Audit
**Verdict:** `FAMORA_BASELINE_AUDIT_WITH_BLOCKERS`

---

## 1. High-Level Assessment

Famora is a multi-tenant, family-scoped Next.js 15 + Supabase household operating system with **34 App Router pages**, **3 API/auth route handlers**, **21 feature modules**, **79 PostgreSQL tables**, **34 SQL migrations**, **4 private Storage buckets**, and **PWA/Web Push** support.

The codebase has strong foundational architecture:
- Strict TypeScript (`tsc --noEmit`: 0 errors) and ESLint (`eslint .`: 0 errors).
- Comprehensive database RLS baseline (`79` RLS-forced tables, `27` `SECURITY DEFINER` functions in `famora.*`, `18` `public.*` `SECURITY INVOKER` RPC wrappers, column-level `pin_hash` protection).
- Full 22-domain navigation and real Supabase Server Actions / loaders across every domain.
- Recent P0 fixes already in place for modal form focus retention (`src/components/ui/dialog.tsx`) and `memories/server.ts` (`family_roles!inner(role_key)` & `families.privacy_settings`).

However, this read-only audit uncovered **critical runtime, schema, security, and verification blockers** that must be addressed before staging/production release.

---

## 2. Key Metrics at a Glance

| Area | Count / Status | Notes |
| :--- | :--- | :--- |
| App Router Pages & Handlers | **34** `page.tsx`, **3** `route.ts` | 21 dedicated domain pages + dashboard + `more` + `[domain]` fallback |
| Feature Modules | **21** folders (`32` view components) | All 22 `DOMAIN_NAV_ITEMS` have dedicated routes |
| Database Migrations | **34** (`0001_`–`0034_`) | `79` `public.*` tables (`db:validate` checks `78`, missing `child_attachments`) |
| Storage Buckets | **4** private buckets | `family-documents`, `chat-attachments`, `family-memories`, `family-child-attachments` |
| Static & Unit Checks | **PASS** | `db:validate`, `typecheck`, `lint`, `32` test files (`137` tests), `next build` |
| Live DB / Auth E2E | **BLOCKED** | No live Supabase/RLS test credentials configured (`3` E2E specs skipped, `test:rls` not run) |

---

## 3. Critical Blockers & Top Defects

1. **[P0 - Runtime Failure] `delete_family_workspace` RPC (`0032`) & Storage Bucket Mismatch (`settings/actions.ts:348`):**
   - `0032_delete_family_workspace_rpc.sql:45` deletes from non-existent `public.debt_payments` (actual table: `public.finance_debt_payments`), and deletes `finance_transactions` before `bill_payment_history` despite `ON DELETE RESTRICT` FK (`0019:74`).
   - `src/features/settings/actions.ts:348` attempts cleanup from bucket `"family-chat"` instead of `"chat-attachments"` (`0024:4–7`).
2. **[P0 - Runtime Query Failures] `ai/context.ts` & `workspace/server.ts`:**
   - `src/features/ai/context.ts` queries 4 non-existent columns (`calendar_events.starts_at` vs `start_at`, `recipes.category`, `finance_transactions.tx_type` vs `kind`, `household_bills.amount_cents` vs `amount_numeric`).
   - `src/features/workspace/server.ts:36–40` queries `profiles.display_name` instead of `profiles.full_name` (`0002:4–12`), silently falling back on every page load.
3. **[P1 - Security / RLS] Unseeded Permission Key & Storage Tier Bypasses:**
   - `0027_notification_system.sql:89,100,113` references `'workspace.settings.manage'` (never seeded; canonical key is `'family.settings.manage'`).
   - `family-documents` (`0023`) and `family-child-attachments` (`0034`) storage policies do not enforce `documents.sensitive_vault` or `child_dev.health.view`.
   - `famora.is_chat_participant` (`0024:107–127`) omits `pg_temp` in `search_path`, `access_expires_at`, and `deleted_at IS NULL`.
4. **[P1 - RBAC / Data Integrity] TypeScript RBAC Drift & Truncated Aggregates:**
   - `src/types/domain.ts` and `src/lib/security/permissions.ts` omit the 3 `child_dev.*` permissions seeded in `0021`.
   - `chores/server.ts` (`myPointsBalance`) and `finance/server.ts` (`totalIncomeNumeric`/`totalExpenseNumeric`) sum capped `.limit(40)` / `.limit(60)` subsets; `finance/server.ts` includes archived accounts in `totalBalanceNumeric`.
5. **[P1 - Infrastructure & Verification] Missing Staging Execution & Env Drift:**
   - Live PostgreSQL RLS verification (`test:rls`), authenticated E2E tests (`3` specs), and live Web Push / OpenAI / Email integrations are not verified in a live environment.

---

## 4. Document Index

- [architecture-overview.md](./architecture-overview.md)
- [complete-feature-inventory.md](./complete-feature-inventory.md)
- [database-inventory.md](./database-inventory.md)
- [security-inventory.md](./security-inventory.md)
- [backend-integration-audit.md](./backend-integration-audit.md)
- [frontend-ui-ux-audit.md](./frontend-ui-ux-audit.md)
- [pwa-integration-audit.md](./pwa-integration-audit.md)
- [test-coverage-report.md](./test-coverage-report.md)
- [defect-register.md](./defect-register.md)
- [recommended-development-roadmap.md](./recommended-development-roadmap.md)

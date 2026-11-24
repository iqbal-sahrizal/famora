# Famora R6 — Production Release Gate & Migration Safety

**Date:** 2026-11-24  
**Base Verdict:** `RELEASE_READY_WITH_DEBT` (`phase-s5-final-qa-release-readiness.md`)  
**Phase R6 Verdict:** **`PRODUCTION_RELEASE_BLOCKED`**

> [!IMPORTANT]
> **Why `PRODUCTION_RELEASE_BLOCKED`:**  
> Application code, static checks, unit tests, migration static audit, Next.js production build, and non-mutating Playwright E2E all **PASS**. However, the **production release gate** is **BLOCKED** until three non-negotiable prerequisites are resolved:
> 1. **Production Catalog Reconciliation:** Live read-only catalog inspection of Supabase project `eaxrhlgwsepdlfnveypo` (`ap-northeast-1`, PostgreSQL 17.12) has not been executed yet (`0034` `child_attachments`, `0036`, `0037` remain unconfirmed; local `0001`–`0034` define 79 public tables vs 78 previously reported).
> 2. **Verified Production Backup:** Previous status reported `backups: []` and `pitr_enabled: false`; current backup/PITR status has not been confirmed active.
> 3. **Live Isolated RLS & Storage Verification:** Docker daemon is stopped (`DOCKER_NOT_RUNNING`), `supabase` CLI / `psql` / `TEST_DATABASE_URL` are absent, so `npm run test:rls`, `03_storage_rls_0036_test.sql`, `0037` Storage RLS, and authenticated mutating E2E remain **BLOCKED**.

---

## 1. Executive Summary

Phase R6 prepared Famora for safe production release **without** deploying, running production migrations, mutating production data, changing environment variables, or altering DNS.

Deliverables created in R6:
- **Grouped Read-Only Production Catalog Inspection SQL:** [supabase/queries/r6_production_catalog_inspection.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6_production_catalog_inspection.sql) (11 `SELECT`-only sections covering tables, RLS/FORCE RLS, columns, constraints, indexes, triggers, functions, policies, grants, `user_devices.pin_hash` column privileges, storage buckets, extensions, and `supabase_migrations.schema_migrations`).
- **Full Migration Reconciliation Matrix (`0001`–`0037`)** with risk classification, baseline guidance, and rollback procedures.
- **Backup, Recovery & Isolated Test Environment Setup Guide**.
- **Separated Deployment Runbook** (Supabase vs Vercel vs Domain vs User-Approval-Required actions).

---

## 2. Production Catalog Findings & Read-Only Inspection Query

Because direct PostgreSQL / Supabase Management API credentials for `eaxrhlgwsepdlfnveypo` are not available in this session (and must never be pasted into chat), live production catalog parity **cannot be claimed**.

### Known Baseline Clues Requiring Verification
- Production project: `eaxrhlgwsepdlfnveypo` (`ap-northeast-1`, PostgreSQL 17.12).
- Previously observed public table count: **78**; local migrations `0001`–`0033` define **78** public tables, and `0034_child_dev_attachments.sql` adds the **79th** public table (`public.child_attachments`) plus bucket `family-child-attachments`.
- `supabase_migrations.schema_migrations` was previously reported absent (indicating schema may have been applied manually via SQL Editor rather than `supabase db push`).
- `0036_fix_storage_rls_policies.sql` and `0037_task_and_noticeboard_storage.sql` (which adds `family_announcements.attachment_storage_path` and buckets `family-tasks`, `family-noticeboard`) are local-only and **not confirmed in production**.

### How to Run the Read-Only Inspection
1. Open **Supabase Dashboard → Project `eaxrhlgwsepdlfnveypo` → SQL Editor**.
2. Paste and run each numbered section of [r6_production_catalog_inspection.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6_production_catalog_inspection.sql) (100% `SELECT`-only, zero mutations).
3. Save/export the outputs for Sections 1–11 (especially Section 1 table list, Section 2 `family_announcements` & `member_preferences` & `finance_accounts` columns, Section 6 `famora.delete_family_workspace`, Section 7 `storage.objects` policies, Section 9 `storage.buckets`, and Section 11 `has_schema_migrations_table`) to confirm exact parity before any migration runs.

---

## 3. Migration Reconciliation Matrix (`0001`–`0037`)

Status legend:
- **UNVERIFIED (LIKELY_APPLIED):** Needed by existing 78-table production schema, but requires Section 1–8 catalog output to confirm.
- **UNVERIFIED (LIKELY_NOT_APPLIED):** Added in late audit/S1/S4 phases; must be verified before applying.

| Migration | Key Objects | Risk | Reconciliation Status | Conflict / Action Notes |
|---|---|---|---|---|
| `0001_extensions_and_helpers.sql` | `famora.set_updated_at()` | Low | UNVERIFIED (LIKELY_APPLIED) | Check Section 6 & 10. |
| `0002_core_identity_and_families.sql` | `profiles`, `families`, `family_roles`, `permissions`, `role_permissions` | Low | UNVERIFIED (LIKELY_APPLIED) | 5 tables. |
| `0003_membership_and_invitations.sql` | `family_members`, `family_invitations`, `member_preferences`, `user_devices`, `activity_logs` | Low | UNVERIFIED (LIKELY_APPLIED) | 5 tables (total 10). |
| `0004_rls_and_security_baseline.sql` | Baseline RLS + `is_family_member`, `current_member_id`, `has_permission` | High | UNVERIFIED (LIKELY_APPLIED) | Verify `FORCE RLS` (Section 1). |
| `0005_seed_roles_and_permissions.sql` | Role/permission seeds | Low | UNVERIFIED (LIKELY_APPLIED) | Idempotent seed check recommended. |
| `0006_security_privileges_and_overrides.sql` | `member_permission_overrides`, `member_role_key`, `has_role` | High | UNVERIFIED (LIKELY_APPLIED) | 1 table (total 11). |
| `0007_anti_escalation_and_audit_triggers.sql` | `guard_family_member_mutation`, `accept_family_invitation`, `log_sensitive_activity` | High | UNVERIFIED (LIKELY_APPLIED) | Check Section 5 triggers. |
| `0008_auth_profile_trigger.sql` | `handle_new_user` | Medium | UNVERIFIED (LIKELY_APPLIED) | Check auth trigger. |
| `0009_family_onboarding_and_rpc.sql` | `create_family_with_owner` | Medium | UNVERIFIED (LIKELY_APPLIED) | Check Section 6. |
| `0010_member_management_and_invitations.sql` | `get_invitation_preview`, `reject_family_invitation`, `transfer_family_ownership` | Medium | UNVERIFIED (LIKELY_APPLIED) | Check Section 6. |
| `0011_family_rbac_and_settings.sql` | `get_my_family_permissions`, `set_member_permission_override` | Medium | UNVERIFIED (LIKELY_APPLIED) | Check Section 6. |
| `0012_dashboard_domain_tables.sql` | `calendar_events`, `tasks`, `family_announcements`, `shopping_items`, `finance_accounts`, `finance_transactions` | Medium | UNVERIFIED (LIKELY_APPLIED) | 6 tables (total 17). |
| `0013_family_calendar_full.sql` | `calendar_event_participants`, `notifications` | Low | UNVERIFIED (LIKELY_APPLIED) | 2 tables (total 19). |
| `0014_family_tasks_full.sql` | `task_assignees`, `task_subtasks`, `task_comments`, `task_attachments`, `task_history` | Low | UNVERIFIED (LIKELY_APPLIED) | 5 tables (total 24). |
| `0015_chores_and_rewards.sql` | `chore_templates`, `chore_submissions`, `reward_catalog`, `reward_points_ledger`, `family_challenges`, RPCs | Medium | UNVERIFIED (LIKELY_APPLIED) | 5 tables (total 29). |
| `0016_family_shopping_full.sql` | `shopping_lists`, `shopping_templates`, `shopping_item_history` | Low | UNVERIFIED (LIKELY_APPLIED) | 3 tables (total 32). |
| `0017_announcements_and_polls.sql` | `announcement_reads`, `family_polls`, `family_poll_options`, `family_poll_votes`, RPCs | Low | UNVERIFIED (LIKELY_APPLIED) | 4 tables (total 36). |
| `0018_family_finance_core.sql` | `finance_categories`, `finance_audit_history`, `record/reverse_finance_transaction` | High | UNVERIFIED (LIKELY_APPLIED) | 2 tables (total 38). |
| `0019_budgets_and_bills.sql` | `finance_budgets`, `recurring_schedules`, `household_bills`, `bill_payment_history`, RPCs | High | UNVERIFIED (LIKELY_APPLIED) | 4 tables (total 42). |
| `0020_financial_analytics_and_goals.sql` | `finance_goals`, `finance_goal_contributions`, `finance_debts_receivables`, `finance_debt_payments`, RPCs | High | UNVERIFIED (LIKELY_APPLIED) | 4 tables (total 46). |
| `0021_child_development.sql` | `child_profiles`, `child_growth_records`, `child_milestones`, `child_education_records`, `child_health_records` | Medium | UNVERIFIED (LIKELY_APPLIED) | 5 tables (total 51). |
| `0022_household_management.sql` | `inventory_items`, `inventory_movements`, `recipes`, `meal_plans`, `home_*` (4 tables) | Low | UNVERIFIED (LIKELY_APPLIED) | 8 tables (total 59). |
| `0023_family_document_vault.sql` | `documents`, `document_history`, bucket `family-documents` | High | UNVERIFIED (LIKELY_APPLIED) | 2 tables (total 61). |
| `0024_family_chat.sql` | `chat_conversations`, `chat_participants`, `chat_messages`, `chat_message_reactions`, bucket `chat-attachments` | Medium | UNVERIFIED (LIKELY_APPLIED) | 4 tables (total 65). |
| `0025_family_memories.sql` | `memory_albums`, `memory_items`, `memory_favorites`, bucket `family-memories` | Low | UNVERIFIED (LIKELY_APPLIED) | 3 tables (total 68). |
| `0026_habits_and_safety.sql` | `habits`, `habit_logs`, `safety_contacts`, `safety_protocols`, `safety_location_shares` | Medium | UNVERIFIED (LIKELY_APPLIED) | 5 tables (total 73). |
| `0027_notification_system.sql` | `notification_outbox`, `notification_delivery_logs` | Low | UNVERIFIED (LIKELY_APPLIED) | 2 tables (total 75). |
| `0028_ai_assistant.sql` | `ai_conversations`, `ai_messages`, `ai_usage_logs` | Low | UNVERIFIED (LIKELY_APPLIED) | 3 tables (total **78**). |
| `0029_public_rpc_wrappers.sql` | 17 `public.*` RPC wrappers | High | UNVERIFIED (LIKELY_APPLIED) | Check Section 6. |
| `0030_finance_accounts_archive.sql` | Alters `finance_accounts` (archive column) | Low | UNVERIFIED | Verify column in Section 2. |
| `0031_notifications_delete_policy.sql` | Delete policy on `notifications` | Low | UNVERIFIED | Verify policy in Section 7. |
| `0032_delete_family_workspace_rpc.sql` | `delete_family_workspace` RPC | High | UNVERIFIED | Superseded by `0035` fix. |
| `0033_member_preferences_locale.sql` | `member_preferences.locale` column | Low | UNVERIFIED | Verify column in Section 2. |
| **`0034_child_dev_attachments.sql`** | **`child_attachments` (79th table) + bucket `family-child-attachments` + 5 policies** | **High** | **UNVERIFIED (SUSPECTED MISSING)** | Previously unconfirmed; matches 78 vs 79 table gap. |
| **`0035_fix_delete_family_workspace_rpc.sql`** | Fixes `delete_family_workspace` FK/order (`finance_debt_payments`, `bill_payment_history`, etc.) | **High** | **UNVERIFIED** | Uses `CREATE OR REPLACE FUNCTION` (safe/idempotent). |
| **`0036_fix_storage_rls_policies.sql`** | Tightens `storage.objects` policies for `family-documents` (`vault` vs `standard`) & `family-child-attachments` | **High** | **UNVERIFIED (LOCAL_ONLY)** | Uses `DROP POLICY IF EXISTS` + `CREATE POLICY`; requires `0034` bucket first. |
| **`0037_task_and_noticeboard_storage.sql`** | Buckets `family-tasks`, `family-noticeboard`; `family_announcements.attachment_storage_path`; 6 Storage RLS policies | **Medium** | **UNVERIFIED (LOCAL_ONLY)** | Uses `ON CONFLICT DO NOTHING`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS`. |

### Baseline / Repair Recommendation
- **Do NOT** run `supabase db push` blindly if `supabase_migrations.schema_migrations` is missing or empty — `db push` would try to replay `0001`–`0033` and fail on existing tables/policies.
- **Recommended Safe Path (after Section 1–11 catalog verification):**
  1. Confirm via Section 1–8 SQL outputs which of `0001`–`0033` match production.
  2. Only after user approval and verified backup, record verified applied versions in `supabase_migrations.schema_migrations` (or `supabase migration repair --status applied <version>`), then apply only the verified pending migrations (`0034`, `0035`, `0036`, `0037`) in strict order.

---

## 4. Backup & Recovery Status

- **Previous Status:** `backups: []`, `pitr_enabled: false`.
- **Current Verification Status:** **UNVERIFIED / BLOCKER** (no Supabase Management API access in this environment to confirm whether automated backups or PITR have been enabled).
- **Release Gate Rule:** **Do NOT apply migrations `0034`–`0037` to production until a fresh pre-migration backup/snapshot is confirmed.**
- **Concrete Steps to Enable Backup / PITR:**
  1. **Supabase Pro/Team Plan:** Enable **Daily Automated Backups** and **Point-in-Time Recovery (PITR)** in Supabase Dashboard → Project `eaxrhlgwsepdlfnveypo` → **Database → Backups**.
  2. **Pre-Migration Logical Backup (`pg_dump`):** Even with dashboard backups, run a read-only `pg_dump --schema=public --schema=famora --format=custom` (or Supabase CLI `supabase db dump`) immediately before applying `0034`–`0037`, and store the dump securely offline.

### Rollback Plan for Pending Migrations (`0034`–`0037`)
- **`0037_task_and_noticeboard_storage.sql`:** Drop the 6 Storage policies (`family_tasks_storage_*`, `family_noticeboard_storage_*`), `ALTER TABLE public.family_announcements DROP COLUMN IF EXISTS attachment_storage_path;`, and remove empty buckets `family-tasks` / `family-noticeboard`.
- **`0036_fix_storage_rls_policies.sql`:** Re-apply the prior `family_docs_storage_*` and `child_attachments_storage_*` policies from backup/git (`0023`/`0034`).
- **`0035_fix_delete_family_workspace_rpc.sql`:** Restore previous `famora.delete_family_workspace` definition from `0032` (only if needed; `0035` fixes real FK deletion bugs).
- **`0034_child_dev_attachments.sql`:** Drop `public.child_attachments` policies & table (only if empty/newly created) and delete bucket `family-child-attachments` if empty.

---

## 5. Live RLS, Storage & Isolated Test Environment

| Check | Status | Details |
|---|---|---|
| Docker Daemon (`docker info`) | **BLOCKED** | `/opt/homebrew/bin/docker` exists, daemon is **not running** (`DOCKER_NOT_RUNNING`). |
| Supabase CLI (`npx --no-install supabase --version`) | **BLOCKED** | Not installed locally; network registry unreachable inside sandbox. |
| `psql` & `TEST_DATABASE_URL` | **BLOCKED** | `psql not found`; `TEST_DATABASE_URL` unset. |
| `npm run db:validate` | **PASS** | Validated 37 migrations, 78 RLS-forced tables, 25 hardened `SECURITY DEFINER` functions, column-level `pin_hash` protection, zero unrestricted policies, zero client service-role references. |
| `npm run test:rls` | **BLOCKED** | Exits with `BLOCKED: TEST_DATABASE_URL is not set.` |
| `supabase/tests/03_storage_rls_0036_test.sql` & `0037` Storage RLS | **BLOCKED** | Requires running PostgreSQL/Supabase instance (`docker` + `psql`). |
| Authenticated Mutating Playwright E2E | **BLOCKED** | Requires disposable Supabase test project + `E2E_SUPABASE_SERVICE_ROLE_KEY`. |

### Developer Setup Instructions for Live RLS & E2E
```bash
# 1. Start Docker Desktop, then start isolated local Supabase:
npx supabase start
npx supabase db reset   # Applies all 37 migrations cleanly to empty local DB

# 2. Run live PostgreSQL & Storage RLS tests against local DB:
export TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
npm run test:rls
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/03_storage_rls_0036_test.sql
```

---

## 6. Production Environment Configuration Review

- **GitHub Repository:** `git@github.com:iqbal-sahrizal/famora.git`, branch `main`.
- **Vercel Link (`.vercel/repo.json`):**
  - Project Name: `famora` (`prj_7khMcDUVBsXBjNyDpNGQVUlocd7a`)
  - Org ID: `team_6hVdNfDHSdajJfME9E9lrvjG`
  - Root Directory: `.`
  - Tentative Production URL (per R6 spec, pending custom domain verification): `https://famora-eight.vercel.app`
- **Environment Variables (Key Names Only — No Secrets Printed):**
  - Present in `.env.local`: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `OPENAI_API_KEY`, `VERCEL_OIDC_TOKEN`.
  - Required in Vercel Production: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL` (`https://famora-eight.vercel.app` or verified custom domain), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY` (if AI Assistant enabled), and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (if Web Push enabled).
- **Supabase Auth Settings to Verify (Read-Only Checklist):**
  - Site URL = `https://famora-eight.vercel.app` (or verified custom domain)
  - Redirect URLs include `https://famora-eight.vercel.app/auth/callback` and `https://famora-eight.vercel.app/reset-password`

---

## 7. Final Application Verification Status

Zero application source files (`src/`), migrations (`supabase/migrations/`), or E2E specs (`e2e/`) were modified after S5 (`r6_production_catalog_inspection.sql` is a standalone read-only SQL file).

| Check | Status | Scope / Result |
|---|---|---|
| `npm run typecheck` | **PASS** | Ran after final S5 code edit (0 errors). |
| `npm run lint` | **PASS** | Ran after final S5 code edit (0 errors). |
| `npm test -- --run` | **PASS** | 37 files, 168 tests passed (mocked Supabase where applicable). |
| `npm run db:validate` | **PASS** | Re-verified in R6: 37 migrations, 78 RLS-forced tables, 25 hardened `SECURITY DEFINER` functions. |
| `npm run build` | **PASS** | Next.js 15.5.29 production build compiled cleanly (16/16 static pages). |
| Playwright Non-Mutating E2E | **PASS** | 39/39 tests passed (`smoke-and-pwa`, `mobile-m1`, `modal-focus`, `mobile-m6-pwa`, `s5-responsive-a11y`). |
| Live RLS & Storage (`npm run test:rls`) | **BLOCKED** | Docker stopped; `psql` and `TEST_DATABASE_URL` absent. |
| Authenticated Mutating E2E | **BLOCKED** | Disposable test Supabase / `E2E_SUPABASE_SERVICE_ROLE_KEY` absent. |

---

## 8. Production Deployment Runbook (Separated by Responsibility)

### A. Actions Requiring Explicit User Approval First
- Confirming and enabling **Supabase Backups / PITR** + taking pre-migration dump.
- Running [r6_production_catalog_inspection.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6_production_catalog_inspection.sql) in Production SQL Editor and sharing non-secret schema comparison output.
- Approving migration repair/application (`0034`–`0037`) on `eaxrhlgwsepdlfnveypo`.
- Approving Vercel production deployment & any custom domain DNS changes.

### B. Actions on Supabase (`eaxrhlgwsepdlfnveypo`)
1. Verify automated backups / take `pg_dump` snapshot.
2. Run read-only catalog inspection (`r6_production_catalog_inspection.sql`) and verify which of `0030`–`0037` are missing.
3. Baseline verified applied migrations in `supabase_migrations.schema_migrations` (never blindly `db push`).
4. Apply pending migrations in exact order: `0034_child_dev_attachments.sql` → `0035_fix_delete_family_workspace_rpc.sql` → `0036_fix_storage_rls_policies.sql` → `0037_task_and_noticeboard_storage.sql`.
5. Confirm private buckets (`family-documents`, `chat-attachments`, `family-memories`, `family-child-attachments`, `family-tasks`, `family-noticeboard`) and Storage RLS policies exist.
6. Confirm Auth Site URL and Redirect URLs match production URL.

### C. Actions on Vercel (`famora` / `prj_7khMcDUVBsXBjNyDpNGQVUlocd7a`)
1. Verify Production env vars (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, optional VAPID keys).
2. Confirm Root Directory = `.`, Framework = Next.js, Node.js runtime = `22.x` (recommended to resolve `@supabase/supabase-js` Node 20 deprecation warning).
3. Deploy `main` to Production after Supabase migrations `0034`–`0037` are verified applied.
4. Run post-deploy smoke checks: `/api/health`, `/manifest.webmanifest`, `/sw.js`, login, workspace load, task/noticeboard upload, and AI stream.
5. Monitor Vercel Runtime Logs and Supabase Logs for 5xx/RLS errors.

### D. Actions on Domain / DNS (Only If Custom Domain Configured)
1. Currently using tentative production URL `https://famora-eight.vercel.app` (do not assume any custom domain is linked).
2. If linking a custom domain later: add domain in Vercel Project Settings, configure DNS CNAME/A records, wait for HTTPS certificate provisioning, then update `NEXT_PUBLIC_APP_URL` and Supabase Auth Site URL / Redirect URLs to match.

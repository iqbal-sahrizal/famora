# Famora — Recommended Development Roadmap

Following the disciplined, phase-based methodology (mirroring Smart RT), no new features or staging deployments should proceed until P0/P1 baseline defects and live DB verification are resolved.

---

## Phase 1 — Critical Runtime & Schema Fixes (P0)
- Fix `delete_family_workspace` RPC (`0035` migration): replace `debt_payments` with `finance_debt_payments`, delete `bill_payment_history` before `finance_transactions`, and add `REVOKE ALL ... FROM PUBLIC, anon`.
- Fix `src/features/settings/actions.ts:348` bucket name from `"family-chat"` to `"chat-attachments"`.
- Fix `src/features/workspace/server.ts:38` (`profiles.full_name`).
- Fix `src/features/ai/context.ts` 4 column mismatches (`start_at`, remove `recipes.category`, `kind`, `amount_numeric`) and `src/app/api/ai/stream/route.ts` `ai_usage_logs` insertion.

## Phase 2 — Security, RLS & RBAC Alignment (P1)
- Add migration fixing `0027` RLS (`'workspace.settings.manage'` -> `'family.settings.manage'`), tightening `family-documents` (`documents.sensitive_vault`) and `family-child-attachments` (`child_dev.health.view`) storage policies, and hardening `famora.is_chat_participant` (`SET search_path = public, famora, pg_temp`, `access_expires_at`, `deleted_at IS NULL`, author-only attachment delete).
- Sync `src/types/domain.ts` and `src/lib/security/permissions.ts` with `0021` (`child_dev.identity.view`, `child_dev.growth_milestones.manage`, `child_dev.health.view`).
- Update `scripts/validate-migrations.mjs` to include all `79` tables (`child_attachments`) and all migrations containing `SECURITY DEFINER`.

## Phase 3 — Data Accuracy, Backend Hardening & Env Cleanup (P1/P2)
- Fix `finance/server.ts` (exclude archived accounts from `totalBalanceNumeric`; use SQL/unbounded aggregates for `totalIncomeNumeric`/`totalExpenseNumeric`) and `chores/server.ts` (compute `myPointsBalance` across full ledger, not `.limit(40)`).
- Add Zod validation & explicit permission checks to remaining Server Actions; wrap multi-step writes (poll creation, conversation + participants, task + subtasks) in RPCs or rollback guards; log server loader errors cleanly.
- Reconcile `src/lib/env.ts` with `.env.example`, `provider.ts`, and `vapid.ts`; fix `settings` WhatsApp/inApp state wiring; implement or explicitly disable `drafts` in `domain-sync.ts`.

## Phase 4 — Accessibility, Remaining i18n Polish & Unit Test Gaps (P2)
- Localize remaining hardcoded strings (`src/app/page.tsx`, `Skip to content`, `ThemeToggle`, `ErrorState`, `password-field.tsx`).
- Add `Select` error ARIA, `Dropdown` ARIA/keyboard, and `Tabs` arrow-key navigation.
- Add unit tests for `src/features/safety/` and targeted React component tests.

## Phase 5 — Live Supabase Staging, RLS & Authenticated E2E Verification
- Provision staging Supabase project, apply `0001`–`0035` migrations, verify Storage buckets, and run `npm run test:rls`.
- Run full authenticated Playwright E2E suite (`aud-001`, `aud-002`, `aud-003` + domain CRUD/RBAC flows) and live browser Web Push test before production release.

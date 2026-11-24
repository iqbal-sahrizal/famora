# Famora S4 — CRUD Completion, Stub Removal & AI Integration

**Date:** 2026-11-24  
**Base Verdict:** `S3_IMPLEMENTED_WITH_DEBT` (`phase-s3-offline-sync-reliability.md`)  
**Phase S4 Verdict:** `S4_IMPLEMENTED_WITH_DEBT`

---

## 1. Executive Summary

Phase S4 audited all Famora modules for stubbed UI, decorative/unwired handlers, incomplete CRUD flows, metadata-only file attachments, and disconnected AI streaming/action execution, then implemented production fixes across:

1. **AI Assistant (`/api/ai/stream`, multi-turn history, error safety, and confirmed action execution)**
2. **Real Supabase Storage Uploads, Signed URL Downloads & Orphan Cleanup (Tasks & Noticeboard)**
3. **Polls & Memory Albums CRUD**
4. **Chores, Rewards & Challenges CRUD**
5. **Budgets, Bills, Recurring Schedules, Goals & Debts CRUD**
6. **Household (Home Assets, Maintenance Tasks, Service Providers, Inventory, Meal Plans, Recipes) CRUD**
7. **Child Development (Profiles, Growth, Milestones, Education, Health) CRUD with strict permission separation**

All static checks (`npm run typecheck`, `npm run lint`), all **37 Vitest files (167 tests)**, `npm run db:validate` (**37 migrations, 78 RLS-forced tables, 25 hardened SECURITY DEFINER functions**), and all **30 non-mutating Playwright E2E tests** pass after the final edit.  
Live PostgreSQL/RLS (`npm run test:rls`) and authenticated mutating E2E suites remain `BLOCKED` because Docker is not running, `supabase` CLI / `psql` are not installed, and no disposable test database URL (`TEST_DATABASE_URL`) or test service-role key (`E2E_SUPABASE_SERVICE_ROLE_KEY`) is configured (production Supabase was never mutated).

---

## 2. Pre-Fix Feature & Stub Inventory

| Module | Pre-Fix Status | Key Gaps Identified & Fixed in S4 | Post-Fix Status |
|---|---|---|---|
| **AI Assistant** | `STUB` / `PARTIAL` | `family-ai-view.tsx` used non-streaming server action; `/api/ai/stream` persisted orphan user message before OpenAI call; no multi-turn history; `confirmAiProposedAction` only handled `create_shopping_items`. | `WORKING` |
| **Tasks Attachments** | `STUB` | `uploadTaskAttachmentAction` / UI stored metadata/filename only without Supabase Storage upload, download URL, or delete cleanup. | `WORKING` |
| **Noticeboard Attachments & Polls** | `PARTIAL` | Announcements lacked real Storage bucket upload/download; Polls lacked Close/Reopen and Delete actions/UI. | `WORKING` |
| **Chores, Rewards & Challenges** | `PARTIAL` | Create + complete/redeem existed, but Chore Templates, Rewards, and Challenges lacked Update/Delete actions and UI controls. | `WORKING` |
| **Memory Albums** | `PARTIAL` | Album creation & sharing toggle existed, but `updateAlbumSharingAction` lacked Zod validation and Albums lacked Edit/Delete. | `WORKING` |
| **Budgets, Bills & Schedules** | `PARTIAL` | Create & pay/run existed, but Budgets, Bills, and Recurring Schedules lacked Update/Delete actions & UI. | `WORKING` |
| **Finance Goals & Debts** | `PARTIAL` | Create & contribute/settle existed, but Goals lacked Update/Delete and Debts lacked Delete. | `WORKING` |
| **Home Management** | `PARTIAL` | Assets, Maintenance Tasks, and Service Providers had Create + Complete only; lacked Edit/Delete. | `WORKING` |
| **Inventory** | `PARTIAL` | Create + +/- adjust existed (`Number(qty) \|\| 1` prevented 0); lacked Edit/Delete item actions & UI. | `WORKING` |
| **Meals & Recipes** | `PARTIAL` | Create plan/recipe + sync to shopping existed; Meal Plans and Recipes lacked Edit/Delete. | `WORKING` |
| **Child Development** | `PARTIAL` | Profiles, Growth, Milestones, Education, and Health had Add-only flows (except Attachments which already had Storage CRUD). | `WORKING` |
| **Shopping / Calendar / Chat / Habits / Documents** | `WORKING` | Core CRUD + permissions already implemented and verified in S1–S3. | `WORKING` |
| **Live RLS & Authenticated E2E** | `NOT_IMPLEMENTED` (Env Blocked) | No local Docker/Supabase/psql or disposable test DB available in environment. | `BLOCKED` |

---

## 3. AI Assistant Integration Fixes

- **`src/features/ai/provider.ts`**: Added `history?: Array<{ role: "user" | "assistant"; content: string }>` to `generateAiAssistantResponse` and forwarded the last 10 turns to OpenAI `messages`.
- **`src/app/api/ai/stream/route.ts`**:
  - Loads last 10 `ai_messages` for multi-turn context.
  - Persists `ai_conversations` / user + assistant `ai_messages` **only after** generation succeeds (prevents orphan user messages on error/cancellation).
  - Emits true SSE frames (`data: {"type":"delta",...}` and `data: {"type":"done",...}`).
- **`src/features/ai/actions.ts`**:
  - `sendAiPromptAction`: forwards multi-turn `history` and persists user + assistant messages post-generation.
  - `confirmAiProposedAction`: validates server-side permissions per action type (`shopping.manage` for `create_shopping_items`, `tasks.manage_all` for `create_task`, `calendar.family.manage` for `create_calendar_event`), atomically claims `action_status = "confirmed"`, and rolls `action_status` back to `"pending_confirmation"` if the domain insert fails.
- **`src/features/ai/components/family-ai-view.tsx`**:
  - Wired `submitPrompt` to `fetch("/api/ai/stream")` with incremental SSE parsing, `AbortController` cancellation button, and rollback restoring `failedPrompt` on error.
  - Replaced hardcoded `"AI generation cancelled."` toast literal with `te("AI generation cancelled.")` so `i18n.test.ts` passes cleanly.

---

## 4. Real Storage Attachments & Migration `0037`

- **`supabase/migrations/0037_task_and_noticeboard_storage.sql`**:
  - Created private Storage buckets `family-tasks` and `family-noticeboard` (10 MB limit, PDF/JPEG/PNG/WebP).
  - Added `family_announcements.attachment_storage_path`.
  - Added family-scoped Storage RLS policies (`tasks` and `noticeboard` path prefix isolation).
- **Tasks (`src/features/tasks/actions.ts`, `src/features/tasks/components/family-tasks-view.tsx`)**:
  - Implemented `uploadTaskAttachmentAction` (`FormData` validation + Storage upload + DB row), `getTaskAttachmentSignedUrlAction` (60s signed URL), and `deleteTaskAttachmentAction` (DB delete + Storage `.remove()` orphan cleanup).
- **Noticeboard (`src/features/noticeboard/server.ts`, `src/features/noticeboard/actions.ts`, `src/features/noticeboard/components/family-noticeboard-view.tsx`)**:
  - Implemented `uploadAnnouncementAttachmentAction`, `getAnnouncementAttachmentSignedUrlAction`, and Storage cleanup on announcement delete.
  - Added `closePollAction` and `deletePollAction` with creator/admin authorization and affected-row checks.

---

## 5. CRUD Completions Across Core Modules

### A. Chores, Rewards, Challenges & Memory Albums
- `src/features/chores/actions.ts` & `src/features/chores/components/chores-rewards-view.tsx`: Added `updateChoreTemplateAction`, `deleteChoreTemplateAction`, `updateRewardAction`, `deleteRewardAction`, `deleteFamilyChallengeAction`, and wired Edit/Delete controls + modal reuse.
- `src/features/memories/actions.ts` & `src/features/memories/components/family-memories-view.tsx`: Added Zod validation to `updateAlbumSharingAction`, added `updateAlbumAction` & `deleteAlbumAction`, and wired Edit Album `BottomSheet` + Delete controls.

### B. Budgets, Bills, Schedules, Goals & Debts
- `src/features/finance/budget-actions.ts` & `src/features/finance/components/family-budgets-bills-view.tsx`: Added `updateBudgetAction`, `deleteBudgetAction`, `updateBillAction`, `deleteBillAction`, `deleteRecurringScheduleAction` (using `hasFinanceManagePerm` and `.select("id").maybeSingle()`), plus Edit/Delete UI buttons.
- `src/features/finance/analytics-actions.ts` & `src/features/finance/components/family-analytics-view.tsx`: Added `updateFinanceGoalAction`, `deleteFinanceGoalAction`, `deleteDebtReceivableAction`, plus Edit/Delete UI controls.

### C. Household (Home Management, Inventory & Meals)
- `src/features/household/schemas.ts` & `src/features/household/actions.ts`: Added Update/Delete schemas & actions for Inventory Items (`inventory.manage`), Recipes & Meal Plans (`meals.manage`), and Home Assets, Maintenance Tasks & Service Providers (`home.manage`), all enforcing `.eq("family_id", ...)` + `.select("id").maybeSingle()`.
- `src/features/household/components/home-view.tsx`, `inventory-view.tsx`, `meals-view.tsx`: Wired Edit/Delete buttons and modal reuse; fixed `inventory-view.tsx` quantity/threshold parsing with `Number.isFinite(...)` so `0` is preserved instead of coercing to `1`.

### D. Child Development
- `src/features/child-dev/schemas.ts`, `src/features/child-dev/actions.ts`, `src/features/child-dev/components/child-development-view.tsx`:
  - Added `updateChildProfileAction` / `deleteChildProfileAction` (`child_dev.manage`).
  - Added `updateGrowthRecordAction` / `deleteGrowthRecordAction`, `updateMilestoneAction` / `deleteMilestoneAction`, `updateEducationRecordAction` / `deleteEducationRecordAction` (`child_dev.growth_milestones.manage`).
  - Added `updateHealthRecordAction` / `deleteHealthRecordAction` (`child_dev.health.view`).
  - Wired Edit/Delete controls and modal reuse guarded by the respective permission flags.

---

## 6. Verification Results

All checks below were executed **after the final edit**:

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | **PASS** (0 errors) |
| ESLint | `npm run lint` | **PASS** (0 errors) |
| Unit & Regression Tests | `npm test -- --run` | **PASS** (**37 test files passed, 167 tests passed**, including new `src/features/ai/__tests__/s4-crud-and-ai-regressions.test.ts`) |
| Migration Security Audit | `npm run db:validate` | **PASS** (**37 migrations, 78 RLS-forced tables, 25 hardened SECURITY DEFINER functions**, zero unrestricted policies) |
| Non-Mutating Playwright E2E | `npx playwright test e2e/smoke-and-pwa.spec.ts e2e/mobile-m1.spec.ts e2e/modal-focus.spec.ts e2e/mobile-m6-pwa.spec.ts` | **PASS** (**30/30 tests passed** in 53.0s) |
| Live DB / Storage RLS Tests | `npm run test:rls` | **BLOCKED** (Docker daemon stopped; `supabase` CLI and `psql` not installed; no disposable `TEST_DATABASE_URL`) |
| Authenticated Mutating E2E | `e2e/aud-001..003`, `e2e/mobile-m2/m4/m5/m7` | **BLOCKED** (requires disposable Supabase test project & `E2E_SUPABASE_SERVICE_ROLE_KEY`; production DB never mutated) |

---

## 7. Debt & Verdict (`S4_IMPLEMENTED_WITH_DEBT`)

- **Implemented:** Full CRUD, Storage upload/signed-download/delete + orphan cleanup, AI SSE streaming + multi-turn history + permission-checked action execution, and mocked Vitest regression coverage.
- **Remaining Debt (Environment Blocker):** Live execution of migration `0037_task_and_noticeboard_storage.sql`, PostgreSQL/Storage RLS tests, and authenticated browser E2E flows against a disposable Supabase instance must be run once Docker/Supabase local or a staging/test DB is provisioned.

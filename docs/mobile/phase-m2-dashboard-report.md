# Famora — Phase M2: Premium Mobile Dashboard Experience Report

**Verdict:** `MOBILE_M2_VERIFIED_WITH_BLOCKERS`
**Date:** 2026-11-23

---

## 1. Current Dashboard Structure Inspected

- **Route:** `src/app/(app)/f/[familyId]/page.tsx` (`FamilyDashboardPage`) enforces `requireAuthenticatedUser()` and calls `getFamilyDashboardData(familyId, user.id)`.
- **Server Loader:** `src/features/dashboard/server.ts` executes parallel Supabase queries (`profiles`, `families`, `get_my_family_permissions`, `family_members`, `calendar_events`, `tasks`, `family_announcements`, `shopping_items`) and conditionally queries `finance_accounts` / `finance_transactions` (`finance.accounts.manage` or `finance.transactions.manage`) and `activity_logs` (`audit_logs.view`).
- **Actions:** `src/features/dashboard/actions.ts` provides `quickAddTaskAction`, `quickAddShoppingItemAction`, `toggleShoppingItemAction`, and (added in M2) `quickCompleteTaskAction`.
- **View Defect Fixed:** `family-dashboard-view.tsx` previously computed `effectiveData` (offline IndexedDB fallback) but rendered `data` in its JSX sections. Updated all sections to read `effectiveData`, and added an `<ErrorState>` fallback when `!effectiveData.family`.

---

## 2. Mobile-First Dashboard Design & Desktop Parity

### Mobile Hierarchy (`< 1024px`, single-column)
1. **Welcome Header (Section A):** Compact card (`p-4 sm:p-6`) displaying family badge, role badge, localized today's date, personalized greeting, notification bell link (`h-11 w-11` -> `/notifications`), compact profile link (`h-11 w-11` -> `/account`), member avatar stack, and **Quick Actions** (`quickTaskBtn`, `addGroceryBtn`, `directoryBtn`).
2. **Family Overview (Section B):** 2x2 mobile (`sm:grid-cols-4`) interactive summary cards linking to Calendar (`Today's Events`), Tasks (`Open Tasks`), Shopping (`Shopping Left`), and Family Members (`Members`).
3. **Today's Agenda (Section C):** Today's scheduled events + upcoming week cards + `Full calendar` link (`min-h-11`).
4. **Tasks & Chores (Section D):** Pending tasks with `Assigned to you` (`isAssignedToMe`) highlight, due dates, priority badges, and a `44x44px` quick-complete button (`quickCompleteTaskAction`) when authorized.
5. **Finance Overview (Section E):** Permission-gated (`effectiveData.financeSummary !== null`), showing combined balance, `BudgetRing`, and `Open finance` link.
6. **Shopping (Section F):** Pending item count + `min-h-11` tap-to-check items + `All shopping` link.
7. **Family Updates (Section G):** Announcements with `Noticeboard` link + permission-gated `Recent Activity`.

### Desktop Parity (`>= 1024px`)
- Preserves the 2-column split (`lg:grid-cols-[1.55fr_1fr]`): left column renders `Today's Agenda`, `Family Announcements`, and `Recent Activity`; right column renders `Finance Overview`, `Tasks & Chores`, and `Shopping`.

---

## 3. Files Changed & Added

- `src/features/dashboard/server.ts` (added `isAssignedToMe` flag on `DashboardTask`)
- `src/features/dashboard/actions.ts` (added `quickCompleteTaskAction`)
- `src/features/dashboard/components/family-dashboard-view.tsx` (mobile-first hierarchy, `effectiveData` offline rendering, `ErrorState` fallback, `44x44px` touch targets, desktop split preservation)
- `src/lib/i18n/messages.ts` (18 new `dashboard.*` keys in `id` & `en`)
- `src/features/dashboard/__tests__/dashboard.test.ts` (added `isAssignedToMe` & `quickCompleteTaskAction` tests)
- `e2e/mobile-m2-dashboard.spec.ts` (6-viewport fail-closed overflow checks + authenticated mobile/desktop dashboard spec)
- `docs/mobile/phase-m2-dashboard-report.md`
- `docs/mobile/mobile-defect-register.md`

---

## 4. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| TypeScript | `npm --prefix famora run typecheck` | **PASS** (`0` errors) |
| ESLint | `npm --prefix famora run lint` | **PASS** (`0` errors) |
| Unit Tests | `npm --prefix famora test` | **PASS** (`33` test files, `145` tests passed, including `dashboard.test.ts` `4/4`) |
| Production Build | `npm --prefix famora run build` | **PASS** |
| Playwright E2E | `npm --prefix famora run test:e2e` | **20 passed, 4 skipped** (`29.6s`): unauthenticated `/f/<id>` fail-closed & zero overflow passed across `320x720`, `360x800`, `375x812`, `390x844`, `430x932`, `1280x800`, alongside `mobile-m1`, `modal-focus`, and `smoke-and-pwa`; `4` authenticated specs (including authenticated dashboard E2E) skipped without Supabase admin credentials |

---

## 5. Remaining Blockers

- **Live Authenticated Dashboard Browser Verification (`BLOCKED`):** Live rendering of `/f/[familyId]` across `320x720`–`1280x800` and live screenshots of the authenticated dashboard could not be captured because `E2E_SUPABASE_URL` / `E2E_SUPABASE_SERVICE_ROLE_KEY` test credentials are not configured in this environment. Server logic and authorization are verified via `dashboard.test.ts` (`4/4` mocked unit tests) and `typecheck`/`build`.
